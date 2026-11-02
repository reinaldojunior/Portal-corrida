// Lê a página de inscrição de uma prova e devolve só dados úteis para o admin:
// a imagem de divulgação (og:image) e o local da largada (link do Google Maps → coordenadas).
// Não devolve o HTML da página.

const UA = 'Mozilla/5.0 (compatible; PaceClubBot/1.0; +https://paceclub-mu.vercel.app)';

function urlValida(u) {
  try {
    const x = new URL(u);
    if (x.protocol !== 'https:' && x.protocol !== 'http:') return null;
    if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[)/i.test(x.hostname) || /^\d+\.\d+\.\d+\.\d+$/.test(x.hostname)) return null;
    return x.toString();
  } catch { return null; }
}

async function baixar(url, ms = 9000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'pt-BR,pt;q=0.9' }, redirect: 'follow', signal: ctrl.signal });
    return { ok: r.ok, status: r.status, url: r.url, texto: r.ok ? await r.text() : '' };
  } finally { clearTimeout(t); }
}

const desfazer = (s) => s.replace(/\\u002F/gi, '/').replace(/\\\//g, '/').replace(/&amp;/g, '&').replace(/\\u0026/gi, '&');
const deco = (s) => { try { return decodeURIComponent(s.replace(/\+/g, ' ')); } catch { return s.replace(/\+/g, ' '); } };

function coordsDoLink(link) {
  const t = deco(link);
  const ok = (a, b) => { const la = +a, lo = +b; return isFinite(la) && isFinite(lo) && Math.abs(la) <= 90 && Math.abs(lo) <= 180 && !(la === 0 && lo === 0) ? [la, lo] : null; };
  let m = t.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/); if (m) return ok(m[1], m[2]);
  m = t.match(/[?&](?:q|query|ll|destination|center|daddr)=(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/); if (m) return ok(m[1], m[2]);
  m = t.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/); if (m) return ok(m[1], m[2]);
  return null;
}
function textoDoLink(link) {
  const t = deco(link);
  let m = t.match(/\/place\/([^/@?]+)/); if (m) return m[1].trim();
  m = t.match(/[?&](?:q|query|destination|daddr)=([^&]+)/); if (m && !/^-?\d+\.\d+\s*,/.test(m[1])) return m[1].trim();
  return null;
}

module.exports = async (req, res) => {
  res.setHeader('cache-control', 's-maxage=3600');
  const url = urlValida(String((req.query && req.query.url) || ''));
  if (!url) return res.status(400).json({ erro: 'Link inválido.' });
  let pg;
  try { pg = await baixar(url); } catch { return res.status(502).json({ erro: 'Não consegui abrir a página da inscrição.' }); }
  if (!pg.ok) return res.status(502).json({ erro: `A página respondeu com erro ${pg.status}.` });
  const html = desfazer(pg.texto);

  // imagem de divulgação
  const og = html.match(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]*content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og:image|twitter:image)["']/i);
  let imagem = og ? og[1] : null;
  if (imagem && imagem.startsWith('/')) imagem = new URL(imagem, pg.url).toString();

  // links de mapa na página (inclusive dentro de JSON)
  const links = [...new Set((html.match(/https?:\/\/(?:www\.)?(?:google\.[a-z.]+\/maps[^"'<>\s]*|maps\.google\.[a-z.]+[^"'<>\s]*|maps\.app\.goo\.gl\/[^"'<>\s]+|goo\.gl\/maps\/[^"'<>\s]+)/gi) || []))].slice(0, 6);
  let lat = null, lng = null, local = null, mapa = null;
  for (let l of links) {
    if (/maps\.app\.goo\.gl|goo\.gl\/maps/i.test(l)) { try { const r = await baixar(l, 6000); l = r.url || l; } catch { /* segue */ } }
    const c = coordsDoLink(l);
    if (!local) local = textoDoLink(l);
    if (c) { [lat, lng] = c; mapa = l; break; }
    if (!mapa) mapa = l;
  }
  // sem coordenadas no link: tenta achar pelo endereço (OpenStreetMap)
  if (lat == null && local) {
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=br&q=${encodeURIComponent(local)}`, { headers: { 'user-agent': UA, 'accept-language': 'pt-BR' } });
      const j = r.ok ? await r.json() : [];
      if (j[0]) { lat = +j[0].lat; lng = +j[0].lon; }
    } catch { /* segue */ }
  }
  res.status(200).json({ imagem, lat, lng, local, mapa, aproximado: lat != null && !coordsDoLink(mapa || '') });
};
