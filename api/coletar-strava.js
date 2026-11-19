// Robô Strava Clubes: busca eventos futuros de cada clube monitorado e cria rascunhos em corridas_pendentes.
// Roda via cron diário ou manualmente pelo admin.

const { ehAgendamento, ehAdmin } = require('./_seguranca.js');

const SUPABASE_URL = 'https://ssfsxdmzbubvygctdjgf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_s2yoUApfYl_ZvSUkqYYrVw_uXwKsybM';

const slug = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
const limpar = (s) => String(s || '').replace(/\s+/g, ' ').trim();

// ─── SUPABASE ─────────────────────────────────────────────────────────────────

async function sbGet(path, params = {}) {
  const u = new URL(`${SUPABASE_URL}/rest/v1/${path}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const r = await fetch(u.toString(), {
    headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${SUPABASE_KEY}`, accept: 'application/json' }
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`Supabase GET ${path}: ${r.status} ${j?.message || ''}`);
  return j;
}

async function rpc(nome, corpo, chave = SUPABASE_KEY) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${nome}`, {
    method: 'POST',
    headers: { apikey: chave, authorization: `Bearer ${chave}`, 'content-type': 'application/json' },
    body: JSON.stringify(corpo)
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`Supabase rpc ${nome}: ${r.status} ${j?.message || ''}`);
  return j;
}

// ─── STRAVA AUTH ──────────────────────────────────────────────────────────────

async function obterAccessToken() {
  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!clientId || !clientSecret) throw new Error('STRAVA_CLIENT_ID ou STRAVA_CLIENT_SECRET não configurados.');
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_KEY não configurado.');

  // busca refresh_token usando service role (sem JWT de usuário)
  const refreshToken = await rpc('strava_token_servico', {}, serviceKey);
  if (!refreshToken) throw new Error('Nenhum token do Strava salvo. Conecte o Strava no admin primeiro.');

  const r = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }),
    signal: AbortSignal.timeout(15000)
  });
  const t = await r.json().catch(() => null);
  if (!r.ok || !t?.access_token) throw new Error(`Strava token: ${r.status} ${t?.message || ''}`);

  // se o Strava trocou o refresh token, salva o novo com service role
  if (t.refresh_token && t.refresh_token !== refreshToken) {
    await rpc('strava_salvar_token_servico', { t: t.refresh_token }, serviceKey).catch(() => null);
  }
  return t.access_token;
}

// ─── STRAVA API ───────────────────────────────────────────────────────────────

async function buscarEventosClubeStrava(clubeSlug, accessToken) {
  const r = await fetch(`https://www.strava.com/api/v3/clubs/${encodeURIComponent(clubeSlug)}/group_events`, {
    headers: { authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(15000)
  });
  if (r.status === 404) { console.warn(`[Strava] Clube ${clubeSlug}: não encontrado (404). Verifique se o usuário é membro.`); return []; }
  if (!r.ok) { console.warn(`[Strava] Clube ${clubeSlug}: HTTP ${r.status}`); return []; }
  return (await r.json().catch(() => [])) || [];
}

// ─── CONVERSÃO ────────────────────────────────────────────────────────────────

const hoje = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);

function eventosParaItens(eventos, clubeNome) {
  const itens = [];
  for (const ev of eventos) {
    if (!ev.upcoming_occurrences?.length) continue;
    const nome = limpar(ev.title || ev.name || '');
    if (!nome) continue;
    const cidade = limpar(ev.city || '');
    const estado = limpar(ev.state || '');
    const lat = ev.latitude || null;
    const lng = ev.longitude || null;

    for (const ocorrencia of ev.upcoming_occurrences) {
      const data = String(ocorrencia).slice(0, 10); // YYYY-MM-DD
      if (data < hoje()) continue;

      const eventoId = `${ev.id}-${data}`;
      itens.push({
        chave: `strava-${slug(nome)}-${data}`,
        strava_event_id: eventoId,
        nome,
        cidade,
        estado: estado.length === 2 ? estado.toUpperCase() : null,
        data,
        lat: lat && Math.abs(lat) > 0.001 ? lat : null,
        lng: lng && Math.abs(lng) > 0.001 ? lng : null,
        local_largada: limpar(ev.address || ''),
        organizador: clubeNome || null,
        distancias: null,
        link_inscricao: `https://www.strava.com/clubs/${ev.club_id}/group_events/${ev.id}`,
        fonte: 'Strava Clubes',
        fonte_url: `https://www.strava.com/clubs/${ev.club_id}`
      });
    }
  }
  return itens;
}

// ─── DEDUPLICAÇÃO LOCAL ───────────────────────────────────────────────────────

async function filtrarJaExistentes(itens) {
  if (!itens.length) return [];
  const ids = itens.map((i) => i.strava_event_id);

  // verifica corridas publicadas
  const { data: publ } = await sbGet('corridas', {
    select: 'strava_event_id',
    'strava_event_id': `in.(${ids.map((id) => `"${id}"`).join(',')})`,
    strava_event_id: `in.(${ids.join(',')})`
  }).catch(() => ({ data: [] }));

  // verifica pendentes
  const { data: pend } = await sbGet('corridas_pendentes', {
    select: 'strava_event_id',
    strava_event_id: `in.(${ids.join(',')})`
  }).catch(() => ({ data: [] }));

  const existentes = new Set([
    ...(publ || []).map((r) => r.strava_event_id),
    ...(pend || []).map((r) => r.strava_event_id)
  ]);
  return itens.filter((i) => !existentes.has(i.strava_event_id));
}

// ─── COLETA PRINCIPAL ─────────────────────────────────────────────────────────

async function coletarStrava() {
  const token = process.env.ROBO_TOKEN;
  if (!token) throw new Error('ROBO_TOKEN não configurado.');

  const logId = await rpc('robo_log_inicio', {
    p_token: token, p_rota: 'coletar-strava', p_parametros: 'clubes', p_origem: 'agendado'
  }).catch(() => null);

  const logFim = (ok, resultado, erro) => rpc('robo_log_fim', {
    p_token: token, p_id: logId, p_ok: ok, p_resultado: resultado, p_erro: erro
  }).catch(() => null);

  try {
    // busca clubes ativos
    const clubes = await sbGet('strava_clubes', { select: 'id,slug,nome', ativo: 'eq.true' });
    if (!clubes?.length) {
      console.log('[Strava] Nenhum clube ativo configurado.');
      await logFim(true, { coletados: 0, novos: 0 }, null);
      return { coletados: 0, novos: 0 };
    }

    const accessToken = await obterAccessToken();
    const todosItens = [];

    for (const clube of clubes) {
      const eventos = await buscarEventosClubeStrava(clube.slug, accessToken);
      console.log(`[Strava] Clube ${clube.slug}: ${eventos.length} eventos`);
      const itens = eventosParaItens(eventos, clube.nome);
      todosItens.push(...itens);
    }

    if (!todosItens.length) {
      await logFim(true, { coletados: 0, novos: 0 }, null);
      return { coletados: 0, novos: 0 };
    }

    // deduplicação via strava_event_id (rápida, sem depender de robo_novos)
    const novos = await filtrarJaExistentes(todosItens);
    console.log(`[Strava] ${todosItens.length} ocorrências → ${novos.length} novas`);

    // insere usando robo_inserir_pendentes (campo extra strava_event_id é ignorado pela função; inserimos separado)
    let inseridas = 0;
    if (novos.length) {
      // robo_novos para deduplicar por nome+data+cidade também
      const novosChaves = new Set(await rpc('robo_novos', {
        p_token: token,
        p_itens: novos.map(({ chave, nome, cidade, data, link_inscricao }) => ({ chave, nome, cidade, data, link_inscricao }))
      }));
      const paraInserir = novos.filter((i) => novosChaves.has(i.chave));
      if (paraInserir.length) {
        inseridas = await rpc('robo_inserir_pendentes', { p_token: token, p_itens: paraInserir });
        // atualiza strava_event_id nas recém-inseridas
        await Promise.all(paraInserir.map((i) =>
          fetch(`${SUPABASE_URL}/rest/v1/corridas_pendentes?chave=eq.${encodeURIComponent(i.chave)}`, {
            method: 'PATCH',
            headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${SUPABASE_KEY}`, 'content-type': 'application/json', prefer: 'return=minimal' },
            body: JSON.stringify({ strava_event_id: i.strava_event_id })
          }).catch(() => null)
        ));
      }
    }

    await logFim(true, { coletados: todosItens.length, novos: inseridas }, null);
    return { coletados: todosItens.length, novos: inseridas };
  } catch (e) {
    await logFim(false, null, e.message);
    throw e;
  }
}

// ─── HANDLER VERCEL ───────────────────────────────────────────────────────────

module.exports = async (req, res) => {
  const autorizado = ehAgendamento(req) || await ehAdmin(req);
  if (!autorizado) return res.status(401).json({ erro: 'não autorizado' });
  try {
    const r = await coletarStrava();
    return res.status(200).json(r);
  } catch (e) {
    console.error('[coletar-strava]', e.message);
    return res.status(500).json({ erro: e.message });
  }
};
