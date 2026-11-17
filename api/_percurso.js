// Percursos (GPX/KML/KMZ) achados nas páginas de inscrição. Funções puras, sem rede.
// (arquivo com "_" não vira endpoint na Vercel)
const zlib = require('zlib');

const desfazer = (s) => String(s || '').replace(/\\u002F/gi, '/').replace(/\\\//g, '/').replace(/&amp;/g, '&').replace(/\\u0026/gi, '&').replace(/&#x2F;/gi, '/').replace(/&#47;/g, '/');

// Links de percurso na página. "baixar": dá para importar sozinho; "manual": precisa de login no site (Strava, Garmin…)
function acharLinks(html, base) {
  const t = desfazer(html), achados = new Map();
  const abs = (u) => { try { return new URL(u.replace(/^\/\//, 'https://'), base).toString(); } catch { return null; } };
  const add = (chave, item) => { if (!achados.has(chave)) achados.set(chave, item); };
  // Google My Maps (link, embed ou iframe): o KML é público
  for (const m of t.matchAll(/google\.[a-z.]+\/maps\/d\/[^\s"'<>]*?[?&]mid=([\w-]{10,})/gi))
    add('mymaps:' + m[1], { tipo: 'mymaps', baixar: `https://www.google.com/maps/d/kml?mid=${m[1]}&forcekml=1`, url: `https://www.google.com/maps/d/viewer?mid=${m[1]}` });
  // RideWithGPS: rota pública exporta GPX
  for (const m of t.matchAll(/ridewithgps\.com\/routes\/(\d{3,})/gi))
    add('rwgps:' + m[1], { tipo: 'ridewithgps', baixar: `https://ridewithgps.com/routes/${m[1]}.gpx?sub_format=track`, url: `https://ridewithgps.com/routes/${m[1]}` });
  // arquivo direto (href, src ou texto)
  for (const m of t.matchAll(/(?:href|src)\s*=\s*["']([^"']+\.(?:gpx|kml|kmz))(?:\?[^"']*)?["']|(https?:\/\/[^\s"'<>]+\.(?:gpx|kml|kmz))\b/gi)) {
    const u = abs(m[1] || m[2]); if (u) add('arq:' + u, { tipo: u.match(/\.(gpx|kml|kmz)/i)[1].toLowerCase(), baixar: u, url: u });
  }
  // só com login: guarda o link para o admin baixar
  const manuais = [
    [/https?:\/\/(?:www\.)?strava\.com\/routes\/\d+/gi, 'strava'],
    [/https?:\/\/(?:www\.)?strava\.com\/segments\/\d+/gi, 'strava'],
    [/https?:\/\/connect\.garmin\.com\/[^\s"'<>]*?course[^\s"'<>]*/gi, 'garmin'],
    [/https?:\/\/(?:[a-z]+\.)?wikiloc\.com\/[^\s"'<>]+/gi, 'wikiloc'],
    [/https?:\/\/(?:www\.)?komoot\.[a-z.]+\/(?:tour|smarttour)\/\d+/gi, 'komoot'],
    [/https?:\/\/(?:www\.)?plotaroute\.com\/route\/\d+/gi, 'plotaroute'],
    [/https?:\/\/(?:www\.)?onthegomap\.com\/[^\s"'<>]+/gi, 'onthegomap'],
    [/https?:\/\/(?:www\.)?mapmyrun\.com\/[^\s"'<>]*routes?[^\s"'<>]*/gi, 'mapmyrun']
  ];
  for (const [re, tipo] of manuais) for (const m of t.matchAll(re)) { const u = m[0].replace(/[).,;]+$/, ''); add(tipo + ':' + u, { tipo, url: u }); }
  return [...achados.values()].slice(0, 12);
}

const num = (s) => parseFloat(String(s).replace(',', '.'));
const txt = (s) => String(s || '').replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);

// GPX: cada <trk> (ou <rte>) vira uma trilha
function lerGPX(xml) {
  const out = [];
  const blocos = [...xml.matchAll(/<(trk|rte)\b[\s\S]*?<\/\1>/gi)].map((m) => m[0]);
  for (const b of blocos) {
    const nome = txt((b.match(/<name>([\s\S]*?)<\/name>/i) || [])[1]);
    const pts = [...b.matchAll(/<(?:trkpt|rtept)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:trkpt|rtept)>)/gi)].map((m) => {
      const lat = num((m[1].match(/lat\s*=\s*["']([^"']+)/i) || [])[1]), lon = num((m[1].match(/lon\s*=\s*["']([^"']+)/i) || [])[1]);
      const ele = num(((m[2] || '').match(/<ele>([^<]+)<\/ele>/i) || [])[1]);
      return [lat, lon, Number.isFinite(ele) ? ele : null];
    }).filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
    if (pts.length) out.push({ nome, pts });
  }
  return out;
}

// KML: cada Placemark com LineString (ou gx:Track) vira uma trilha; várias LineStrings no mesmo Placemark são emendadas
function lerKML(xml) {
  const out = [];
  for (const pm of xml.matchAll(/<Placemark\b[\s\S]*?<\/Placemark>/gi)) {
    const b = pm[0], nome = txt((b.match(/<name>([\s\S]*?)<\/name>/i) || [])[1]);
    let pts = [];
    for (const c of b.matchAll(/<LineString\b[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/gi))
      pts = pts.concat(c[1].trim().split(/\s+/).map((q) => { const [lo, la, el] = q.split(',').map(Number); return [la, lo, Number.isFinite(el) && el !== 0 ? el : null]; }));
    for (const c of b.matchAll(/<gx:coord>([^<]+)<\/gx:coord>/gi)) { const [lo, la, el] = c[1].trim().split(/\s+/).map(Number); pts.push([la, lo, Number.isFinite(el) && el !== 0 ? el : null]); }
    pts = pts.filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
    if (pts.length) out.push({ nome, pts });
  }
  return out;
}

// KMZ = zip: procura o primeiro .kml pelo diretório central e descomprime (deflate ou sem compressão)
function kmlDoKMZ(buf) {
  let fim = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) if (buf.readUInt32LE(i) === 0x06054b50) { fim = i; break; }
  if (fim < 0) throw new Error('KMZ inválido');
  let p = buf.readUInt32LE(fim + 16);
  const n = buf.readUInt16LE(fim + 10);
  for (let k = 0; k < n && p + 46 <= buf.length; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const metodo = buf.readUInt16LE(p + 10), tam = buf.readUInt32LE(p + 20), tamOrig = buf.readUInt32LE(p + 24);
    const ln = buf.readUInt16LE(p + 28), le = buf.readUInt16LE(p + 30), lc = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
    const nome = buf.toString('utf8', p + 46, p + 46 + ln);
    if (/\.kml$/i.test(nome)) {
      if (tamOrig > 20e6) throw new Error('KML grande demais');
      const ini = off + 30 + buf.readUInt16LE(off + 26) + buf.readUInt16LE(off + 28), dados = buf.subarray(ini, ini + tam);
      return (metodo === 0 ? dados : zlib.inflateRawSync(dados, { maxOutputLength: 20e6 })).toString('utf8');
    }
    p += 46 + ln + le + lc;
  }
  throw new Error('KMZ sem KML');
}

function trilhasDoArquivo(buf, dica) {
  const zip = buf.length > 4 && buf.readUInt32LE(0) === 0x04034b50;
  const xml = zip ? kmlDoKMZ(buf) : buf.toString('utf8');
  if (/<gpx[\s>]/i.test(xml)) return lerGPX(xml);
  if (/<kml[\s>]/i.test(xml) || /\bkml\b/i.test(dica || '')) return lerKML(xml);
  return [];
}

// distância em metros entre [lat, lng]
function metros(a, b) {
  const R = 6371000, r = Math.PI / 180, dLa = (b[0] - a[0]) * r, dLo = (b[1] - a[1]) * r;
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Mesma preparação do admin (assets/app.js): ~600 pontos, altitude suavizada, subida e descida
function prepararPercurso(pts) {
  let dist = 0; const comD = [[...pts[0], 0]];
  for (let i = 1; i < pts.length; i++) { dist += metros(pts[i - 1], pts[i]); comD.push([...pts[i], dist]); }
  const passo = Math.max(10, dist / 600);
  const red = [comD[0]];
  for (const p of comD) if (p[3] - red[red.length - 1][3] >= passo) red.push(p);
  if (red[red.length - 1] !== comD[comD.length - 1]) red.push(comD[comD.length - 1]);
  const temAlt = red.filter((p) => p[2] != null).length > red.length * 0.8;
  if (temAlt) {
    const e = red.map((p) => p[2]);
    red.forEach((p, i) => { const j = e.slice(Math.max(0, i - 2), i + 3).filter((v) => v != null); p[2] = j.length ? j.reduce((a, b) => a + b, 0) / j.length : null; });
  }
  let sobe = 0, desce = 0;
  if (temAlt) for (let i = 1; i < red.length; i++) { const d = red[i][2] - red[i - 1][2]; if (d > 0) sobe += d; else desce -= d; }
  return {
    percurso: red.map((p) => [+p[0].toFixed(5), +p[1].toFixed(5), temAlt && p[2] != null ? +p[2].toFixed(1) : null]),
    percurso_km: +(dist / 1000).toFixed(2),
    subida_m: temAlt ? Math.round(sobe) : null,
    descida_m: temAlt ? Math.round(desce) : null
  };
}

// distância da prova mais próxima do tamanho medido (até 15% de diferença)
function casarDistancia(km, distancias) {
  let melhor = null;
  for (const d of distancias || []) {
    const alvo = +d.km; if (!alvo) continue;
    const dif = Math.abs(km - alvo) / alvo;
    if (dif <= 0.15 && (!melhor || dif < melhor.dif)) melhor = { id: d.id, rotulo: d.rotulo, dif };
  }
  return melhor;
}

module.exports = { acharLinks, trilhasDoArquivo, lerGPX, lerKML, kmlDoKMZ, prepararPercurso, casarDistancia, metros };
