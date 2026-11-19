// Proxy de percursos: KML do Google My Maps (público) e GPX de rotas do Strava (API oficial, só admin).
// O Strava fica aqui porque o plano Hobby da Vercel aceita só 12 funções.
const { ehAdmin } = require('./_seguranca.js');
const { web } = require('./extrair.js');

const SUPABASE_URL = 'https://ssfsxdmzbubvygctdjgf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_s2yoUApfYl_ZvSUkqYYrVw_uXwKsybM';

async function rpcComo(jwt, nome, corpo = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${nome}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${jwt}`, 'content-type': 'application/json' },
    body: JSON.stringify(corpo), signal: AbortSignal.timeout(5000)
  });
  if (!r.ok) throw new Error(`Supabase ${nome}: ${r.status}`);
  return r.json().catch(() => null);
}

async function tokenStrava(corpo) {
  const r = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ client_id: process.env.STRAVA_CLIENT_ID, client_secret: process.env.STRAVA_CLIENT_SECRET, ...corpo }),
    signal: AbortSignal.timeout(8000)
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.message || `Strava respondeu ${r.status}`), { status: r.status });
  return j;
}

async function strava(req, res) {
  if (!process.env.STRAVA_CLIENT_ID || !process.env.STRAVA_CLIENT_SECRET)
    return res.status(503).json({ erro: 'Faltam STRAVA_CLIENT_ID e STRAVA_CLIENT_SECRET nas variáveis da Vercel.' });
  const q = req.query;

  // 1) início do login: manda o admin para a tela de autorização do Strava
  if (q.strava_auth) {
    const volta = `https://${req.headers['x-forwarded-host'] || req.headers.host}/`;
    const u = new URL('https://www.strava.com/oauth/authorize');
    u.search = new URLSearchParams({ client_id: process.env.STRAVA_CLIENT_ID, redirect_uri: volta, response_type: 'code', approval_prompt: 'auto', scope: 'read,read_all', state: 'mapmove-strava' }).toString();
    res.setHeader('Location', u.toString());
    return res.status(302).end();
  }

  if (!(await ehAdmin(req))) return res.status(401).json({ erro: 'Só admin.' });
  const jwt = (req.headers.authorization || '').replace(/^Bearer /, '');

  // 2) volta do Strava: troca o código pelo refresh token e guarda no banco
  if (q.strava_code) {
    const t = await tokenStrava({ code: String(q.strava_code), grant_type: 'authorization_code' });
    const quem = t.athlete ? `${t.athlete.firstname || ''} ${t.athlete.lastname || ''}`.trim() : null;
    await rpcComo(jwt, 'strava_salvar_token', { t: t.refresh_token, quem });
    return res.status(200).json({ ok: true, atleta: quem });
  }

  const acesso = await acessoStrava(jwt);
  if (acesso.conectar) return res.status(409).json(acesso);
  res.setHeader('Cache-Control', 'no-store');

  // 3) página do organizador: acha as rotas do Strava (embeds e links) e baixa o GPX de cada uma
  if (q.strava_pagina) {
    const url = web.urlValida(String(q.strava_pagina));
    if (!url) return res.status(400).json({ erro: 'Link inválido.' });
    const pg = await web.baixar(url, 12000);
    if (!pg.ok) return res.status(502).json({ erro: `A página respondeu ${pg.status}.` });
    const rotas = rotasNaPagina(pg.texto);
    if (!rotas.length) return res.status(404).json({ erro: 'Nenhuma rota do Strava encontrada nessa página.' });
    const saida = await Promise.all(rotas.map(async (rt) => {
      try {
        const [info, gpx] = await Promise.all([apiStrava(acesso.token, `/routes/${rt.id}`, true), apiStrava(acesso.token, `/routes/${rt.id}/export_gpx`)]);
        return { ...rt, nome: info.name || null, km: info.distance ? +(info.distance / 1000).toFixed(2) : null, gpx };
      } catch (e) { return { ...rt, erro: e.message }; }
    }));
    return res.status(200).json({ rotas: saida });
  }

  // 4) GPX de uma rota
  const id = String(q.strava || '');
  if (!/^\d{3,25}$/.test(id)) return res.status(400).json({ erro: 'ID de rota inválido.' });
  try {
    const gpx = await apiStrava(acesso.token, `/routes/${id}/export_gpx`);
    res.setHeader('Content-Type', 'application/gpx+xml; charset=utf-8');
    return res.status(200).send(gpx);
  } catch (e) { return res.status(e.status || 502).json({ erro: e.message }); }
}

// refresh token guardado → access token (o Strava pode trocar o refresh: grava o novo)
async function acessoStrava(jwt) {
  const refresh = await rpcComo(jwt, 'strava_token');
  if (!refresh) return { erro: 'Conecte o Strava primeiro.', conectar: true };
  let t;
  try { t = await tokenStrava({ refresh_token: refresh, grant_type: 'refresh_token' }); }
  catch (e) { if (e.status === 400 || e.status === 401) return { erro: 'A conexão com o Strava expirou. Conecte de novo.', conectar: true }; throw e; }
  if (t.refresh_token && t.refresh_token !== refresh) await rpcComo(jwt, 'strava_salvar_token', { t: t.refresh_token });
  return { token: t.access_token };
}

async function apiStrava(token, caminho, json = false) {
  const r = await fetch(`https://www.strava.com/api/v3${caminho}`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(12000) });
  if (r.status === 404 || r.status === 403) throw Object.assign(new Error('Rota não encontrada ou privada de outra conta.'), { status: 404 });
  if (r.status === 429) throw Object.assign(new Error('Limite da API do Strava atingido. Tente em 15 minutos.'), { status: 429 });
  if (!r.ok) throw Object.assign(new Error(`Strava respondeu ${r.status}`), { status: 502 });
  return json ? r.json() : r.text();
}

// embeds (<div class="strava-embed-placeholder" data-embed-id data-token data-map-hash>), iframes do strava-embeds.com e links /routes/ID
function rotasNaPagina(html) {
  const t = String(html).replace(/\\u002F/gi, '/').replace(/\\\//g, '/').replace(/&amp;/g, '&'), achou = new Map();
  const attr = (s, n) => (s.match(new RegExp(`data-${n}\\s*=\\s*["']([^"']+)`, 'i')) || [])[1] || null;
  for (const m of t.matchAll(/<[^>]*strava-embed-placeholder[^>]*>/gi)) {
    const id = attr(m[0], 'embed-id'), tipo = attr(m[0], 'embed-type');
    if (id && /^\d+$/.test(id) && (!tipo || tipo === 'route') && !achou.has(id)) achou.set(id, { id, token: attr(m[0], 'token'), hash: attr(m[0], 'map-hash') });
  }
  for (const m of t.matchAll(/strava-embeds\.com\/route\/(\d+)([^"'<>\s]*)/gi)) {
    if (achou.has(m[1])) continue;
    const tok = (m[2].match(/[?&]token=([\w-]+)/) || [])[1] || null, hash = (m[2].match(/#([\d./-]+)/) || [])[1] || null;
    achou.set(m[1], { id: m[1], token: tok, hash });
  }
  for (const m of t.matchAll(/strava\.com\/routes\/(\d+)/gi)) if (!achou.has(m[1])) achou.set(m[1], { id: m[1], token: null, hash: null });
  return [...achou.values()].slice(0, 8);
}

module.exports = async function handler(req, res) {
  const q = req.query;
  if (q.strava || q.strava_auth || q.strava_code || q.strava_pagina) {
    try { return await strava(req, res); } catch (e) { return res.status(500).json({ erro: e.message }); }
  }
  const { url } = q;
  if (!url || !url.startsWith('https://www.google.com/maps/d/kml')) {
    return res.status(400).json({ error: 'URL inválida' });
  }
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MapMove/1.0)' },
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return res.status(r.status).json({ error: `Google respondeu ${r.status}` });
    const text = await r.text();
    res.setHeader('Content-Type', 'application/vnd.google-earth.kml+xml; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, s-maxage=300');
    return res.status(200).send(text);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
