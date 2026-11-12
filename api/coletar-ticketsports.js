// Robô Ticket Sports (ticketsports.com.br / ticketagora)
// Coleta provas de corrida de rua do calendário da plataforma.
// API interna descoberta via DevTools (Fetch/XHR) na página /calendar/filters.
//
const { ehAgendamento } = require('./_seguranca.js');

// ─── CONSTANTES ───────────────────────────────────────────────────────────────

const BASE_API_URL = 'https://www.ticketsports.com.br/api';
// active-events retorna países com eventos ativos; Brasil = iD_Pais 33
const ACTIVE_COUNTRIES_PATH = '/location/countries/active-events';
// TODO: preencher com o endpoint que lista as corridas (rolar página no DevTools para descobrir)
const EVENTS_LIST_PATH = 'TODO_ENDPOINT_DA_LISTA_DE_CORRIDAS';
const MODALIDADE = 'corrida-de-rua';
const ID_PAIS_BRASIL = 33;
const UA = 'Mozilla/5.0 (compatible; MapmoveBot/1.0; +https://mapmove.com.br)';
const SUPABASE_URL = 'https://ssfsxdmzbubvygctdjgf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_s2yoUApfYl_ZvSUkqYYrVw_uXwKsybM';

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

async function buscarEventos(estado, pagina = 1) {
  const params = new URLSearchParams({
    modalidade: MODALIDADE,
    estado,
    page: String(pagina),
  });
  const url = `${BASE_API_URL}${ACTIVE_EVENTS_PATH}?${params}`;
  const r = await fetch(url, {
    headers: {
      'user-agent': UA,
      'accept': 'application/json',
      'accept-language': 'pt-BR,pt;q=0.9',
      'referer': `https://www.ticketsports.com.br/calendar/filters?modalidade=${MODALIDADE}&estado=${estado}`
    }
  });
  if (!r.ok) {
    console.warn(`[TicketSports] ${estado} p${pagina}: HTTP ${r.status}`);
    return [];
  }
  const data = await r.json().catch(() => null);
  if (!data) return [];

  // Primeira execução: imprimir estrutura para diagnóstico
  if (pagina === 1 && estado === 'SP' && process.env.DEBUG_TS) {
    console.log('[TicketSports] Estrutura da resposta:', JSON.stringify(data).slice(0, 800));
  }

  // Suporta array direto ou objeto com wrapper
  const lista = Array.isArray(data) ? data
    : (data.events || data.data || data.results || data.items || data.content || []);

  return lista;
}

function parsearEvento(ev, uf) {
  // ─── ADAPTAR CONFORME OS CAMPOS REAIS DO JSON ─────────────────────────────
  // Campos comuns em APIs de eventos brasileiros:
  //   nome/name/title, data/date/startDate/start_date,
  //   cidade/city, estado/state/uf, distancias/distances/modalities,
  //   link/url/eventUrl, organizador/organizer, local/venue
  //
  // Preencha abaixo com os nomes de campo reais que aparecerem no Response.

  const nome = limpar(ev.name || ev.nome || ev.title || '');
  if (!nome) return null;

  // Data: aceita "2025-03-15", "15/03/2025", timestamp
  let data = ev.date || ev.start_date || ev.startDate || ev.data || '';
  if (!data) return null;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(data)) {
    const [d, m, a] = data.split('/');
    data = `${a}-${m}-${d}`;
  }
  if (!/^\d{4}-\d{2}-\d{2}/.test(String(data))) return null;
  data = String(data).slice(0, 10);

  // Filtro: só provas futuras (com margem de 1 dia)
  const hoje = new Date(Date.now() - 3 * 3600e3);
  if (new Date(data) < hoje) return null;

  const cidade = limpar(ev.city || ev.cidade || '');
  const estado = limpar(ev.state || ev.estado || ev.uf || uf);

  // Distâncias: array de modalities ou string
  let distancias = null;
  if (Array.isArray(ev.modalities)) {
    distancias = ev.modalities.map((m) => limpar(m.distance || m.distancia || m.name || m)).join(', ');
  } else if (ev.distances || ev.distancias) {
    distancias = limpar(ev.distances || ev.distancias);
  }

  const id = ev.id || ev.eventId || ev.event_id || '';
  const linkInscricao = ev.url || ev.link || ev.eventUrl || ev.registration_url
    || (id ? `https://www.ticketsports.com.br/e/${id}` : null);

  return {
    chave: `${slug(nome)}-${data}`,
    nome,
    cidade,
    estado,
    data,
    distancias: distancias || null,
    local_largada: limpar(ev.venue || ev.local || ev.location || ''),
    organizador: limpar(ev.organizer || ev.organizador || ev.organization || ''),
    link_inscricao: linkInscricao || null,
    fonte: 'Ticket Sports',
    fonte_url: `https://www.ticketsports.com.br/calendar/filters?modalidade=${MODALIDADE}&estado=${uf}`
  };
}

// ─── COLETA PRINCIPAL ─────────────────────────────────────────────────────────

async function coletarTicketSports() {
  if (BASE_API_URL === 'TODO_COLE_A_URL_BASE_AQUI') {
    console.error('[TicketSports] BASE_API_URL não configurada. Cole a URL do endpoint active-events.');
    return { coletados: 0, novos: 0 };
  }

  const inicio = Date.now();
  await rpc('robo_log_inicio', { p_fonte: 'ticketsports' });

  const todos = [];

  for (const uf of UFS) {
    // Paginação: busca páginas até receber lista vazia
    let pagina = 1;
    while (true) {
      const lista = await buscarEventos(uf, pagina);
      if (!lista.length) break;

      for (const ev of lista) {
        const item = parsearEvento(ev, uf);
        if (item) todos.push(item);
      }

      // Se retornou menos que ~10 itens, provavelmente é a última página
      // Ajustar conforme o tamanho real da página da API
      if (lista.length < 10) break;
      pagina++;
      await dormir(300);
    }

    await dormir(200);
  }

  if (!todos.length) {
    console.log('[TicketSports] Nenhum evento encontrado');
    await rpc('robo_log_fim', { p_fonte: 'ticketsports', p_coletados: 0, p_novos: 0, p_ms: Date.now() - inicio });
    return { coletados: 0, novos: 0 };
  }

  // Deduplicação local por chave
  const unicos = Object.values(Object.fromEntries(todos.map((e) => [e.chave, e])));
  console.log(`[TicketSports] ${unicos.length} eventos únicos coletados`);

  // Verifica quais são novos no banco
  const chaves = unicos.map((e) => e.chave);
  const novosChaves = await rpc('robo_novos', { p_chaves: chaves, p_fonte: 'ticketsports' });
  const novos = unicos.filter((e) => novosChaves.includes(e.chave));

  if (novos.length) {
    await rpc('robo_inserir_pendentes', { p_eventos: novos });
  }

  await rpc('robo_log_fim', {
    p_fonte: 'ticketsports',
    p_coletados: unicos.length,
    p_novos: novos.length,
    p_ms: Date.now() - inicio
  });

  console.log(`[TicketSports] ${novos.length} novos de ${unicos.length} coletados`);
  return { coletados: unicos.length, novos: novos.length };
}

module.exports = { coletarTicketSports };

// Execução direta (node api/coletar-ticketsports.js)
if (require.main === module) {
  if (!ehAgendamento()) { console.error('Negado'); process.exit(1); }
  coletarTicketSports().then(console.log).catch(console.error);
}
