// Robô Ticket Sports (ticketsports.com.br / ticketagora)
// Coleta provas de corrida de rua para o Brasil via API interna descoberta por DevTools.
// Endpoint: GET /api/events/list?quantity=N&atlheteId=0&term=&country=BR[&offset=N]

const { ehAgendamento } = require('./_seguranca.js');

// ─── CONSTANTES ───────────────────────────────────────────────────────────────

const BASE_API_URL = 'https://www.ticketsports.com.br/api';
const SUPABASE_URL = 'https://ssfsxdmzbubvygctdjgf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_s2yoUApfYl_ZvSUkqYYrVw_uXwKsybM';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Sem offset/page aparente no fetch real — tenta alta quantity de uma vez.
// Se a API tiver paginação ela virá como campo "total" ou "hasMore" na resposta.
const QUANTIDADE = 500;
const MODALIDADES_CORRIDA = ['corrida-de-rua', 'corrida de rua', 'corrida'];

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

// ─── BUSCA PAGINADA ───────────────────────────────────────────────────────────

async function buscarEventos() {
  const params = new URLSearchParams({
    quantity: String(QUANTIDADE),
    atlheteId: '0',
    term: '',
    country: 'BR',
  });
  const url = `${BASE_API_URL}/events/list?${params}`;
  const r = await fetch(url, {
    headers: {
      'user-agent': UA,
      'accept': '*/*',
      'accept-language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      'referer': 'https://www.ticketsports.com.br/calendar/filters?modalidade=corrida-de-rua&estado=SP'
    }
  });
  if (!r.ok) {
    console.warn(`[TicketSports] HTTP ${r.status}`);
    return [];
  }
  const data = await r.json().catch(() => null);
  if (!data) return [];

  if (process.env.DEBUG_TS) {
    console.log('[TicketSports] Amostra da resposta:', JSON.stringify(data).slice(0, 1200));
  }

  // Suporta array direto ou objeto com wrapper
  return Array.isArray(data) ? data
    : (data.events || data.data || data.results || data.items || data.content || []);
}

// ─── PARSER DE EVENTO ─────────────────────────────────────────────────────────
// NOTA: ajustar nomes de campo conforme a estrutura real da API.
// Rodar DEBUG_TS=1 node api/coletar-ticketsports.js na primeira vez para ver os campos.

function ehCorridaDeRua(ev) {
  const campos = [
    ev.modalidade, ev.modality, ev.category, ev.categoria,
    ev.sport, ev.esporte, ev.type, ev.tipo, ev.name, ev.nome, ev.title
  ];
  const texto = campos.filter(Boolean).join(' ').toLowerCase();
  return MODALIDADES_CORRIDA.some((m) => texto.includes(m))
    || texto.includes('run') || texto.includes('km') || texto.includes('corrida');
}

function parsearEvento(ev) {
  // Nome do evento
  const nome = limpar(
    ev.name || ev.nome || ev.title || ev.titulo || ev.eventName || ev.nomeEvento || ''
  );
  if (!nome) return null;

  // Data: aceita "2025-03-15", "15/03/2025", timestamp ISO
  let data = ev.date || ev.data || ev.start_date || ev.startDate || ev.dataInicio ||
             ev.eventDate || ev.inicio || '';
  if (!data) return null;
  data = String(data);
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(data)) {
    const [d, m, a] = data.split('/');
    data = `${a}-${m}-${d}`;
  }
  if (/^\d{4}-\d{2}-\d{2}T/.test(data)) data = data.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return null;

  // Só provas futuras
  const hoje = new Date(Date.now() - 3 * 3600e3);
  if (new Date(data) < hoje) return null;

  // Localização
  const cidade = limpar(
    ev.city || ev.cidade || ev.municipio || ev.municipality || ''
  );
  const estado = limpar(
    ev.state || ev.estado || ev.uf || ev.stateAbbr || ''
  );

  // Distâncias
  let distancias = null;
  if (Array.isArray(ev.modalities || ev.modalidades || ev.distances || ev.distancias)) {
    const arr = ev.modalities || ev.modalidades || ev.distances || ev.distancias;
    distancias = arr.map((m) => {
      if (typeof m === 'string') return limpar(m);
      return limpar(m.distance || m.distancia || m.name || m.nome || '');
    }).filter(Boolean).join(', ');
  } else if (ev.distance || ev.distancia) {
    distancias = limpar(ev.distance || ev.distancia);
  }

  // ID e link de inscrição
  const id = ev.id || ev.eventId || ev.event_id || ev.iD_Evento || ev.iD_Event || '';
  const slugEvento = ev.slug || ev.url_slug || ev.permalink || '';
  const linkInscricao = ev.registration_url || ev.registrationUrl || ev.link_inscricao ||
    ev.url || ev.link ||
    (slugEvento ? `https://www.ticketsports.com.br/${slugEvento}` : null) ||
    (id ? `https://www.ticketsports.com.br/e/${id}` : null);

  return {
    chave: `ts-${slug(nome)}-${data}`,
    nome,
    cidade,
    estado: estado.toUpperCase() || 'BR',
    data,
    distancias: distancias || null,
    local_largada: limpar(ev.venue || ev.local || ev.location || ev.localizacao || ''),
    organizador: limpar(ev.organizer || ev.organizador || ev.organization || ev.promoter || ''),
    link_inscricao: linkInscricao || null,
    fonte: 'Ticket Sports',
    fonte_url: `https://www.ticketsports.com.br/calendar/filters?modalidade=corrida-de-rua${estado ? '&estado=' + estado.toUpperCase() : ''}`
  };
}

// ─── COLETA PRINCIPAL ─────────────────────────────────────────────────────────

async function coletarTicketSports() {
  const inicio = Date.now();
  await rpc('robo_log_inicio', { p_fonte: 'ticketsports' });

  const lista = await buscarEventos();
  const todos = [];

  for (const ev of lista) {
    // Filtrar apenas corridas de rua (a API retorna todas as modalidades)
    if (!ehCorridaDeRua(ev)) continue;
    const item = parsearEvento(ev);
    if (item) todos.push(item);
  }

  console.log(`[TicketSports] ${lista.length} eventos brutos → ${todos.length} corridas`);

  if (!todos.length) {
    console.log('[TicketSports] Nenhuma corrida encontrada');
    await rpc('robo_log_fim', { p_fonte: 'ticketsports', p_coletados: 0, p_novos: 0, p_ms: Date.now() - inicio });
    return { coletados: 0, novos: 0 };
  }

  // Deduplicação local por chave
  const unicos = Object.values(Object.fromEntries(todos.map((e) => [e.chave, e])));
  console.log(`[TicketSports] ${unicos.length} corridas únicas coletadas`);

  // Verifica quais são novas no banco
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

// Execução direta: DEBUG_TS=1 node api/coletar-ticketsports.js
if (require.main === module) {
  if (!ehAgendamento()) { console.error('Negado'); process.exit(1); }
  coletarTicketSports().then(console.log).catch(console.error);
}
