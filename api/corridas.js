// Páginas de calendário por estado e por cidade: /corridas, /corridas/sp, /corridas/sp/campinas
// Lista montada no servidor (o Google lê tudo no HTML) a partir das provas publicadas e futuras.
const SUPABASE_URL = 'https://ssfsxdmzbubvygctdjgf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_s2yoUApfYl_ZvSUkqYYrVw_uXwKsybM';

const UFS = { AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PA: 'Pará', PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina', SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins' };
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MES3 = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slugar = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const hojeBR = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const dataCurta = (iso) => { const [, m, d] = iso.split('-').map(Number); return `${d} de ${MESES[m - 1]}`; };
const dataLonga = (iso) => { const [a, m, d] = iso.split('-').map(Number); return `${d} de ${MESES[m - 1]} de ${a}`; };
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
function cortar(t, max) {
  t = String(t).replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const c = t.slice(0, max - 1);
  return c.slice(0, Math.max(c.lastIndexOf(' '), Math.floor(max * 0.6))).replace(/[\s,.;:–-]+$/, '') + '…';
}

async function buscar(uf) {
  const q = new URLSearchParams({ select: 'slug,nome,cidade,estado,data,horario,corrida_distancias(rotulo,km)', status: 'eq.publicado', data: `gte.${hojeBR()}`, order: 'data.asc', limit: '1000' });
  if (uf) q.set('estado', `eq.${uf}`);
  const r = await fetch(`${SUPABASE_URL}/rest/v1/corridas?${q}`, { headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${SUPABASE_KEY}` }, signal: AbortSignal.timeout(6000) });
  if (!r.ok) throw new Error(`banco ${r.status}`);
  return r.json();
}

function agrupar(lista) {
  const m = new Map();
  for (const c of lista) {
    const k = slugar(c.cidade);
    if (!k) continue;
    if (!m.has(k)) m.set(k, { slug: k, nome: c.cidade, n: 0 });
    m.get(k).n++;
  }
  return [...m.values()].sort((a, b) => b.n - a.n || a.nome.localeCompare(b.nome, 'pt-BR'));
}

function cartao(c) {
  const [, m, d] = c.data.split('-').map(Number);
  const dists = (c.corrida_distancias || []).slice().sort((a, b) => (a.km ?? 0) - (b.km ?? 0)).map((x) => x.rotulo).filter(Boolean);
  return `<li><a class="lp-prova" href="/corrida/${encodeURIComponent(c.slug)}"><span class="lp-data"><b>${d}</b>${MES3[m - 1]}</span><span class="lp-info"><span class="lp-nome">${esc(c.nome)}</span><span class="lp-meta">${esc(c.cidade)}/${esc(c.estado)}${c.horario ? ` · largada às ${esc(c.horario.slice(0, 5).replace(':', 'h'))}` : ''}${dists.length ? ` · ${esc(dists.join(', '))}` : ''}</span></span></a></li>`;
}

function pagina({ titulo, descricao, url, h1, intro, corpo, ld, noindex }) {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(descricao)}">
<meta name="theme-color" content="#15181B">
${noindex ? '<meta name="robots" content="noindex,follow">' : ''}<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="Mapmove"><meta property="og:locale" content="pt_BR">
<meta property="og:title" content="${esc(titulo)}"><meta property="og:description" content="${esc(descricao)}"><meta property="og:url" content="${esc(url)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Barlow:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/estilo.css">
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>
</head>
<body>
<header class="topo"><div class="wrap">
  <a href="/" class="logo" aria-label="Mapmove, página inicial">Map<span>move</span></a>
  <nav class="menu" aria-label="Principal"><a href="/">Mapa</a><a href="/corridas">Corridas por estado</a></nav>
  <div class="spacer"></div>
  <a href="/" class="btn-entrar">Ver no mapa</a>
</div></header>
<main class="lp"><div class="wrap">
${corpo.migalhas}
<h1 class="display">${esc(h1)}</h1>
<p class="lp-intro">${intro}</p>
${corpo.html}
</div></main>
<footer class="rodape"><div class="wrap">
  <span class="logo">Map<span>move</span></span>
  <span>Ache a próxima corrida, trilha, pedal ou prova no mapa.</span>
  <div class="spacer"></div>
  <a href="/privacidade.html">Privacidade</a>
  <a href="#" data-cookies hidden>Cookies</a>
</div></footer>
<script src="/assets/analytics.js" defer></script>
</body>
</html>`;
}

const migalhas = (...itens) => `<nav class="lp-mig" aria-label="Você está em">${itens.map(([t, h]) => (h ? `<a href="${h}">${esc(t)}</a>` : `<span>${esc(t)}</span>`)).join(' › ')}</nav>`;

function ldLista(url, nome, lista, base, cam) {
  return [
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: cam.map(([n, h], i) => ({ '@type': 'ListItem', position: i + 1, name: n, item: base + h })) },
    { '@context': 'https://schema.org', '@type': 'ItemList', name: nome, url, numberOfItems: lista.length, itemListElement: lista.slice(0, 50).map((c, i) => ({ '@type': 'ListItem', position: i + 1, url: `${base}/corrida/${encodeURIComponent(c.slug)}`, name: c.nome })) }
  ];
}

module.exports = async (req, res) => {
  const base = (process.env.SITE_URL || 'https://mapmove.com.br').replace(/\/$/, '');
  const uf = String((req.query && req.query.uf) || '').toUpperCase().slice(0, 2);
  const cidSlug = slugar((req.query && req.query.cidade) || '');
  res.setHeader('content-type', 'text/html; charset=utf-8');
  const naoAchou = () => {
    res.statusCode = 404;
    res.setHeader('cache-control', 'public, s-maxage=300');
    return res.end(pagina({ titulo: 'Página não encontrada · Mapmove', descricao: 'Esta página não existe.', url: base + '/corridas', h1: 'Página não encontrada', intro: '<a href="/corridas">Ver corridas por estado</a>', corpo: { migalhas: '', html: '' }, ld: {}, noindex: true }));
  };
  try {
    const ano = hojeBR().slice(0, 4);
    // /corridas: todos os estados
    if (!uf) {
      const todas = await buscar('');
      const por = {};
      todas.forEach((c) => { por[c.estado] = (por[c.estado] || 0) + 1; });
      const ufs = Object.keys(por).filter((u) => UFS[u]).sort((a, b) => por[b] - por[a]);
      const url = `${base}/corridas`;
      const html = `<ul class="lp-links">${ufs.map((u) => `<li><a href="/corridas/${u.toLowerCase()}"><b>${esc(UFS[u])}</b><span>${plural(por[u], 'prova', 'provas')}</span></a></li>`).join('')}</ul>`;
      res.setHeader('cache-control', 'public, s-maxage=1800, stale-while-revalidate=86400');
      return res.end(pagina({
        titulo: `Corridas no Brasil ${ano}: calendário por estado · Mapmove`, descricao: cortar(`Calendário de corridas de rua e provas esportivas em ${ufs.length} estados. Escolha o estado e veja datas, distâncias e inscrições.`, 155),
        url, h1: `Corridas de rua no Brasil em ${ano}`, intro: `Hoje o Mapmove lista ${plural(todas.length, 'prova futura', 'provas futuras')} em ${plural(ufs.length, 'estado', 'estados')}. Escolha o estado para ver o calendário, ou abra o <a href="/">mapa</a> para achar provas perto de você.`,
        corpo: { migalhas: migalhas(['Mapmove', '/'], ['Corridas']), html }, ld: ldLista(url, `Corridas por estado ${ano}`, [], base, [['Mapmove', '/'], ['Corridas', '/corridas']])
      }));
    }
    if (!UFS[uf]) return naoAchou();
    const lista = await buscar(uf);
    const cidades = agrupar(lista);
    const nomeUF = UFS[uf];
    // /corridas/sp: estado
    if (!cidSlug) {
      if (!lista.length) { res.setHeader('cache-control', 'public, s-maxage=600'); }
      const url = `${base}/corridas/${uf.toLowerCase()}`;
      const prim = lista[0];
      const intro = lista.length
        ? `${plural(lista.length, 'prova futura', 'provas futuras')} em ${esc(nomeUF)}, em ${plural(cidades.length, 'cidade', 'cidades')}. A próxima é <a href="/corrida/${encodeURIComponent(prim.slug)}">${esc(prim.nome)}</a>, em ${esc(prim.cidade)}, no dia ${esc(dataLonga(prim.data))}. A lista abaixo é atualizada todo dia.`
        : `Ainda não há provas futuras cadastradas em ${esc(nomeUF)}. Veja o <a href="/">mapa</a> com as provas de todo o Brasil.`;
      const html = (cidades.length ? `<h2>Cidades com provas em ${esc(nomeUF)}</h2><ul class="lp-links">${cidades.map((c) => `<li><a href="/corridas/${uf.toLowerCase()}/${c.slug}"><b>${esc(c.nome)}</b><span>${plural(c.n, 'prova', 'provas')}</span></a></li>`).join('')}</ul>` : '')
        + (lista.length ? `<h2>Próximas corridas em ${esc(nomeUF)}</h2><ul class="lp-lista">${lista.slice(0, 120).map(cartao).join('')}</ul>${lista.length > 120 ? `<p class="lp-mais">Mostrando as 120 primeiras. Escolha uma cidade acima para ver as demais.</p>` : ''}` : '');
      res.setHeader('cache-control', 'public, s-maxage=1800, stale-while-revalidate=86400');
      return res.end(pagina({
        titulo: cortar(`Corridas em ${nomeUF} (${uf}) ${ano}: calendário`, 49) + ' · Mapmove',
        descricao: cortar(lista.length ? `${plural(lista.length, 'corrida', 'corridas')} em ${nomeUF}: datas, distâncias e inscrições. Próxima: ${prim.nome}, ${dataCurta(prim.data)}, em ${prim.cidade}.` : `Calendário de corridas de rua em ${nomeUF}.`, 155),
        url, h1: `Corridas de rua em ${nomeUF} (${uf}) em ${ano}`, intro, corpo: { migalhas: migalhas(['Mapmove', '/'], ['Corridas', '/corridas'], [nomeUF]), html }, noindex: !lista.length,
        ld: ldLista(url, `Corridas em ${nomeUF}`, lista, base, [['Mapmove', '/'], ['Corridas', '/corridas'], [nomeUF, `/corridas/${uf.toLowerCase()}`]])
      }));
    }
    // /corridas/sp/campinas: cidade
    const cid = cidades.find((c) => c.slug === cidSlug);
    if (!cid) return naoAchou();
    const doCid = lista.filter((c) => slugar(c.cidade) === cidSlug);
    const url = `${base}/corridas/${uf.toLowerCase()}/${cidSlug}`;
    const prim = doCid[0];
    const ult = doCid[doCid.length - 1];
    const distSet = [...new Map(doCid.flatMap((c) => c.corrida_distancias || []).filter((d) => d.rotulo && d.km != null && !/caminhada/i.test(d.rotulo)).sort((a, b) => a.km - b.km).map((d) => [String(d.rotulo).toUpperCase(), String(d.rotulo).toUpperCase()])).values()].slice(0, 8);
    const intro = `${plural(doCid.length, 'prova futura', 'provas futuras')} em ${esc(cid.nome)}/${uf}. A próxima é <a href="/corrida/${encodeURIComponent(prim.slug)}">${esc(prim.nome)}</a>, no dia ${esc(dataLonga(prim.data))}${doCid.length > 1 ? `, e a mais distante acontece em ${esc(dataCurta(ult.data))}` : ''}.${distSet.length ? ` Distâncias oferecidas: ${esc(distSet.join(', '))}.` : ''} Os dados vêm dos sites dos organizadores; confirme data e valores na página da inscrição.`;
    const outras = cidades.filter((c) => c.slug !== cidSlug).slice(0, 12);
    const html = `<h2>Próximas corridas em ${esc(cid.nome)}</h2><ul class="lp-lista">${doCid.map(cartao).join('')}</ul>`
      + (outras.length ? `<h2>Outras cidades de ${esc(nomeUF)}</h2><ul class="lp-links">${outras.map((c) => `<li><a href="/corridas/${uf.toLowerCase()}/${c.slug}"><b>${esc(c.nome)}</b><span>${plural(c.n, 'prova', 'provas')}</span></a></li>`).join('')}</ul><p class="lp-mais"><a href="/corridas/${uf.toLowerCase()}">Ver todas as corridas em ${esc(nomeUF)}</a></p>` : '');
    res.setHeader('cache-control', 'public, s-maxage=1800, stale-while-revalidate=86400');
    return res.end(pagina({
      titulo: cortar(`Corridas em ${cid.nome}/${uf} ${ano}: calendário`, 49) + ' · Mapmove',
      descricao: cortar(`${plural(doCid.length, 'corrida', 'corridas')} em ${cid.nome}/${uf}: datas, distâncias e inscrições. Próxima: ${prim.nome}, ${dataCurta(prim.data)}.`, 155),
      url, h1: `Corridas de rua em ${cid.nome}/${uf} em ${ano}`, intro, corpo: { migalhas: migalhas(['Mapmove', '/'], ['Corridas', '/corridas'], [nomeUF, `/corridas/${uf.toLowerCase()}`], [cid.nome]), html },
      ld: ldLista(url, `Corridas em ${cid.nome}/${uf}`, doCid, base, [['Mapmove', '/'], ['Corridas', '/corridas'], [nomeUF, `/corridas/${uf.toLowerCase()}`], [cid.nome, `/corridas/${uf.toLowerCase()}/${cidSlug}`]])
    }));
  } catch {
    res.statusCode = 503;
    res.setHeader('cache-control', 'no-store');
    return res.end('<!doctype html><meta charset="utf-8"><title>Mapmove</title><p>Não foi possível carregar agora. <a href="/">Voltar ao mapa</a>.</p>');
  }
};
