// Robô Ticket Sports (ticketsports.com.br / ticketagora)
// Coleta provas de corrida de rua do calendário da plataforma.
//
// API descoberta por DevTools (Fetch/XHR na página /calendar/filters):
//   GET /api/events/list?quantity=N&atlheteId=0&term=&country=BR&region=UF
// A resposta NÃO inclui o tipo de modalidade — filtra-se pelo título.
// Campos confirmados: title, date (DD/MM/YYYY), address ("Cidade, UF"),
//                     organizer, uri (link), eventId, status

const { ehAgendamento } = require('./_seguranca.js');

// ─── CONSTANTES ───────────────────────────────────────────────────────────────

const BASE_API_URL = 'https://www.ticketsports.com.br/api';
const SUPABASE_URL = 'https://ssfsxdmzbubvygctdjgf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_s2yoUApfYl_ZvSUkqYYrVw_uXwKsybM';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const QUANTIDADE = 300;
const UFS = [
  'AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT',
  'PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'
];

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const limpar = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const slug = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);

async function rpc(nome, corpo) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${nome}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      authorization: `Bearer ${SUPABASE_KEY}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify(corpo)
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`Supabase ${nome}: ${r.status} ${j && j.message ? j.message : ''}`);
  return j;
}

// ─── BUSCA POR ESTADO ─────────────────────────────────────────────────────────

async function buscarPorEstado(uf) {
  const params = new URLSearchParams({
    quantity: String(QUANTIDADE),
    atlheteId: '0',
    term: '',
    country: 'BR',
    region: uf,
  });
  const url = `${BASE_API_URL}/events/list?${params}`;
  const r = await fetch(url, {
    headers: {
      'user-agent': UA,
      'accept': '*/*',
      'accept-language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      'referer': `https://www.ticketsports.com.br/calendar/filters?modalidade=corrida-de-rua&estado=${uf}`
    }
  });
  if (!r.ok) {
    console.warn(`[TicketSports] ${uf}: HTTP ${r.status}`);
    return [];
  }
  const data = await r.json().catch(() => null);
  if (!data) return [];

  if (process.env.DEBUG_TS && uf === 'SP') {
    console.log(`[TicketSports] Amostra SP:`, JSON.stringify(data).slice(0, 600));
  }

  return Array.isArray(data) ? data : [];
}

// ─── FILTRO DE MODALIDADE (pelo título, pois a API não retorna o tipo) ────────

// Palavras que indicam corrida
const RE_CORRIDA = /\b(corrida|run|trail|maratona|meia.?maratona|maratoninha|night|corrida|km)\b/i;
// Palavras que indicam NÃO é corrida (evita falsos positivos)
const RE_EXCLUIR = /\bnatação|natacao|ciclismo|beach.?tennis|futev[oô]lei|canoagem\b/i;

function ehCorridaDeRua(titulo) {
  if (RE_EXCLUIR.test(titulo)) return false;
  return RE_CORRIDA.test(titulo);
}

// ─── PARSER DE EVENTO ─────────────────────────────────────────────────────────

function parsearEvento(ev, uf) {
  const nome = limpar(ev.title || '');
  if (!nome) return null;

  // Data: "14/11/2026" → "2026-11-14"
  const dataBruta = String(ev.date || '');
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(dataBruta)) return null;
  const [d, m, a] = dataBruta.split('/');
  const data = `${a}-${m}-${d}`;

  // Só provas futuras
  const hoje = new Date(Date.now() - 3 * 3600e3);
  if (new Date(data) < hoje) return null;

  // Só eventos abertos
  if (ev.status && ev.status !== 'Aberto') return null;

  // address: "São Paulo, SP" ou "Campinas, SP"
  const addr = limpar(ev.address || '');
  const separador = addr.lastIndexOf(',');
  const cidade = separador > 0 ? addr.slice(0, separador).trim() : addr;
  const estado = separador > 0 ? addr.slice(separador + 1).trim().toUpperCase() : uf;

  // Distâncias: tentar extrair do título (ex: "5KM", "21K", "42K")
  const distMatch = nome.match(/\b(\d+(?:[.,]\d+)?)\s*(?:KM?)\b/gi);
  const distancias = distMatch
    ? [...new Set(distMatch.map((d) => d.toUpperCase().replace(',', '.').replace(/KM$/, 'K')))].join(', ')
    : null;

  return {
    chave: `${slug(nome)}-${data}`,
    nome,
    cidade,
    estado,
    data,
    distancias,
    local_largada: null,
    organizador: limpar(ev.organizer || ''),
    link_inscricao: limpar(ev.uri || '') || (ev.eventId ? `https://www.ticketsports.com.br/e/${ev.eventId}` : null),
    fonte: 'Ticket Sports',
    fonte_url: `https://www.ticketsports.com.br/calendar/filters?modalidade=corrida-de-rua&estado=${estado}`
  };
}

// ─── COLETA PRINCIPAL ─────────────────────────────────────────────────────────

async function coletarTicketSports() {
  const token = process.env.ROBO_TOKEN;
  if (!token) throw new Error('ROBO_TOKEN não configurado');

  const inicio = Date.now();
  const logId = await rpc('robo_log_inicio', {
    p_token: token,
    p_rota: 'coletar-ticketsports',
    p_parametros: 'padrão',
    p_origem: 'agendado'
  }).catch(() => null);

  const logFim = (ok, resultado, erro) => logId
    ? rpc('robo_log_fim', { p_token: token, p_id: logId, p_ok: ok, p_resultado: resultado, p_erro: erro || null }).catch(() => null)
    : null;

  try {
    const todos = [];

    for (const uf of UFS) {
      const lista = await buscarPorEstado(uf);
      let corridas = 0;

      for (const ev of lista) {
        if (!ehCorridaDeRua(ev.title || '')) continue;
        const item = parsearEvento(ev, uf);
        if (item) { todos.push(item); corridas++; }
      }

      if (lista.length) {
        console.log(`[TicketSports] ${uf}: ${lista.length} eventos → ${corridas} corridas`);
      }

      await dormir(300);
    }

    if (!todos.length) {
      console.log('[TicketSports] Nenhuma corrida encontrada');
      await logFim(true, { coletados: 0, novos: 0 }, null);
      return { coletados: 0, novos: 0 };
    }

    // Deduplicação local por chave
    const unicos = Object.values(Object.fromEntries(todos.map((e) => [e.chave, e])));
    console.log(`[TicketSports] ${unicos.length} corridas únicas`);

    // robo_novos: verifica nome+data+cidade (similaridade) E link_inscricao contra corridas e corridas_pendentes
    const novosChaves = new Set(await rpc('robo_novos', {
      p_token: token,
      p_itens: unicos.map(({ chave, nome, cidade, data, link_inscricao }) => ({ chave, nome, cidade, data, link_inscricao }))
    }));
    const novos = unicos.filter((e) => novosChaves.has(e.chave));

    const inseridas = novos.length
      ? await rpc('robo_inserir_pendentes', { p_token: token, p_itens: novos })
      : 0;

    await logFim(true, { coletados: unicos.length, novos: inseridas }, null);
    console.log(`[TicketSports] ${inseridas} novos de ${unicos.length} coletados`);
    return { coletados: unicos.length, novos: inseridas };
  } catch (e) {
    await logFim(false, null, e.message);
    throw e;
  }
}

module.exports = { coletarTicketSports };

// Execução direta: DEBUG_TS=1 node api/coletar-ticketsports.js
if (require.main === module) {
  if (!ehAgendamento()) { console.error('Negado'); process.exit(1); }
  coletarTicketSports().then(console.log).catch(console.error);
}
