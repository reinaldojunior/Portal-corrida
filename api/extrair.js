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

// Procura o endereço em dois serviços gratuitos do OpenStreetMap, do texto mais completo ao mais simples
async function geocodificar(local, cidade) {
  const limpo = local.replace(/,\s*Brasil$/i, '').replace(/\s+/g, ' ').trim();
  const partes = limpo.split(/[,:]/).map((x) => x.trim()).filter(Boolean);
  const cid = cidade || partes.slice(1).reverse().find((x) => /^[A-ZÀ-Ú][a-zà-ú]+( [A-Za-zà-ú']+)*$/.test(x) && !/^(SP|Brasil|S\/N)$/i.test(x));
  const tentativas = [...new Set([
    limpo,
    partes[0] && cid ? `${partes[0]}, ${cid}, SP` : null,
    partes[0] && cid && /\(/.test(partes[0]) ? `${partes[0].replace(/\s*\(.*?\)\s*/g, ' ').trim()}, ${cid}, SP` : null,
    partes[1] && cid ? `${partes[1].split(' - ')[0]}, ${cid}, SP` : null
  ].filter(Boolean))];
  for (const q of tentativas) {
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=br&q=${encodeURIComponent(q)}`, { headers: { 'user-agent': UA, 'accept-language': 'pt-BR', referer: 'https://paceclub-mu.vercel.app/' }, signal: AbortSignal.timeout(5000) });
      const j = r.ok ? await r.json() : [];
      if (j[0]) return [+j[0].lat, +j[0].lon];
    } catch { /* segue */ }
    try {
      const r = await fetch(`https://photon.komoot.io/api/?limit=1&lang=default&bbox=-74,-34,-34,6&q=${encodeURIComponent(q)}`, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(5000) });
      const j = r.ok ? await r.json() : null;
      const g = j && j.features && j.features[0];
      if (g) return [g.geometry.coordinates[1], g.geometry.coordinates[0]];
    } catch { /* segue */ }
  }
  return null;
}

// ---------- Padrões por site (cadastrados no admin, tabela padroes_busca) ----------
const SUPABASE_URL = 'https://ssfsxdmzbubvygctdjgf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_s2yoUApfYl_ZvSUkqYYrVw_uXwKsybM';
let cachePadroes = null, cachePadroesEm = 0;
async function carregarPadroes() {
  if (cachePadroes && Date.now() - cachePadroesEm < 120000) return cachePadroes;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/padroes_busca?select=*`, { headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${SUPABASE_KEY}` }, signal: AbortSignal.timeout(4000) });
    cachePadroes = r.ok ? await r.json() : [];
  } catch { cachePadroes = cachePadroes || []; }
  cachePadroesEm = Date.now();
  return cachePadroes;
}
const hostDe = (u) => { try { return new URL(u).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; } };
function padraoDoHost(lista, host) {
  return (lista || []).filter((p) => p && p.dominio && (host === p.dominio || host.endsWith('.' + p.dominio)))
    .sort((a, b) => b.dominio.length - a.dominio.length)[0] || null;
}
// texto entre os marcadores "antes" e "depois" (o primeiro que aparecer na página)
function entreMarcadores(html, antes, depois) {
  if (!antes) return null;
  const i = html.indexOf(antes);
  if (i < 0) return null;
  const ini = i + antes.length;
  const fim = html.indexOf(depois || '"', ini);
  if (fim < 0 || fim - ini > 2000) return null;
  return html.slice(ini, fim);
}
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ordm: 'º', ordf: 'ª', ccedil: 'ç', atilde: 'ã', otilde: 'õ', aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', acirc: 'â', ecirc: 'ê', ocirc: 'ô', agrave: 'à', ndash: '–', mdash: '—' };
const textoLimpo = (s) => String(s || '').replace(/<br\s*\/?>/gi, ', ').replace(/<[^>]*>/g, ' ')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m)
  .replace(/\s+/g, ' ').replace(/\s*,(\s*,)*\s*/g, ', ').replace(/^[\s,:-]+|[\s,:-]+$/g, '').trim();

// Padrão por seletor ("seletor:img.ev-hero-img"): acha a tag pela classe/id, em qualquer ordem de atributos
const attr = (tag, nome) => { const m = tag.match(new RegExp(`\\s${nome}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i')); return m ? (m[2] ?? m[3] ?? m[4] ?? '') : null; };
function porSeletor(html, seletor) {
  const m = String(seletor || '').trim().match(/^([a-z][a-z0-9]*)?((?:[.#][\w-]+)+)?$/i);
  if (!m || (!m[1] && !m[2])) return null;
  const tagNome = (m[1] || '[a-z][a-z0-9]*').toLowerCase();
  const classes = (m[2] || '').match(/\.[\w-]+/g)?.map((c) => c.slice(1)) || [];
  const id = ((m[2] || '').match(/#([\w-]+)/) || [])[1];
  const re = new RegExp(`<(${tagNome})\\b[^>]*>`, 'gi');
  let t;
  while ((t = re.exec(html))) {
    const tag = t[0];
    const cls = (attr(tag, 'class') || '').split(/\s+/);
    if (classes.some((c) => !cls.includes(c))) continue;
    if (id && attr(tag, 'id') !== id) continue;
    const fecha = html.indexOf(`</${t[1]}`, re.lastIndex);
    const texto = fecha > 0 && fecha - re.lastIndex < 3000 ? html.slice(re.lastIndex, fecha) : '';
    const estilo = (attr(tag, 'style') || '').match(/url\(\s*['"]?([^'")]+)/i);
    return { src: attr(tag, 'data-src') || attr(tag, 'data-lazy-src') || attr(tag, 'src') || attr(tag, 'content') || (estilo && estilo[1]) || attr(tag, 'href'), onerror: attr(tag, 'onerror') || '', texto };
  }
  return null;
}
async function abreImagem(u) {
  for (const method of ['HEAD', 'GET']) {
    try {
      const r = await fetch(u, { method, headers: { 'user-agent': UA, range: 'bytes=0-0' }, redirect: 'follow', signal: AbortSignal.timeout(5000) });
      if (r.ok || r.status === 206) return true;
      if (r.status !== 405 && r.status !== 403) return false;
    } catch { /* tenta de novo */ }
  }
  return false;
}
// imagem pelo seletor; se não abrir, repete a troca que a própria página faz no onerror (.replace('a','b'))
async function imagemPorSeletor(html, seletor, base) {
  const el = porSeletor(html, seletor);
  if (!el || !el.src) return null;
  let u; try { u = new URL(el.src.trim(), base).toString(); } catch { return null; }
  const troca = el.onerror.match(/replace\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]*)['"]\s*\)/);
  if (troca && !(await abreImagem(u))) {
    const alt = new URL(u.replace(troca[1], troca[2]), base).toString();
    if (await abreImagem(alt)) return alt;
  }
  return u;
}
// elemento colado pelo admin (Inspecionar → Copiar elemento): monta o seletor pela tag + classe ou id
function seletorDoElemento(el) {
  const t = String(el || '').trim().match(/^<([a-z][a-z0-9]*)\b[^>]*>/i);
  if (!t) return null;
  const cls = (attr(t[0], 'class') || '').split(/\s+/).filter((c) => c && !/^(active|show|lazy|loaded|img-fluid|w-100|d-block)$/i.test(c));
  const id = attr(t[0], 'id');
  if (cls.length) return t[1].toLowerCase() + '.' + cls[0];
  if (id) return t[1].toLowerCase() + '#' + id;
  return null;
}

// Assistente: acha no código da página o exemplo que o admin copiou e sugere os marcadores
function sugerirMarcadores(html, exemplo, tipo) {
  exemplo = String(exemplo || '').trim();
  if (!exemplo) return null;
  if (exemplo.startsWith('<')) {
    const sel = seletorDoElemento(exemplo);
    const el = sel && porSeletor(html, sel);
    if (el) return { achou: true, antes: 'seletor:' + sel, depois: '', valor: tipo === 'img' ? el.src : textoLimpo(el.texto) };
    // sem classe/id que exista na página: tenta pelo endereço ou pelo texto do elemento
    exemplo = tipo === 'img' ? (attr(exemplo.match(/^<[^>]*>/)[0], 'src') || '') : textoLimpo(exemplo);
    if (!exemplo) return { achou: false };
  }
  const candidatos = [exemplo];
  if (tipo === 'img') {
    try { const u = new URL(exemplo); candidatos.push(u.pathname + u.search, u.pathname, u.pathname.split('/').pop()); } catch { /* segue */ }
  } else {
    candidatos.push(exemplo.split(',')[0].trim(), exemplo.replace(/&/g, '&amp;'));
  }
  let pos = -1, achado = '';
  for (const c of candidatos) { if (c && c.length >= 4) { pos = html.indexOf(c); if (pos >= 0) { achado = c; break; } } }
  if (pos < 0) return { achou: false };
  // estende até as bordas do valor: aspas (atributo) ou tags (texto)
  let ini = pos, fim = pos + achado.length;
  if (tipo === 'img') {
    while (ini > 0 && !`"'(`.includes(html[ini - 1]) && pos - ini < 600) ini--;
    while (fim < html.length && !`"')`.includes(html[fim]) && fim - pos < 1200) fim++;
  } else {
    while (ini > 0 && html[ini - 1] !== '>' && pos - ini < 300) ini--;
    // vai até a tag que fecha o bloco (pula <br>, <b> etc. no meio do endereço)
    const fecha = html.indexOf('</', pos);
    fim = fecha >= 0 && fecha - pos < 600 ? fecha : pos + achado.length;
  }
  let depois = html[fim] || '"';
  if (tipo !== 'img' && html.startsWith('</', fim)) depois = html.slice(fim, html.indexOf('>', fim) + 1) || '<';
  // marcador "antes": o menor trecho anterior que aponte para este lugar (primeira ocorrência na página)
  let antes = '';
  for (let n = 12; n <= 160; n += 4) {
    antes = html.slice(Math.max(0, ini - n), ini);
    if (html.indexOf(antes) === ini - antes.length) break;
  }
  // começa no início da tag, se estiver perto (fica mais fácil de ler e mais estável)
  const lt = html.lastIndexOf('<', ini - antes.length);
  if (lt >= 0 && ini - antes.length - lt <= 80 && !html.slice(lt, ini - antes.length).includes('\n')) antes = html.slice(lt, ini);
  return { achou: true, antes, depois, valor: html.slice(ini, fim) };
}

module.exports = async (req, res) => {
  res.setHeader('cache-control', 'no-store');
  // modo só endereço: /api/extrair?endereco=...
  const endQ = String((req.query && req.query.endereco) || '').trim();
  if (endQ) {
    if (endQ.length > 300) return res.status(400).json({ erro: 'Endereço longo demais.' });
    const g = await geocodificar(endQ);
    return res.status(200).json(g ? { lat: g[0], lng: g[1], local: endQ.replace(/,\s*Brasil$/i, ''), aproximado: true } : { lat: null, lng: null });
  }
  const url = urlValida(String((req.query && req.query.url) || ''));
  if (!url) return res.status(400).json({ erro: 'Link inválido.' });
  const q = req.query || {};
  // assistente do admin: ?url=...&aprender=1&img=<endereço da imagem>&local=<texto do local>
  if (q.aprender) {
    try {
      const pg = await baixar(url);
      if (!pg.ok) throw new Error(`A página respondeu com erro ${pg.status}.`);
      const html = desfazer(pg.texto);
      return res.status(200).json({ img: sugerirMarcadores(html, q.img, 'img'), local: sugerirMarcadores(html, q.local, 'local'), tamanho: html.length });
    } catch (e) { return res.status(502).json({ erro: e.message || 'Não consegui abrir a página da inscrição.' }); }
  }
  // teste de um padrão ainda não salvo: ?url=...&teste=1&img_antes=...&img_depois=...&local_antes=...&local_depois=...
  const padrao = q.teste ? { dominio: hostDe(url), img_antes: q.img_antes || null, img_depois: q.img_depois || null, local_antes: q.local_antes || null, local_depois: q.local_depois || null } : undefined;
  try { res.status(200).json(await analisar(url, padrao)); }
  catch (e) { res.status(502).json({ erro: e.message }); }
};

// Lê a página de inscrição e devolve imagem de divulgação e local (usado pelo botão do admin e pelo robô)
async function analisar(url, padraoTeste) {
  url = urlValida(url);
  if (!url) throw new Error('Link inválido.');
  let pg;
  try { pg = await baixar(url); } catch { throw new Error('Não consegui abrir a página da inscrição.'); }
  if (!pg.ok) throw new Error(`A página respondeu com erro ${pg.status}.`);
  const html = desfazer(pg.texto);

  // imagem de divulgação
  const og = html.match(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]*content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og:image|twitter:image)["']/i);
  let imagem = og ? og[1] : null;
  // padrão cadastrado para este site (vale mais que a busca genérica)
  const padrao = padraoTeste !== undefined ? padraoTeste : padraoDoHost(await carregarPadroes(), hostDe(pg.url || url) || hostDe(url)) || padraoDoHost(await carregarPadroes(), hostDe(url));
  let localPadrao = null;
  if (padrao) {
    const im = /^seletor:/i.test(padrao.img_antes || '') ? await imagemPorSeletor(html, padrao.img_antes.slice(8), pg.url || url) : entreMarcadores(html, padrao.img_antes, padrao.img_depois);
    if (im && im.trim()) imagem = im.trim().replace(/^url\(|\)$/g, '');
    const lo = textoLimpo(/^seletor:/i.test(padrao.local_antes || '') ? (porSeletor(html, padrao.local_antes.slice(8)) || {}).texto : entreMarcadores(html, padrao.local_antes, padrao.local_depois));
    if (lo && lo.length >= 3) localPadrao = lo.slice(0, 200);
  }
  if (imagem && !/^https?:/i.test(imagem)) { try { imagem = new URL(imagem, pg.url || url).toString(); } catch { imagem = null; } }

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
  // dados estruturados do evento (schema.org): local e, se houver, coordenadas
  const plano = html.replace(/\\+"/g, '"');
  const geo = plano.match(/"geo"\s*:\s*\{[^}]*?"latitude"\s*:\s*"?(-?\d+\.\d+)"?[^}]*?"longitude"\s*:\s*"?(-?\d+\.\d+)/);
  if (lat == null && geo) { lat = +geo[1]; lng = +geo[2]; }
  const lugar = plano.match(/"location"\s*:\s*\{[^{}]*?"name"\s*:\s*"([^"]{3,200})"/);
  const ender = plano.match(/"address"\s*:\s*\{[^{}]*?"(?:name|streetAddress)"\s*:\s*"([^"]{3,250})"/);
  const cidadeEv = plano.match(/"addressLocality"\s*:\s*"([^"]{2,80})"/);
  const endereco = (ender && ender[1]) || (lugar && lugar[1]) || null;
  if (!local && endereco) local = endereco.replace(/,\s*Brasil$/i, '').replace(/\s+/g, ' ').trim();
  if (localPadrao) local = localPadrao;

  // sem coordenadas: procura o endereço no OpenStreetMap
  if (lat == null && local) { const g = await geocodificar(local, cidadeEv && cidadeEv[1]); if (g) [lat, lng] = g; }
  // a página monta o link do Maps na hora; montamos o mesmo link a partir do endereço
  if (!mapa && local) mapa = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(local)}`;
  return { imagem, lat, lng, local, mapa, aproximado: lat != null && !coordsDoLink(mapa || ''), padrao: padrao ? padrao.dominio : null };
}
module.exports.analisar = analisar;

// Centro da cidade (para conferir se um pino caiu no lugar certo). Guarda em memória durante a execução.
const cacheCidade = new Map();
async function centroCidade(cidade, uf = 'SP') {
  const k = `${cidade}|${uf}`.toLowerCase();
  if (cacheCidade.has(k)) return cacheCidade.get(k);
  let r = null;
  try {
    const q = encodeURIComponent(`${cidade}, ${uf}, Brasil`);
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=br&featuretype=city&q=${q}`, { headers: { 'user-agent': UA, 'accept-language': 'pt-BR', referer: 'https://paceclub-mu.vercel.app/' }, signal: AbortSignal.timeout(5000) });
    const j = res.ok ? await res.json() : [];
    if (j[0]) r = [+j[0].lat, +j[0].lon];
  } catch { /* segue */ }
  if (!r) {
    try {
      const res = await fetch(`https://photon.komoot.io/api/?limit=1&osm_tag=place&q=${encodeURIComponent(`${cidade}, ${uf}`)}&bbox=-74,-34,-34,6`, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(5000) });
      const j = res.ok ? await res.json() : null;
      const g = j && j.features && j.features[0];
      if (g) r = [g.geometry.coordinates[1], g.geometry.coordinates[0]];
    } catch { /* segue */ }
  }
  cacheCidade.set(k, r);
  return r;
}
const distanciaKm = (a, b) => { const R = Math.PI / 180, dLa = (b[0] - a[0]) * R, dLo = (b[1] - a[1]) * R; const h = Math.sin(dLa / 2) ** 2 + Math.cos(a[0] * R) * Math.cos(b[0] * R) * Math.sin(dLo / 2) ** 2; return 12742 * Math.asin(Math.sqrt(h)); };
// Pino só vale se ficar a até 30 km do centro da cidade da prova; senão usa o centro da cidade
async function conferirPino(lat, lng, cidade, uf) {
  const c = await centroCidade(cidade, uf);
  if (!c) return { lat, lng, ok: null };
  if (lat == null || distanciaKm([lat, lng], c) > 30) return { lat: c[0], lng: c[1], ok: false };
  return { lat, lng, ok: true };
}
module.exports.conferirPino = conferirPino;
