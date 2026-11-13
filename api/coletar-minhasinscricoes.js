// Robô Minhas Inscrições (minhasinscricoes.com.br)
// Lê a mesma API que a página /calendario usa:
//   GET /api/eventos?offset=N&limit=24&realization=upcoming&sort=upcoming_first&type=...
// Resposta: { items, total, nextOffset }. O servidor limita cada página a 24 itens.
// Campos usados: name, location ("Cidade - UF"), eventDate (meia-noite de Brasília em UTC),
//                categories, link, href, portal

const { ehAgendamento } = require('./_seguranca.js');

const SITE = 'https://www.minhasinscricoes.com.br';
const SUPABASE_URL = 'https://ssfsxdmzbubvygctdjgf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_s2yoUApfYl_ZvSUkqYYrVw_uXwKsybM';
const UA = 'Mozilla/5.0 (compatible; MapmoveBot/1.0; +https://mapmove.com.br)';

const TIPOS = ['corrida de rua', 'trail run', 'ultramaratona'];
const CATEGORIAS_ACEITAS = new Set(TIPOS.map((t) => t.toUpperCase()));
const POR_PAGINA = 24;
const MAX_PAGINAS = 40;
const LOTE = 400; // limite do robo_inserir_pendentes
// a categoria do site nem sempre é confiável: virtuais, travessias e MTB aparecem como corrida de rua
const RE_EXCLUIR = /\b(virtual|virtuais|travessias?|xcm|mtb)\b/i;
// o mesmo evento é listado uma vez por forma de pagamento
const RE_PAGAMENTO = /\s+-\s+(boleto e pix|boleto|pix|cart[aã]o)$/i;

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const limpar = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const slug = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);

async function rpc(nome, corpo) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${nome}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${SUPABASE_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify(corpo)
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`Supabase ${nome}: ${r.status} ${j && j.message ? j.message : ''}`);
  return j;
}

async function buscarPagina(offset) {
  const params = new URLSearchParams({ offset: String(offset), limit: String(POR_PAGINA), realization: 'upcoming', sort: 'upcoming_first' });
  TIPOS.forEach((t) => params.append('type', t));
  const r = await fetch(`${SITE}/api/eventos?${params}`, {
    headers: { 'user-agent': UA, accept: 'application/json', 'accept-language': 'pt-BR' },
    signal: AbortSignal.timeout(15000)
  });
  if (!r.ok) throw new Error(`Minhas Inscrições: HTTP ${r.status} no offset ${offset}`);
  const j = await r.json();
  if (!j || !Array.isArray(j.items)) throw new Error(`Minhas Inscrições: resposta sem lista no offset ${offset}`);
  return j;
}

async function buscarTodos() {
  const itens = [];
  let offset = 0;
  for (let p = 0; p < MAX_PAGINAS && offset != null; p++) {
    const pg = await buscarPagina(offset);
    itens.push(...pg.items);
    if (!pg.items.length || pg.nextOffset == null || pg.nextOffset <= offset) break;
    offset = pg.nextOffset;
    await dormir(400);
  }
  return itens;
}

function parsearEvento(ev, hojeISO) {
  const nome = limpar(ev.name).replace(RE_PAGAMENTO, '');
  if (!nome || RE_EXCLUIR.test(nome)) return null;

  const cats = (ev.categories || [ev.category]).filter(Boolean).map((c) => String(c).toUpperCase());
  if (!cats.some((c) => CATEGORIAS_ACEITAS.has(c)) || cats.includes('DESAFIO VIRTUAL')) return null;

  // eventDate vem como meia-noite de Brasília em UTC (ex.: 2026-11-14T03:00:00Z)
  const t = Date.parse(ev.eventDate);
  if (Number.isNaN(t)) return null;
  const data = new Date(t - 3 * 3600e3).toISOString().slice(0, 10);
  if (data < hojeISO) return null;

  const m = limpar(ev.location).match(/^(.+?)\s+-\s+([A-Za-z]{2})$/);
  if (!m) return null;

  // Plataforma antiga (V1): o "link" é um redirecionador que conta cliques; usa-se a página do evento
  const direto = /^https?:\/\//i.test(ev.link || '') && !/ClickEventos\/Redirecionar/i.test(ev.link);
  const pagina = ev.href ? `${SITE}${ev.href}` : null;
  const link = direto ? ev.link : pagina;
  if (!link) return null;

  const dist = nome.match(/\b\d+(?:[.,]\d+)?\s*KM?\b/gi);
  const distancias = dist
    ? [...new Set(dist.map((d) => d.toUpperCase().replace(/\s+/g, '').replace(',', '.').replace(/KM$/, 'K')))].join(', ')
    : null;

  return {
    chave: `${slug(nome)}-${data}`,
    nome,
    cidade: m[1],
    estado: m[2].toUpperCase(),
    data,
    distancias,
    local_largada: null,
    organizador: limpar(ev.organizerName) || null,
    link_inscricao: link,
    fonte: 'Minhas Inscrições',
    fonte_url: pagina || `${SITE}/calendario`
  };
}

async function coletarItens() {
  const hojeISO = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
  const brutos = await buscarTodos();
  const itens = brutos.map((ev) => parsearEvento(ev, hojeISO)).filter(Boolean);
  return { brutos: brutos.length, unicos: Object.values(Object.fromEntries(itens.map((e) => [e.chave, e]))) };
}

async function coletarMinhasInscricoes() {
  const token = process.env.ROBO_TOKEN;
  if (!token) throw new Error('ROBO_TOKEN não configurado');

  const logId = await rpc('robo_log_inicio', { p_token: token, p_rota: 'coletar-minhasinscricoes', p_parametros: 'padrão', p_origem: 'agendado' }).catch(() => null);
  const logFim = (ok, resultado, erro) => logId
    ? rpc('robo_log_fim', { p_token: token, p_id: logId, p_ok: ok, p_resultado: resultado, p_erro: erro || null }).catch(() => null)
    : null;

  try {
    const { unicos } = await coletarItens();
    let inseridas = 0;
    for (let i = 0; i < unicos.length; i += LOTE) {
      const lote = unicos.slice(i, i + LOTE);
      const novosChaves = new Set(await rpc('robo_novos', {
        p_token: token,
        p_itens: lote.map(({ chave, nome, cidade, data, link_inscricao }) => ({ chave, nome, cidade, data, link_inscricao }))
      }));
      const novos = lote.filter((e) => novosChaves.has(e.chave));
      if (novos.length) inseridas += await rpc('robo_inserir_pendentes', { p_token: token, p_itens: novos });
    }
    const resultado = { coletados: unicos.length, novos: inseridas };
    await logFim(true, resultado, null);
    console.log(`[MinhasInscricoes] ${inseridas} novos de ${unicos.length} coletados`);
    return resultado;
  } catch (e) {
    await logFim(false, null, e.message);
    throw e;
  }
}

module.exports = async (req, res) => {
  if (!ehAgendamento(req)) return res.status(401).json({ erro: 'não autorizado' });
  try {
    const resultado = await coletarMinhasInscricoes();
    res.status(200).json({ quando: new Date().toISOString(), ...resultado });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
};

module.exports.coletarMinhasInscricoes = coletarMinhasInscricoes;
module.exports.parsearEvento = parsearEvento;

// Simulação local (só lê o site, não grava nada): node api/coletar-minhasinscricoes.js
if (require.main === module) {
  coletarItens().then(({ brutos, unicos }) => {
    console.log(`${brutos} eventos lidos → ${unicos.length} corridas`);
    console.log(JSON.stringify(unicos.slice(0, 3), null, 1));
  }).catch((e) => { console.error(e.message); process.exit(1); });
}
