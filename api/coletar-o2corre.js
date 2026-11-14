// Robô O2 Corre (www.o2corre.com.br)
// Lê o calendário via __NEXT_DATA__ na página /calendario/
// Resolve cidades/estados/modalidades via GraphQL da Magento (www.runningland.com.br/graphql)
// Link de inscrição: https://www.runningland.com.br/{url_key}

const { ehAgendamento } = require('./_seguranca.js');

const SITE = 'https://www.o2corre.com.br';
const GRAPHQL = 'https://www.runningland.com.br/graphql';
const SUPABASE_URL = 'https://ssfsxdmzbubvygctdjgf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_s2yoUApfYl_ZvSUkqYYrVw_uXwKsybM';
const UA = 'Mozilla/5.0 (compatible; MapmoveBot/1.0; +https://mapmove.com.br)';

const TIPOS_ACEITOS = new Set(['corrida de rua', 'triathlon', 'trail run']);
const LOTE = 400;

const limpar = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const slug = (t) =>
  String(t)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);

async function rpc(nome, corpo) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${nome}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      authorization: `Bearer ${SUPABASE_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(corpo),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`Supabase ${nome}: ${r.status} ${j?.message || ''}`);
  return j;
}

async function buscarAtributos() {
  const query = `query productCustomAttributeValues($codes: [String!]!) {
    productCustomAttributeValues(input: { code: $codes }) {
      attributes { code listValues { id value } }
    }
  }`;
  const r = await fetch(GRAPHQL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: SITE,
      'user-agent': UA,
    },
    body: JSON.stringify({ query, variables: { codes: ['event_region', 'event_city', 'event_modality'] } }),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`GraphQL atributos: HTTP ${r.status}`);
  const j = await r.json();
  const attrs = j?.data?.productCustomAttributeValues?.attributes || [];
  const cityMap = {}, stateMap = {}, modMap = {};
  for (const a of attrs) {
    const dest = a.code === 'event_city' ? cityMap : a.code === 'event_region' ? stateMap : modMap;
    for (const v of a.listValues || []) {
      if (v.id) dest[Number(v.id)] = v.value;
    }
  }
  return { cityMap, stateMap, modMap };
}

async function buscarCalendario() {
  const r = await fetch(`${SITE}/calendario/`, {
    headers: { 'user-agent': UA, 'accept-language': 'pt-BR' },
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new Error(`O2 Corre calendário: HTTP ${r.status}`);
  const html = await r.text();
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('O2 Corre: __NEXT_DATA__ não encontrado');
  const data = JSON.parse(m[1]);
  const cu = data?.props?.pageProps?.calendarUnif;
  if (!Array.isArray(cu)) throw new Error('O2 Corre: calendarUnif não encontrado');
  return cu;
}

function parsearEvento(ev, cityMap, stateMap, modMap, hojeISO) {
  const tipo = limpar(ev.tipo_evento).toLowerCase();
  if (!TIPOS_ACEITOS.has(tipo)) return null;

  const data = (ev.data || '').slice(0, 10);
  if (!data || data < hojeISO) return null;

  const nome = limpar(ev.title_evento);
  if (!nome) return null;

  const url_key = limpar(ev.url_key);
  if (!url_key) return null;

  const cidade = cityMap[Number(ev.cidade)] || null;
  const estado = stateMap[Number(ev.estado)] || null;
  if (!cidade || !estado) return null;

  const link_inscricao = `https://www.runningland.com.br/${url_key}`;

  // Modalidades como distâncias ("5K, 10K")
  const modIds = String(ev.modality || '').split(',').map((x) => x.trim()).filter(Boolean);
  const distancias = modIds.length
    ? [...new Set(modIds.map((id) => modMap[Number(id)]).filter(Boolean))].join(', ') || null
    : null;

  const imagem_sugerida = typeof ev.img === 'string' && ev.img.startsWith('http') ? ev.img : null;

  return {
    chave: `${slug(nome)}-${data}`,
    nome,
    cidade,
    estado,
    data,
    distancias,
    local_largada: null,
    organizador: null,
    link_inscricao,
    imagem_sugerida,
    fonte: 'O2 Corre',
    fonte_url: `${SITE}/evento/${url_key}/`,
  };
}

async function coletarItens() {
  const hojeISO = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
  const [calendario, { cityMap, stateMap, modMap }] = await Promise.all([
    buscarCalendario(),
    buscarAtributos(),
  ]);
  const itens = calendario
    .map((ev) => parsearEvento(ev, cityMap, stateMap, modMap, hojeISO))
    .filter(Boolean);
  // deduplicar por chave
  return { brutos: calendario.length, unicos: Object.values(Object.fromEntries(itens.map((e) => [e.chave, e]))) };
}

async function coletarO2Corre() {
  const token = process.env.ROBO_TOKEN;
  if (!token) throw new Error('ROBO_TOKEN não configurado');

  const logId = await rpc('robo_log_inicio', {
    p_token: token, p_rota: 'coletar-o2corre', p_parametros: 'padrão', p_origem: 'agendado',
  }).catch(() => null);
  const logFim = (ok, resultado, erro) =>
    logId
      ? rpc('robo_log_fim', { p_token: token, p_id: logId, p_ok: ok, p_resultado: resultado, p_erro: erro || null }).catch(() => null)
      : null;

  try {
    const { unicos } = await coletarItens();
    let inseridas = 0;
    for (let i = 0; i < unicos.length; i += LOTE) {
      const lote = unicos.slice(i, i + LOTE);
      const novosChaves = new Set(
        await rpc('robo_novos', {
          p_token: token,
          p_itens: lote.map(({ chave, nome, cidade, data, link_inscricao }) => ({ chave, nome, cidade, data, link_inscricao })),
        })
      );
      const novos = lote.filter((e) => novosChaves.has(e.chave));
      if (novos.length) inseridas += await rpc('robo_inserir_pendentes', { p_token: token, p_itens: novos });
    }
    const resultado = { coletados: unicos.length, novos: inseridas };
    await logFim(true, resultado, null);
    console.log(`[O2Corre] ${inseridas} novos de ${unicos.length} coletados`);
    return resultado;
  } catch (e) {
    await logFim(false, null, e.message);
    throw e;
  }
}

module.exports = async (req, res) => {
  if (!ehAgendamento(req)) return res.status(401).json({ erro: 'não autorizado' });
  try {
    const resultado = await coletarO2Corre();
    res.status(200).json({ quando: new Date().toISOString(), ...resultado });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
};

module.exports.coletarO2Corre = coletarO2Corre;

// Simulação local (só lê o site, não grava nada): node api/coletar-o2corre.js
if (require.main === module) {
  coletarItens()
    .then(({ brutos, unicos }) => {
      console.log(`${brutos} eventos lidos → ${unicos.length} corridas`);
      console.log(JSON.stringify(unicos.slice(0, 3), null, 1));
    })
    .catch((e) => { console.error(e.message); process.exit(1); });
}
