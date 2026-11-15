// Páginas de calendário por estado e por cidade: /corridas, /corridas/sp, /corridas/sp/campinas
// Lista montada no servidor (o Google lê tudo no HTML) a partir das provas publicadas e futuras.
const SUPABASE_URL = 'https://ssfsxdmzbubvygctdjgf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_s2yoUApfYl_ZvSUkqYYrVw_uXwKsybM';

const UFS = { AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PA: 'Pará', PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina', SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins' };

const DESC_UF = {
  AC: 'O Acre é o estado mais ocidental do Brasil, na Amazônia, com capital Rio Branco. A cena do esporte de rua cresce a cada ano, liderada por corridas noturnas e circuitos urbanos organizados pela Federação Acreana de Atletismo. O clima quente e úmido pede largadas no início da manhã ou ao entardecer. Rio Branco concentra a maior parte das provas, mas cidades como Cruzeiro do Sul e Sena Madureira também recebem eventos ao longo do ano. Corredores visitantes encontram percursos planos às margens do Rio Acre e uma comunidade acolhedora de atletas amadores.',
  AL: 'Alagoas combina praias de água cristalina com uma tradição crescente de corridas de rua. Maceió, a capital, é o principal polo de provas, com percursos à beira-mar na Orla de Pajuçara e na Ponta Verde que atraem atletas de todo o Nordeste. O circuito alagoano inclui também corridas em Arapiraca, maior cidade do interior, e em municípios do litoral sul como Maragogi e Coruripe. As condições climáticas ensolaradas permitem provas durante quase todo o ano, com maior concentração no primeiro semestre.',
  AP: 'O Amapá, estado da região Norte com capital Macapá, tem uma comunidade de corrida em expansão. A cidade de Macapá, às margens do Rio Amazonas e próxima ao Equador, é sede das principais provas do estado. O Parque do Forte e as margens do rio oferecem cenários únicos para percursos urbanos. As condições climáticas tropicais, com altas temperaturas e chuvas intensas de janeiro a junho, concentram os eventos esportivos no segundo semestre. A Federação Amapaense de Atletismo fomenta o esporte e organiza o calendário de competições.',
  AM: 'O Amazonas, maior estado do Brasil, tem em Manaus o epicentro das corridas de rua da Amazônia. A capital reúne provas de 5k a ultramaratonas, com percursos no entorno do Teatro Amazonas, no Parque Vieiralves e na orla do Rio Negro. A floresta amazônica inspira trails e provas de aventura realizadas em reservas e parques ao redor da cidade. O calor e a umidade elevados exigem hidratação redobrada; largadas às 6h da manhã são a norma. Parintins, Itacoatiara e Tefé também sediaram provas em anos recentes.',
  BA: 'A Bahia é um dos estados com maior tradição em corridas de rua do Brasil. Salvador, a capital, oferece percursos históricos como o Circuito do Pelourinho e a Orla de Ondina, além de receber provas de grande porte como a Meia Maratona de Salvador. No interior, Feira de Santana, Vitória da Conquista, Ilhéus e Juazeiro sediam calendários robustos de corridas e trials. O terreno variado — do litoral às chapadas — favorece desde provas de asfalto até ultramaratonas na Chapada Diamantina. A comunidade baiana de corredores é uma das mais ativas e bem organizadas do Nordeste.',
  CE: 'O Ceará possui uma das mais vibrantes cenas de corrida de rua do Nordeste. Fortaleza, a capital, é palco de provas icônicas como a Meia Maratona de Fortaleza e o Circuito das Praias, com percursos pela Beira-Mar, pela Aldeota e pelo Centro. As temperaturas amenas em relação ao restante do Nordeste e a brisa do mar tornam as manhãs de domingo ideais para treinos e competições. Cidades do interior como Juazeiro do Norte, Sobral e Crato têm calendários próprios e comunidades de corrida consolidadas. Trilhas na Serra de Baturité e no Parque Nacional de Ubajara atraem entusiastas do trail running.',
  DF: 'O Distrito Federal, sede da capital federal Brasília, possui uma das maiores densidades de corredores por habitante do país. Os parques projetados por Lúcio Costa — Parque da Cidade, Parque Nacional de Brasília e Lago Paranoá — oferecem circuitos seguros e bem mantidos para treinos e competições. A Maratona de Brasília, realizada anualmente, é uma das mais tradicionais do Centro-Oeste. Provas de 5k e 10k movimentam os fins de semana durante todo o ano. O clima seco no inverno e as manhãs frescas favorecem o rendimento dos atletas, especialmente entre maio e setembro.',
  ES: 'O Espírito Santo tem Vitória, capital ilhada, como palco privilegiado de corridas à beira-mar. O percurso da Terceira Ponte, o calçadão de Camburi e os parques da Grande Vitória são cenários frequentes de provas do circuito capixaba. Vila Velha, Serra e Cariacica também recebem eventos regulares. No interior, Cachoeiro de Itapemirim e São Mateus sediam corridas que movimentam comunidades de atletas do campo e da cidade. Provas de trail nas montanhas do sul do estado, como na região de Domingos Martins e Venda Nova do Imigrante, atraem atletas de todo o Sudeste.',
  GO: 'Goiás, estado do coração do Brasil, tem Goiânia como um dos maiores polos de corridas de rua do Centro-Oeste. A capital concentra provas de asfalto no Parque Flamboyant, na Av. Anhanguera e nos circuitos do Setor Marista, além de receber a tradicional Maratona de Goiânia. Anápolis e Aparecida de Goiânia completam o calendário regional. A Chapada dos Veadeiros, Parque das Emas e as serras do entorno de Goiás Velho oferecem trilhas para amantes do trail running. O clima seco e fresquinho do inverno goiano, entre maio e agosto, é a temporada favorita dos atletas.',
  MA: 'O Maranhão, estado de transição entre o Nordeste e a Amazônia, tem São Luís como principal polo de corridas de rua. A capital, Patrimônio da Humanidade, oferece percursos históricos pelo Centro e pela Lagoa da Jansen, além de provas na orla da Ponta D\'Areia. O calendário maranhense conta também com eventos em Imperatriz, segunda maior cidade, e em municípios do interior. As Lençóis Maranhenses inspiram corridas de aventura que ganham projeção nacional. As condições climáticas — chuvas intensas de janeiro a junho — concentram as maiores provas no segundo semestre.',
  MT: 'Mato Grosso, estado de fronteiras entre o Cerrado, o Pantanal e a Amazônia, tem Cuiabá como principal sede de provas de rua. A capital é conhecida pelas altas temperaturas — largadas às 5h30 são comuns no verão — e por um circuito de corridas que inclui provas noturnas no entorno do Pantanal. Rondonópolis e Sinop também possuem comunidades de corrida ativas. Provas de trail no Parque Nacional da Chapada dos Guimarães atraem atletas de todo o Brasil. O Pantanal inspira corridas e ciclismo de aventura que combinam esporte e ecoturismo.',
  MS: 'Mato Grosso do Sul tem Campo Grande como principal polo de corridas de rua do estado. A capital, conhecida como "Cidade Morena", possui um circuito urbano movimentado, com provas no Parque dos Poderes e na Orla Morena. Dourados, Três Lagoas e Corumbá sediam eventos regionais que atraem corredores do Paraguai e da Bolívia. O Pantanal sul-mato-grossense é palco de corridas de aventura e ultramaratonas de alto nível. O clima ameno no inverno e as manhãs ensolaradas tornam o estado um destino atraente para maratonistas e praticantes de trail running.',
  MG: 'Minas Gerais é um dos estados mais ricos em corridas de rua do Brasil. Belo Horizonte centraliza o calendário com a Maratona de BH, o Circuito das Estações e dezenas de provas mensais nos bairros e parques da capital. Uberlândia, Juiz de Fora, Montes Claros e o Triângulo Mineiro têm circuitos independentes consolidados. As serras do estado — Serra do Cipó, Serra Negra, Mantiqueira — são destinos obrigatórios para trilhas e ultramaratonas. Ouro Preto e Tiradentes inspiram provas históricas com percursos em pedras portuguesas. A comunidade mineira de corredores é uma das maiores e mais bem estruturadas do país.',
  PA: 'O Pará, coração da Amazônia, tem Belém como principal polo de corridas de rua do Norte. A capital, famosa pelo Ver-o-Peso e pela Baía do Guajará, recebe provas no Hangar, na Doca do Ver-o-Peso e ao longo da Av. Nazaré. A Maratona do Pará e o Circuito Amazônico atraem atletas de todo o Brasil. Ananindeua, Santarém e Marabá sediam eventos regionais. As selvas e os rios do estado inspiram trilhas de aventura e corridas ecológicas que ganham visibilidade nacional. O calor amazônico exige estratégia de hidratação e largadas no amanhecer.',
  PB: 'A Paraíba tem João Pessoa, uma das capitais com maior índice de qualidade de vida do Brasil, como principal polo de corridas. Os percursos à beira-mar em Tambaú, Manaíra e na Orla de João Pessoa são cenários frequentes de provas do circuito nordestino. Campina Grande, segunda maior cidade, possui uma comunidade de corredores bastante ativa e realiza corridas populares durante todo o ano. O litoral paraibano, com suas praias e faléisas, e o agreste, com clima mais ameno, oferecem cenários variados para diferentes tipos de provas.',
  PR: 'O Paraná possui um dos calendários de corridas de rua mais ricos do Brasil. Curitiba, capital com clima europeu e parques exuberantes, é sede da tradicional Maratona de Curitiba e de dezenas de provas mensais no Parque Barigui, no Passaúna e na Linha Verde. Londrina, Maringá, Foz do Iguaçu e a região metropolitana complementam o calendário paranaense. O inverno rigoroso não intimida os corredores, que encaram provas com temperatura negativa. Trilhas na Serra do Mar, no Marumbi e no Parque Nacional do Superagui atraem ultramaratonistas de todo o Sul e Sudeste.',
  PE: 'Pernambuco tem Recife como um dos maiores centros de corridas de rua do Nordeste. A capital, com seus pontes e rios, oferece percursos únicos como o Circuito das Pontes e as provas na Orla de Boa Viagem. A Meia Maratona de Recife e o Revezamento da Paz estão entre as provas mais tradicionais. Caruaru, Petrolina e Olinda sediam eventos regionais de grande apelo. O Carnaval de rua de Olinda inspira corridas temáticas que misturam esporte e cultura. O Agreste e o Sertão pernambucano recebem ultramaratonas e provas de resistência que ganham reconhecimento nacional.',
  PI: 'O Piauí, estado do meio-norte do Brasil, tem Teresina como polo principal de corridas de rua. A capital, às margens dos rios Parnaíba e Poti, realiza provas noturnas e circuitos urbanos organizados pela Federação Piauiense de Atletismo. Parnaíba, no litoral, e Picos, no interior, também sediam eventos ao longo do ano. Os Lençóis Piauienses e o Parque Nacional da Serra da Capivara inspiram corridas de aventura que combinam esporte, natureza e cultura. O calor intenso do sertão piauiense é superado com largadas ao amanhecer e provas noturnas nos meses mais quentes.',
  RJ: 'O Rio de Janeiro é o berço das corridas de rua no Brasil. A Maratona do Rio, uma das mais antigas e bonitas do mundo, corta a cidade pela Zona Sul com vistas do Pão de Açúcar e do Cristo Redentor. O circuito carioca inclui provas na Orla de Ipanema e Copacabana, no Aterro do Flamengo, em Niterói e nos municípios da Baixada Fluminense e da Região Serrana. Petrópolis, Teresópolis e Nova Friburgo sediam trilhas na Mata Atlântica de alto nível. O Rio reúne mais de 500 provas por ano, formando uma das comunidades de corredores mais apaixonadas do mundo.',
  RN: 'O Rio Grande do Norte tem Natal como principal palco de corridas de rua, com percursos nas praias de Ponta Negra, na Via Costeira e no Parque das Dunas. A capital é sede de provas internacionais e do tradicional Circuito das Praias. Mossoró, segunda maior cidade, possui comunidade de corredores ativa e calendário próprio. As dunas e praias do litoral potiguar formam cenários deslumbrantes para corridas e trilhas. O clima quente e ventoso do RN, com brisas constantes do Atlântico, torna as manhãs agradáveis para treinos. Parnamirim, São Gonçalo do Amarante e Macaíba completam o calendário regional.',
  RS: 'O Rio Grande do Sul tem uma das tradições mais sólidas de corridas de rua do Brasil. Porto Alegre concentra eventos como a Maratona de Porto Alegre e dezenas de provas nos parques da capital. Caxias do Sul, referência na Serra Gaúcha, realiza o tradicional Circuito das Vinhas. Pelotas, Santa Maria e o litoral gaúcho completam o calendário. O inverno rigoroso do Sul não para os corredores gaúchos, que encaram frio com determinação. Trilhas e corridas de montanha na Serra Gaúcha, nas Aparados da Serra e no Litoral Norte atraem atletas de todo o país.',
  RO: 'Rondônia, estado do Norte com capital Porto Velho, tem uma comunidade de corredores em expansão às margens do Rio Madeira. Porto Velho concentra as principais provas do estado, com percursos urbanos e corridas noturnas muito bem organizadas. Ji-Paraná, Ariquemes e Vilhena também sediam eventos ao longo do ano. O clima quente e úmido exige planejamento cuidadoso para largadas no início da manhã. A floresta amazônica que cobre grande parte de Rondônia inspira provas de trilha e corridas ecológicas em unidades de conservação. A Federação Rondoniense de Atletismo organiza o calendário de competições estaduais.',
  RR: 'Roraima, o estado mais ao norte do Brasil, tem Boa Vista como principal polo de corridas de rua. A capital, às margens do Rio Branco e próxima à fronteira com a Venezuela e Guiana, realiza provas urbanas em um circuito plano e bem estruturado. O Parque Anauá e as margens do Rio Branco são cenários frequentes de provas. A Lavradaria, ecossistema único de savana amazônica, inspira trilhas e corridas ecológicas. O clima seco e quente de setembro a março concentra os eventos de maior porte. A comunidade de corredores de Boa Vista cresce a cada ano com o apoio da Federação Roraimense de Atletismo.',
  SC: 'Santa Catarina possui um calendário de corridas de rua que cresce a cada ano. Florianópolis, a capital com seus 42 km de praias, é palco de provas icônicas como a Maratona Internacional de Florianópolis. Joinville, Blumenau, Criciúma e a região do Vale do Itajaí sediam eventos de grande porte. O inverno ameno do litoral e o frio serrano de São Joaquim e Urubici oferecem condições variadas para todos os perfis de corredores. Trilhas na Serra Catarinense e nos contrafortes da Serra Geral atraem ultramaratonistas. Santa Catarina é referência nacional em organização de provas e infraestrutura para o esporte de rua.',
  SP: 'São Paulo é a capital mundial das corridas de rua no Brasil. Com mais de 1.000 provas por ano, o estado concentra o maior volume de eventos do país. A Maratona de São Paulo e a São Silvestre são eventos internacionais de prestígio. O Parque Ibirapuera, o Parque Villa-Lobos e os circuitos do ABC e Grande SP movimentam centenas de milhares de corredores semanalmente. Campinas, Ribeirão Preto, Santos e o litoral paulista completam um calendário inesgotável. Trilhas na Serra da Mantiqueira e no Vale do Paraíba atraem praticantes de trail running e ultramaratonas de alto nível de todo o Brasil.',
  SE: 'Sergipe, o menor estado do Brasil, tem Aracaju como palco principal de corridas de rua. A capital, com sua orla do Rio Sergipe e as praias de Atalaia, recebe provas populares que atraem atletas de todo o Nordeste. A Meia Maratona de Aracaju é o evento de maior destaque do calendário sergipano. Lagarto, Itabaiana e Nossa Senhora do Socorro também sediam corridas locais com boa participação. O litoral sergipano, com praias tranquilas e percursos à beira-mar, é um destino em ascensão para corredores de outros estados que buscam provas com belas paisagens.',
  TO: 'Tocantins, estado do norte do Brasil Central com capital Palmas, tem um circuito de corridas que cresce junto com a jovem capital planejada. Os percursos às margens do Lago de Palmas, no Parque Cesamar e no entorno do Palácio do Araguaia oferecem cenários únicos para provas de rua. Araguaína e Gurupi sediam eventos regionais que complementam o calendário. O Parque Estadual do Jalapão, ecossistema único de cerrado com cachoeiras e dunas, inspira corridas de aventura e trilhas de alto nível. O inverno seco e as manhãs frescas, entre maio e setembro, são a temporada favorita dos corredores tocantinenses.',
};
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
  const q = new URLSearchParams({ select: 'slug,nome,cidade,estado,data,horario,corrida_distancias(rotulo,km)', status: 'eq.publicado', data: `gte.${hojeBR()}`, order: 'data.asc,id' });
  if (uf) q.set('estado', `eq.${uf}`);
  let lista = [];
  for (let de = 0; de < 10000; de += 1000) { // o banco devolve no máximo 1000 por vez
    const r = await fetch(`${SUPABASE_URL}/rest/v1/corridas?${q}`, { headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${SUPABASE_KEY}`, range: `${de}-${de + 999}` }, signal: AbortSignal.timeout(6000) });
    if (!r.ok) throw new Error(`banco ${r.status}`);
    const j = await r.json();
    lista = lista.concat(j);
    if (j.length < 1000) break;
  }
  return lista;
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
<script defer src="/_vercel/insights/script.js"></script>
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
        + (lista.length ? `<h2>Próximas corridas em ${esc(nomeUF)}</h2><ul class="lp-lista">${lista.slice(0, 120).map(cartao).join('')}</ul>${lista.length > 120 ? `<p class="lp-mais">Mostrando as 120 primeiras. Escolha uma cidade acima para ver as demais.</p>` : ''}` : '')
        + (DESC_UF[uf] ? `<section class="lp-sobre"><h2>Corridas de rua em ${esc(nomeUF)}</h2><p>${esc(DESC_UF[uf])}</p></section>` : '');
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
