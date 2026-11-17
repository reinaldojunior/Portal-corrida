// Robô de percursos: lê a página de inscrição das provas futuras sem GPX e procura o percurso
// (Google My Maps, RideWithGPS, arquivo GPX/KML/KMZ). O que achar vira SUGESTÃO para o admin aprovar
// na aba "Robô"; links que exigem login (Strava, Garmin…) ficam guardados para o admin baixar à mão.
const { web } = require('./extrair.js');
const { acharLinks, trilhasDoArquivo, prepararPercurso, casarDistancia } = require('./_percurso.js');
const { ehAgendamento, ehAdmin } = require('./_seguranca.js');

const SUPABASE_URL = 'https://ssfsxdmzbubvygctdjgf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_s2yoUApfYl_ZvSUkqYYrVw_uXwKsybM';
const LIMITE = 20, PARALELO = 3, PRAZO_MS = 48000, MAX_ARQ = 8e6;

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

const comPrazo = (p, ms) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error('demorou')), ms))]);

// baixa um arquivo (binário) conferindo cada redirecionamento contra a rede interna, com limite de tamanho
async function baixarArquivo(url) {
  const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), 12000);
  try {
    let atual = url;
    for (let saltos = 0; saltos < 6; saltos++) {
      if (!web.urlValida(atual) || !(await web.hostPublico(atual))) throw new Error('link inválido');
      const r = await fetch(atual, { headers: { 'user-agent': web.UA }, redirect: 'manual', signal: ctrl.signal });
      const destino = r.status >= 300 && r.status < 400 && r.headers.get('location');
      if (destino) { atual = new URL(destino, atual).toString(); continue; }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      if (+r.headers.get('content-length') > MAX_ARQ) throw new Error('arquivo grande demais');
      const partes = []; let total = 0;
      for await (const pedaco of r.body) { total += pedaco.length; if (total > MAX_ARQ) throw new Error('arquivo grande demais'); partes.push(Buffer.from(pedaco)); }
      return Buffer.concat(partes);
    }
    throw new Error('redirecionamentos demais');
  } finally { clearTimeout(t); }
}

// altitude pelo Open-Meteo (até 100 pontos por pedido) quando o arquivo não traz (ex.: Google My Maps)
async function preencherAltitude(prep) {
  const pts = prep.percurso;
  for (let i = 0; i < pts.length; i += 100) {
    const lote = pts.slice(i, i + 100);
    const u = `https://api.open-meteo.com/v1/elevation?latitude=${lote.map((p) => p[0]).join(',')}&longitude=${lote.map((p) => p[1]).join(',')}`;
    const r = await fetch(u, { signal: AbortSignal.timeout(8000) });
    const j = r.ok ? await r.json() : null;
    if (!j || !Array.isArray(j.elevation) || j.elevation.length !== lote.length) return prep;
    lote.forEach((p, k) => { p[2] = Number.isFinite(j.elevation[k]) ? j.elevation[k] : null; });
  }
  // mesma suavização e soma do admin
  const e = pts.map((p) => p[2]);
  pts.forEach((p, i) => { const j = e.slice(Math.max(0, i - 2), i + 3).filter((v) => v != null); p[2] = j.length ? +(j.reduce((a, b) => a + b, 0) / j.length).toFixed(1) : null; });
  let sobe = 0, desce = 0;
  for (let i = 1; i < pts.length; i++) { const d = (pts[i][2] ?? pts[i - 1][2]) - (pts[i - 1][2] ?? pts[i][2]); if (d > 0) sobe += d; else desce -= d; }
  return { ...prep, subida_m: Math.round(sobe), descida_m: Math.round(desce), altitude: 'open-meteo' };
}

async function procurar(item) {
  const pg = await web.baixarEvento(item.link_inscricao);
  if (!pg.ok) throw new Error('página HTTP ' + pg.status);
  const links = acharLinks(pg.texto, pg.url);
  const trilhas = [], manuais = links.filter((l) => !l.baixar).map(({ tipo, url }) => ({ tipo, url }));
  for (const l of links.filter((x) => x.baixar).slice(0, 4)) {
    let lidas = [];
    try { lidas = trilhasDoArquivo(await baixarArquivo(l.baixar), l.tipo); } catch { manuais.push({ tipo: l.tipo, url: l.url, erro: true }); continue; }
    for (const t of lidas) {
      if (t.pts.length < 20 || trilhas.length >= 6) continue;
      let prep = prepararPercurso(t.pts);
      if (prep.percurso_km < 0.8 || prep.percurso_km > 60) continue;
      if (prep.subida_m == null) prep = await preencherAltitude(prep).catch(() => prep);
      const d = casarDistancia(prep.percurso_km, item.distancias);
      trilhas.push({ nome: t.nome || null, tipo: l.tipo, fonte: l.url, ...prep, dist_id: d ? d.id : null, dist_rotulo: d ? d.rotulo : null });
    }
  }
  return trilhas.length || manuais.length ? { achado_em: new Date().toISOString(), pagina: pg.url, trilhas, links: manuais.slice(0, 8) } : null;
}

module.exports = async (req, res) => {
  const peloAdmin = !ehAgendamento(req) && await ehAdmin(req);
  if (!ehAgendamento(req) && !peloAdmin) return res.status(401).json({ erro: 'não autorizado' });
  const token = process.env.ROBO_TOKEN, inicio = Date.now();
  const logId = await rpc('robo_log_inicio', { p_token: token, p_rota: 'buscar-percurso', p_parametros: 'padrão', p_origem: peloAdmin ? 'admin' : 'agendado' }).catch(() => null);
  const logFim = (ok, resultado, erro) => logId ? rpc('robo_log_fim', { p_token: token, p_id: logId, p_ok: ok, p_resultado: resultado, p_erro: erro || null }).catch(() => null) : null;
  try {
    const fila = (await rpc('robo_para_buscar_percurso', { p_token: token, p_limite: LIMITE })) || [];
    let i = 0, lidas = 0, falhas = 0, comTrilha = 0, comLink = 0;
    const trabalhador = async () => {
      while (i < fila.length && Date.now() - inicio < PRAZO_MS) {
        const f = fila[i++]; let sugestao = null;
        try { sugestao = await comPrazo(procurar(f), 25000); lidas += 1; } catch { falhas += 1; }
        if (sugestao && sugestao.trilhas.length) comTrilha += 1; else if (sugestao) comLink += 1;
        // marca a procura mesmo sem achar nada (volta para a fila em 7 dias); salva na hora
        await rpc('robo_guardar_percurso', { p_token: token, p_itens: [{ id: f.id, sugestao }] }).catch(() => null);
      }
    };
    await Promise.all(Array.from({ length: PARALELO }, trabalhador));
    const resultado = { na_fila: fila.length, percursos_lidos: lidas, com_percurso: comTrilha, so_link: comLink, falhas };
    await logFim(true, resultado, null);
    res.status(200).json(resultado);
  } catch (e) { await logFim(false, null, e.message); res.status(500).json({ erro: e.message }); }
};
