// Página de cada corrida com endereço de verdade (/corrida/nome-da-prova), montada no servidor.
// O Google e o WhatsApp leem título, descrição, imagem e os dados do evento (schema.org) já no HTML;
// no navegador, o app normal assume a página em seguida.
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://ssfsxdmzbubvygctdjgf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_s2yoUApfYl_ZvSUkqYYrVw_uXwKsybM';
let modelo = null;

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const dataLonga = (iso) => { const [a, m, d] = iso.split('-').map(Number); return `${d} de ${MESES[m - 1]} de ${a}`; };
const hojeBR = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);

function lerModelo() {
  if (!modelo) modelo = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
  return modelo;
}

async function buscarCorrida(slug) {
  const q = new URLSearchParams({ select: '*,corrida_distancias(*)', slug: `eq.${slug}`, status: 'eq.publicado', limit: '1' });
  const r = await fetch(`${SUPABASE_URL}/rest/v1/corridas?${q}`, { headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${SUPABASE_KEY}` }, signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error(`banco ${r.status}`);
  const j = await r.json();
  return j[0] || null;
}

function montar(html, c, base) {
  const url = `${base}/corrida/${encodeURIComponent(c.slug)}`;
  const dists = (c.corrida_distancias || []).slice().sort((a, b) => (+a.km || 999) - (+b.km || 999));
  const rot = dists.map((d) => d.rotulo).filter(Boolean);
  const passou = c.data < hojeBR();
  const titulo = `${c.nome} – ${c.cidade}${c.estado ? '/' + c.estado : ''}, ${dataLonga(c.data)} · PaceClub`;
  const resumo = c.descricao ? String(c.descricao).replace(/<[^>]*>/g, ' ').replace(/[#*_>\[\]()`]/g, '').replace(/\s+/g, ' ').trim() : '';
  const descricao = (`${passou ? 'Aconteceu em' : 'Corrida de rua em'} ${c.cidade}${c.estado ? '/' + c.estado : ''} no dia ${dataLonga(c.data)}`
    + `${c.horario ? `, largada às ${c.horario.slice(0, 5)}` : ''}${rot.length ? `. Distâncias: ${rot.join(', ')}` : ''}`
    + `${c.local_largada ? `. Largada: ${c.local_largada}` : ''}. ${resumo}`).slice(0, 300).trim();
  const imagem = c.imagem_url && /^https?:/i.test(c.imagem_url) ? c.imagem_url : null;
  const inicio = `${c.data}T${(c.horario || '07:00').slice(0, 5)}:00-03:00`;
  const precos = dists.filter((d) => d.preco != null).map((d) => +d.preco);
  const ld = {
    '@context': 'https://schema.org', '@type': 'SportsEvent', name: c.nome, url, sport: 'Corrida de rua',
    startDate: inicio, eventStatus: 'https://schema.org/EventScheduled', eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    description: descricao,
    location: {
      '@type': 'Place', name: c.local_largada || c.cidade,
      address: { '@type': 'PostalAddress', addressLocality: c.cidade, addressRegion: c.estado || undefined, addressCountry: 'BR', streetAddress: c.local_largada || undefined },
      geo: c.lat != null && c.lng != null ? { '@type': 'GeoCoordinates', latitude: +c.lat, longitude: +c.lng } : undefined
    },
    image: imagem ? [imagem] : undefined,
    organizer: c.organizador ? { '@type': 'Organization', name: c.organizador } : undefined,
    offers: c.link_inscricao ? {
      '@type': 'Offer', url: c.link_inscricao, priceCurrency: 'BRL', availability: c.inscricoes_abertas && !passou ? 'https://schema.org/InStock' : 'https://schema.org/SoldOut',
      ...(precos.length ? { price: Math.min(...precos).toFixed(2) } : {})
    } : undefined
  };
  const tituloOriginal = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || 'PaceClub';
  const cabeca = [
    `<meta name="pc-titulo" content="${esc(tituloOriginal)}">`,
    `<link rel="canonical" href="${esc(url)}">`,
    `<meta property="og:type" content="website">`, `<meta property="og:site_name" content="PaceClub">`, `<meta property="og:locale" content="pt_BR">`,
    `<meta property="og:title" content="${esc(c.nome)}">`, `<meta property="og:description" content="${esc(descricao)}">`, `<meta property="og:url" content="${esc(url)}">`,
    imagem ? `<meta property="og:image" content="${esc(imagem)}">` : '',
    `<meta name="twitter:card" content="${imagem ? 'summary_large_image' : 'summary'}">`,
    `<meta name="twitter:title" content="${esc(c.nome)}">`, `<meta name="twitter:description" content="${esc(descricao)}">`,
    imagem ? `<meta name="twitter:image" content="${esc(imagem)}">` : '',
    `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`
  ].filter(Boolean).join('\n');
  // conteúdo já no HTML (quem não roda JavaScript também lê); o app substitui ao carregar
  const corpo = `<div class="wrap pagina-corrida"><h1 class="display">${esc(c.nome)}</h1>
<p>${esc(dataLonga(c.data))}${c.horario ? `, largada às ${esc(c.horario.slice(0, 5))}` : ''} · ${esc(c.cidade)}${c.estado ? ', ' + esc(c.estado) : ''}</p>
${c.local_largada ? `<p>Largada: ${esc(c.local_largada)}</p>` : ''}${rot.length ? `<p>Distâncias: ${esc(rot.join(', '))}</p>` : ''}
${resumo ? `<p>${esc(resumo.slice(0, 600))}</p>` : ''}${c.link_inscricao ? `<p><a href="${esc(c.link_inscricao)}" rel="noopener">Site da inscrição</a></p>` : ''}
<p><a href="/">Ver todas as corridas</a></p></div>`;
  return html
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(titulo)}</title>`)
    .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${esc(descricao)}">`)
    .replace('<head>', '<head>\n<base href="/">')
    .replace('</head>', `${cabeca}\n</head>`)
    .replace('<main id="vHome">', '<main id="vHome" hidden>')
    .replace('<main id="vCorrida" hidden></main>', `<main id="vCorrida">${corpo}</main>`);
}

module.exports = async (req, res) => {
  const slug = String((req.query && req.query.slug) || '').slice(0, 200);
  // endereço oficial do site (o mesmo em qualquer endereço da Vercel); troque SITE_URL ao usar domínio próprio
  const base = (process.env.SITE_URL || 'https://paceclub-mu.vercel.app').replace(/\/$/, '');
  let html;
  try { html = lerModelo(); } catch { res.statusCode = 302; res.setHeader('location', `/#corrida/${encodeURIComponent(slug)}`); return res.end(); }
  res.setHeader('content-type', 'text/html; charset=utf-8');
  try {
    const c = slug ? await buscarCorrida(slug) : null;
    if (!c) {
      res.statusCode = 404;
      return res.end(html.replace('<head>', '<head>\n<base href="/">').replace('</head>', '<meta name="robots" content="noindex">\n</head>'));
    }
    res.setHeader('cache-control', 'public, s-maxage=600, stale-while-revalidate=86400');
    res.statusCode = 200;
    return res.end(montar(html, c, base));
  } catch {
    // banco fora do ar: entrega o app normal, que tenta carregar sozinho
    res.statusCode = 200;
    res.setHeader('cache-control', 'no-store');
    return res.end(html.replace('<head>', '<head>\n<base href="/">'));
  }
};
