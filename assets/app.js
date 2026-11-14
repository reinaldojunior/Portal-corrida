/* ================== Configuração ================== */
const SUPABASE_URL = 'https://ssfsxdmzbubvygctdjgf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_s2yoUApfYl_ZvSUkqYYrVw_uXwKsybM';
const CENTRO = [-23.0903, -47.2181]; // Indaiatuba
const RAIO_KM = 30;
const DOMINIO_ADMIN = 'admin.paceclub.app'; // o usuário "junior" entra como junior@admin.paceclub.app no Supabase

// Armazenamento do login: usa o do navegador e, se estiver bloqueado, guarda só na memória
const memoria = {};
const armazenamento = {
  getItem: (k) => { try { return localStorage.getItem(k); } catch { return memoria[k] ?? null; } },
  setItem: (k, v) => { try { localStorage.setItem(k, v); } catch { memoria[k] = v; } },
  removeItem: (k) => { try { localStorage.removeItem(k); } catch { delete memoria[k]; } }
};
let sb = null;
try { sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { storage: armazenamento } }); }
catch (e) { console.warn('Mapmove: não foi possível iniciar o Supabase', e); }
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const MESES_L = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
const DIAS = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

const estado = { modulos: {}, listaModulos: [], corridas: [], noticias: [], dicas: [], filtro: 'todas', camada: 'mapa', admin: false };

/* ================== Utilidades ================== */
function partes(dataISO) {
  const [a, m, d] = dataISO.split('-').map(Number);
  const dt = new Date(a, m - 1, d);
  return { dia: String(d).padStart(2, '0'), mes: MESES[m - 1], mesL: MESES_L[m - 1], sem: DIAS[dt.getDay()], ano: a, d };
}
function dataLonga(iso) { const p = partes(iso); return `${p.sem}, ${p.d} de ${p.mesL}`; }
function hojeISO() { const h = new Date(); return new Date(h.getTime() - h.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
function distKm(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad, dLng = (b[1] - a[1]) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
function slugify(t) { return t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
function bib(iso, peq) { const p = partes(iso); return `<div class="bib${peq ? ' p' : ''}" aria-hidden="true"><div class="mes">${p.mes}</div><div class="dia">${p.dia}</div></div>`; }
// Ordem das distâncias: por km; provas por tempo (6h, 12h) e sem distância vão para o fim
const ordemDist = (d) => (d.km != null && +d.km > 0 ? +d.km : d.horas ? 1000 + +d.horas : 2000);
const porDist = (a, b) => ordemDist(a) - ordemDist(b);
function rotulos(c) { return (c.corrida_distancias || []).slice().sort(porDist).map((d) => d.rotulo); }
function toast(t) { const el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); el.textContent = t; document.body.appendChild(el); setTimeout(() => el.remove(), 2600); }
const mod = (k) => !!estado.modulos[k];
const publicadas = () => estado.corridas.filter((c) => c.status === 'publicado');
function passaFiltro(c) {
  if (estado.filtro === 'todas') return true;
  const alvo = { '5K': [4, 6], '10K': [8, 12], '21K': [15, 25], '42K': [30, 50] }[estado.filtro];
  return (c.corrida_distancias || []).some((d) => d.km != null && +d.km >= alvo[0] && +d.km <= alvo[1]);
}
const linkSeguro = (u) => (/^https?:\/\//i.test(u || '') ? u : null);
function linkCorrida(c) {
  if (mod('pagina_corrida')) return { href: `/corrida/${encodeURIComponent(c.slug)}`, ext: false };
  if (linkSeguro(c.link_inscricao)) return { href: c.link_inscricao, ext: true };
  return null;
}
// rotas do painel que exigem o login do admin
async function fetchAdmin(url) {
  const { data: { session } } = await sb.auth.getSession();
  return fetch(url, { headers: { authorization: `Bearer ${session ? session.access_token : ''}` } });
}

/* ================== Carregamento ================== */
const DEMO = (() => {
  const d = (km, rotulo) => ({ km, rotulo, preco: null });
  const c = (slug, nome, cidade, lat, lng, data, horario, dists) => ({ id: slug, slug, nome, cidade, estado: 'SP', lat, lng, data, horario, status: 'publicado', inscricoes_abertas: true, kit_inclui: [], corrida_distancias: dists });
  return {
    modulos: [['agenda', 'Agenda de corridas', true], ['mapa', 'Mapa de corridas', true], ['noticias', 'Notícias', true], ['calculadora', 'Calculadora de pace', true], ['zonas_fc', 'Zonas de frequência cardíaca', true], ['ritmos_treino', 'Ritmos de treino', true], ['pulseira_pace', 'Pulseira de pace', true], ['conversor_esteira', 'Conversor de esteira', true], ['ranking_recorde', 'Onde bater meu recorde', true], ['simulador', 'Simulador da prova', true], ['aviso_provas', 'Aviso de novas provas', true], ['pagina_corrida', 'Página da corrida', false]].map(([chave, nome, ativo], i) => ({ chave, nome, ativo, ordem: i })),
    corridas: [
      c('d1', 'Track&Field Experience Corre Delas Outubro Rosa', 'Indaiatuba', -23.0950, -47.2100, '2026-10-18', '07:00', []),
      c('d2', 'Live Run XP', 'Campinas', -22.9100, -47.0500, '2026-10-18', null, [d(21.0975, '21K')]),
      c('d3', 'Aero Night Run', 'Campinas', -22.9150, -47.0650, '2026-10-24', '19:00', [d(6, '6K')]),
      c('d4', '2ª Corrida FB Run Circuito Panamericano', 'Elias Fausto', -23.0428, -47.3736, '2026-10-31', null, []),
      c('d5', 'Corrida Histórica de Campinas', 'Campinas', -22.9056, -47.0608, '2026-11-01', null, []),
      c('d6', '1ª Meia Maratona de Indaiatuba', 'Indaiatuba', -23.0840, -47.2250, '2026-12-13', null, [d(21.0975, '21K')])
    ],
    noticias: [
      { titulo: 'Indaiatuba ganha sua primeira meia maratona em dezembro', resumo: 'Prova de 21K larga do Complexo Rei Pelé no dia 13 e fecha a temporada na região.', editoria: 'regiao', destaque: true },
      { titulo: 'Como montar o treino para a sua primeira meia maratona', editoria: 'treino' },
      { titulo: 'Altimetria: por que olhar as subidas antes de se inscrever', editoria: 'percurso' },
      { titulo: 'Tênis de treino e tênis de prova: quando vale ter os dois', editoria: 'equipamento' },
      { titulo: 'As grandes maratonas internacionais de 2027', editoria: 'mundo' }
    ]
  };
})();
function modoDemo(motivo) {
  console.warn('Mapmove em modo demonstração:', motivo);
  estado.demo = true;
  estado.listaModulos = DEMO.modulos;
  estado.modulos = Object.fromEntries(DEMO.modulos.map((x) => [x.chave, x.ativo]));
  estado.corridas = DEMO.corridas;
  estado.noticias = DEMO.noticias;
  const aviso = document.createElement('div');
  aviso.setAttribute('role', 'status');
  aviso.style.cssText = 'background:#FFF1D6;color:#6B4000;font-size:14px;padding:10px 20px;text-align:center;position:relative;z-index:650';
  aviso.textContent = 'Modo demonstração: esta visualização não consegue acessar o banco de dados, então mostra corridas de exemplo. Publicado num endereço real, o site usa os dados do Supabase.';
  document.body.prepend(aviso);
  estado.pos = lerPosSalva();
  aplicarModulos(); montarHome(); rotear(); rotuloPerto(); localizacaoAutomatica();
}
// O banco devolve no máximo 1000 linhas por consulta: busca em páginas até acabar.
// Recebe uma função que monta a consulta (sem .range) e devolve { data, error } como o Supabase.
async function todasPaginas(consulta) {
  let data = [];
  for (let de = 0; ; de += 1000) {
    const r = await consulta().range(de, de + 999);
    if (r.error) return { data: null, error: r.error };
    data = data.concat(r.data || []);
    if (!r.data || r.data.length < 1000) return { data, error: null };
  }
}
async function carregar() {
  let m, c, n;
  if (!sb) return modoDemo('biblioteca do Supabase indisponível');
  const limite = new Promise((_, rej) => setTimeout(() => rej(new Error('tempo esgotado ao conectar')), 10000));
  try {
    [m, c, n] = await Promise.race([limite, Promise.all([
    sb.from('modulos').select('*').order('ordem'),
    todasPaginas(() => sb.from('corridas').select('*, corrida_distancias(*)').gte('data', hojeISO()).order('data').order('id')),
    buscarNoticias()
  ])]);
  } catch (e) { return modoDemo(e.message || e); }
  if (m.error || c.error) {
    const e = m.error || c.error;
    const msg = String(e.message || e);
    if (/postMessage|Failed to fetch|NetworkError|Load failed|cloned/i.test(msg)) return modoDemo(msg);
    $('#listaPerto').innerHTML = `<p class="vazio">Não foi possível carregar as corridas.<br><small style="font-family:monospace">${esc(msg)}${e.code ? ' · código ' + esc(e.code) : ''}${e.hint ? ' · ' + esc(e.hint) : ''}</small></p>`;
    console.error('Mapmove: erro ao ler o Supabase:', msg, e.hint || '', e.code || '');
    return;
  }
  estado.listaModulos = m.data;
  estado.modulos = Object.fromEntries(m.data.map((x) => [x.chave, x.ativo]));
  estado.corridas = c.data;
  guardarNoticias(n.error ? [] : n.data);
  estado.pos = lerPosSalva(); // quem já aceitou antes abre direto perto de si
  try { aplicarModulos(); montarHome(); rotear(); rotuloPerto(); localizacaoAutomatica(); }
  catch (e) { console.error('Mapmove: erro ao montar a página', e); $('#listaPerto').innerHTML = '<p class="vazio">Algo deu errado ao montar a página. Recarregue para tentar de novo.</p>'; }
}

function aplicarModulos() {
  $$('[data-mod]').forEach((el) => {
    const ativo = mod(el.dataset.mod);
    if (el.id === 'noticias') return; // decidido em montarHome
    el.hidden = !ativo;
  });
  $$('[data-mod-algum]').forEach((el) => { el.hidden = !el.dataset.modAlgum.split(' ').some(mod); });
}

/* ================== Home ================== */
let mapaCompacto, timerContagem;
const origem = () => estado.pos || CENTRO;
const pertoLista = () => {
  const o = origem();
  const l = publicadas().filter((c) => c.lat == null || distKm(o, [c.lat, c.lng]) <= RAIO_KM);
  return estado.pos ? l.sort((a, b) => (a.lat == null ? 1e9 : distKm(o, [a.lat, a.lng])) - (b.lat == null ? 1e9 : distKm(o, [b.lat, b.lng]))) : l;
};
const textoDist = (c) => (estado.pos && c.lat != null ? `a ${Math.max(1, Math.round(distKm(estado.pos, [c.lat, c.lng])))} km` : '');
const ddmm = (iso) => { const [, m, d] = iso.split('-'); return `${d}/${m}`; };
function abreLink(c, cls) {
  const l = linkCorrida(c);
  return l ? [`<a class="${cls}" href="${esc(l.href)}"${l.ext ? ' target="_blank" rel="noopener"' : ''}>`, '</a>'] : [`<div class="${cls}">`, '</div>'];
}

function montarHome() {
  montarContagem();
  montarCartoes();
  montarQuadro();
  const temNoticias = mod('noticias') && estado.noticias.length > 0;
  $('#noticias').hidden = !temNoticias;
  $('#gradeHome').classList.toggle('so-quadro', !temNoticias);
  $('#gradeHome').hidden = !temNoticias && !mod('agenda');
  if (temNoticias) montarNoticias();
  const temDicas = mod('dicas') && estado.dicas.length > 0;
  $('#dicas').hidden = !temDicas;
  if (temDicas) montarDicas();
  if (mod('calculadora')) calcular();
  if (mod('zonas_fc')) montarZonas();
  if (mod('ranking_recorde')) montarRanking();
  if (mod('ritmos_treino')) calcRitmos();
  if (mod('pulseira_pace')) calcPulseira();
  if (mod('conversor_esteira')) calcEsteira('pace');
  $('#mapaHero').hidden = !mod('mapa');
  if (mod('mapa')) montarMapaCompacto();
}

function proximaLargada() {
  const agora = Date.now();
  return pertoLista()
    .map((c) => ({ c, t: new Date(`${c.data}T${(c.horario || '07:00').slice(0, 5)}:00-03:00`).getTime() }))
    .filter((x) => x.t > agora - 3 * 3600e3)
    .sort((a, b) => a.t - b.t)[0];
}
function montarContagem() {
  const box = $('#contagem');
  const prox = mod('agenda') && proximaLargada();
  clearInterval(timerContagem);
  if (!prox) { box.hidden = true; return; }
  box.hidden = false;
  const { c, t } = prox;
  const l = linkCorrida(c);
  const a = $('#contLink');
  if (l) { a.href = l.href; if (l.ext) { a.target = '_blank'; a.rel = 'noopener'; } else a.removeAttribute('target'); } else a.removeAttribute('href');
  $('#contNome').textContent = c.nome;
  $('#contInfo').textContent = `${c.cidade} · ${dataLonga(c.data)}${c.horario ? ', ' + c.horario.slice(0, 5).replace(':', 'h') : ''}`;
  const z = (n) => String(n).padStart(2, '0');
  const tick = () => {
    let s = Math.max(0, Math.floor((t - Date.now()) / 1000));
    const d = Math.floor(s / 86400); s %= 86400;
    const h = Math.floor(s / 3600); s %= 3600;
    const m = Math.floor(s / 60);
    $('#contRelogio').innerHTML = [[d, 'dias'], [h, 'horas'], [m, 'min']]
      .map(([v, r]) => `<span class="dig"><b>${z(v)}</b><small>${r}</small></span>`).join('');
  };
  tick();
  timerContagem = setInterval(tick, 30000);
}

function montarCartoes() {
  desenharFiltros($('#filtrosPainel'));
  const lista = pertoLista().filter(passaFiltro);
  $('#painelTit').textContent = lista.length === 1 ? '1 corrida perto de você' : `${lista.length} corridas perto de você`;
  $('#listaPerto').innerHTML = lista.length ? lista.slice(0, 12).map(cartao).join('') :
    `<p class="vazio">${estado.filtro === 'todas' ? 'Nenhuma corrida publicada por enquanto. Assim que novas provas forem confirmadas, elas aparecem aqui.' : 'Nenhuma corrida com essa distância por perto. Escolha outra distância ou veja todas.'}</p>`;
}
function cartao(c) {
  const p = partes(c.data);
  const [abre, fecha] = abreLink(c, 'cartao');
  const chips = rotulos(c).map((r) => `<span class="chip">${esc(r)}</span>`).join('');
  return `${abre}<span class="cartao-faixa"><span>${p.sem.toUpperCase()}</span><span>${esc(c.cidade.toUpperCase())}</span></span>` +
    `<span class="cartao-corpo"><span class="cartao-dia">${p.dia}</span><span class="cartao-info"><span class="cartao-mes">${p.mesL.charAt(0).toUpperCase() + p.mesL.slice(1)}${textoDist(c) ? ' · ' + textoDist(c) : ''}</span>` +
    `<span class="cartao-nome">${esc(c.nome)}</span>${chips ? `<span class="chips">${chips}</span>` : ''}</span></span>` +
    `${c.inscricoes_abertas ? '' : '<span class="cartao-enc">Inscrições encerradas</span>'}${fecha}`;
}

function montarQuadro() {
  const lista = publicadas().slice(0, 8);
  $('#quadro').hidden = !mod('agenda');
  $('#quadroLinhas').innerHTML = lista.length ? lista.map((c) => {
    const [abre, fecha] = abreLink(c, 'q-linha');
    const st = c.inscricoes_abertas ? ['ABERTAS', 'ab'] : ['ENCERRADAS', 'enc'];
    return `${abre}<span class="q-data">${ddmm(c.data)}</span><span class="q-nome">${esc(c.nome)} <span>· ${esc(c.cidade)}</span></span>` +
      `<span class="q-dist">${esc(rotulos(c).join(' ') || '—')}</span><span class="q-st ${st[1]}">${st[0]}</span>${fecha}`;
  }).join('') : '<p class="vazio" style="color:#9AA0A6;border-color:#2A2F34">Nenhuma prova no quadro ainda.</p>';
}

function fotoOuVazio(url, alt) { return url ? `<div class="foto"><img src="${esc(url)}" alt="${esc(alt)}" loading="lazy"></div>` : '<div class="foto"></div>'; }

const _PH_PALETAS = [
  { bg: '#1d4ed8', text: '#e0eaff' },
  { bg: '#0f766e', text: '#ccfbf1' },
  { bg: '#7c3aed', text: '#ede9fe' },
  { bg: '#b45309', text: '#fef3c7' },
  { bg: '#be185d', text: '#fce7f3' },
  { bg: '#166534', text: '#dcfce7' },
  { bg: '#9f1239', text: '#fee2e2' },
];
function _phHash(uf) { let h = 0; for (let i = 0; i < (uf||'').length; i++) h = (h * 31 + uf.charCodeAt(i)) & 0xffff; return h % _PH_PALETAS.length; }
function _phLinhas(str, max) {
  const palavras = str.split(' '); const linhas = []; let l = '';
  for (const p of palavras) {
    if ((l + ' ' + p).trim().length > max && l) { linhas.push(l.trim()); l = p; if (linhas.length === 2) { l = '…'; break; } }
    else l = (l + ' ' + p).trim();
  }
  if (l) linhas.push(l.trim()); return linhas;
}
// cidade: exibido apenas quando lat=null (sem enriquecimento de local)
function placeholderImagem(nome, uf, distancias, cidade, opts = {}) {
  const { w = 400, h = 225 } = opts;
  const p = _PH_PALETAS[_phHash(uf)];
  const linhas = _phLinhas(nome, 22);
  const fs = Math.min(h * 0.1, 20);
  const lh = h * 0.13;
  const cidTxt = cidade && uf ? `${cidade}, ${uf}` : (uf || '');
  const blockH = (linhas.length - 1) * lh + (cidTxt ? lh * 1.4 : 0);
  const y0 = h * 0.5 - blockH / 2;
  const linhasSVG = linhas.map((l, i) =>
    `<text x="${w/2}" y="${y0 + i * lh}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="${fs}" font-weight="700" fill="${p.text}" dominant-baseline="middle">${esc(l)}</text>`
  ).join('');
  const cidSVG = cidTxt ? `<text x="${w/2}" y="${y0 + (linhas.length - 1) * lh + lh * 1.3}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="${Math.min(h * 0.075, 13)}" font-weight="500" fill="${p.text}" opacity=".65" dominant-baseline="middle">${esc(cidTxt)}</text>` : '';
  const distSVG = distancias ? `<text x="${w/2}" y="${h * 0.91}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="${Math.min(h * 0.065, 12)}" font-weight="500" fill="${p.text}" opacity=".5" dominant-baseline="middle">${esc(distancias)}</text>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="Sem foto — ${esc(nome)}"><rect width="${w}" height="${h}" fill="${p.bg}"/><rect width="${w}" height="${h}" fill="url(#ph_tex)" opacity=".08"/><defs><pattern id="ph_tex" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse"><circle cx="20" cy="20" r="1" fill="${p.text}"/></pattern></defs>${uf ? `<text x="${w/2}" y="${h * 0.72}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="${h * 1.0}" font-weight="700" fill="${p.text}" opacity=".07" dominant-baseline="auto">${esc(uf)}</text>` : ''}${linhasSVG}${cidSVG}${distSVG}</svg>`;
}
const NOMES_ED = { regiao: 'Região', brasil: 'Brasil', mundo: 'Mundo', treino: 'Treino', percurso: 'Percurso', equipamento: 'Equipamento', dica: 'Dica' };
function montarNoticias() {
  estado.noticias.forEach((n) => { if (!n.slug) n.slug = slugify(n.titulo); });
  const ns = estado.noticias.slice();
  const principal = ns.find((n) => n.destaque) || ns[0];
  const resto = ns.filter((n) => n !== principal).slice(0, 5);
  $('#noticiasConta').textContent = ns.length === 1 ? '1 matéria' : `${ns.length} matérias`;
  $('#noticiasConteudo').innerHTML = `
    <article class="manchete">
      <a class="manchete-foto" href="#noticia/${esc(principal.slug)}" tabindex="-1" aria-hidden="true">${principal.imagem_url ? `<img src="${esc(principal.imagem_url)}" alt="" loading="lazy">` : ''}<span class="selo">${esc(NOMES_ED[principal.editoria] || '')}</span></a>${principal.imagem_url && principal.imagem_credito ? `<small class="cred-foto">${esc(principal.imagem_credito)}</small>` : ''}
      <h3 class="display"><a class="link-noticia" href="#noticia/${esc(principal.slug)}">${esc(principal.titulo)}</a></h3>
      ${principal.resumo ? `<p>${esc(principal.resumo)}</p>` : ''}${principal.fonte_nome ? `<p class="credito" style="font-size:12px;opacity:.7;margin-top:4px">Com informações de ${principal.fonte_url ? `<a href="${esc(principal.fonte_url)}" target="_blank" rel="noopener">${esc(principal.fonte_nome)}</a>` : esc(principal.fonte_nome)}</p>` : ''}
    </article>
    ${resto.length ? `<ol class="lista-num">${resto.map((n, i) => `<li><span class="num">${String(i + 2).padStart(2, '0')}</span><span><span class="editoria">${esc(NOMES_ED[n.editoria] || '')}</span><a class="tit link-noticia" href="#noticia/${esc(n.slug)}">${esc(n.titulo)}</a></span></li>`).join('')}</ol>` : ''}`;
}

function montarDicas() {
  estado.dicas.forEach((d) => { if (!d.slug) d.slug = slugify(d.titulo); });
  $('#dicasGrade').innerHTML = estado.dicas.slice(0, 6).map((d) => `
    <a class="dica-card" href="#dica/${esc(d.slug)}">
      <span class="dica-tag">Dica</span>
      <h3>${esc(d.titulo)}</h3>
      ${d.resumo ? `<p>${esc(d.resumo)}</p>` : ''}
    </a>`).join('');
}

async function mostrarDica(slug) {
  const v = $('#vDica');
  estado.dicas.forEach((x) => { if (!x.slug) x.slug = slugify(x.titulo); });
  let d = estado.dicas.find((x) => x.slug === slug);
  if (!d && sb) { const r = await sb.from('noticias').select('*').eq('slug', slug).eq('editoria', 'dica').maybeSingle(); d = r.data; }
  if (!d) { v.innerHTML = '<div class="wrap" style="padding:64px 0"><h1 class="display" style="font-size:56px">Dica não encontrada</h1><p class="muted"><a href="#" style="color:var(--cone-txt);font-weight:600">Voltar para o início</a></p></div>'; return; }
  document.title = `${d.titulo} · Mapmove`;
  atualizarSEO({
    titulo: `${d.titulo} · Mapmove`,
    descricao: (d.resumo || d.titulo).slice(0, 160),
    url: `/dica/${d.slug || slugify(d.titulo)}`,
    tipo: 'article',
    ldJson: { '@context': 'https://schema.org', '@type': 'Article', headline: d.titulo, description: d.resumo || '', url: `${BASE_URL}/dica/${d.slug || slugify(d.titulo)}` },
  });
  const outras = estado.dicas.filter((x) => x.slug !== slug).slice(0, 4);
  v.innerHTML = `<div class="wrap pagina-noticia">
    <article class="noticia-art">
      <a href="#" class="voltar">← Voltar</a>
      <span class="editoria">Dica de corrida</span>
      <h1 class="display">${esc(d.titulo)}</h1>
      ${d.resumo ? `<p class="noticia-linha">${esc(d.resumo)}</p>` : ''}
      ${d.imagem_url ? `<figure class="noticia-foto"><img src="${esc(d.imagem_url)}" alt="">${d.imagem_credito ? `<figcaption>${esc(d.imagem_credito)}</figcaption>` : ''}</figure>` : ''}
      <div class="texto-corrida noticia-texto">${textoRico(d.conteudo || '')}</div>
    </article>
    ${outras.length ? `<aside class="noticia-mais"><h2 class="display">Mais dicas</h2><ol class="lista-num">${outras.map((o, i) => `<li><span class="num">${String(i + 1).padStart(2, '0')}</span><span><a class="tit link-noticia" href="#dica/${esc(o.slug)}">${esc(o.titulo)}</a></span></li>`).join('')}</ol></aside>` : ''}
  </div>`;
}

/* ================== Zonas de frequência cardíaca ================== */
const ZONAS = [
  { nome: 'Z1 · Recuperação', de: .5, ate: .6, cor: '#5B8DB8', dp: [110, 140], uso: 'Trote solto depois de prova ou de treino forte. Ajuda o corpo a se recuperar sem cansar mais.' },
  { nome: 'Z2 · Rodagem leve', de: .6, ate: .7, cor: '#4FA37A', dp: [60, 90], uso: 'A base de todo treino. Dá para conversar enquanto corre. É onde deve ficar a maior parte da semana.' },
  { nome: 'Z3 · Ritmo moderado', de: .7, ate: .8, cor: '#E4B63B', dp: [25, 45], uso: 'Treinos contínuos mais firmes. Conversar fica difícil, só frases curtas.' },
  { nome: 'Z4 · Ritmo de prova', de: .8, ate: .9, cor: '#FF7A2E', dp: [-10, 10], uso: 'Perto do ritmo de 10K. Usado em treinos de limiar e em blocos no ritmo da prova.' },
  { nome: 'Z5 · Tiros', de: .9, ate: 1, cor: '#E5484D', dp: [-35, -15], uso: 'Esforço máximo em tiros curtos, com descanso entre eles. Pouco tempo por semana.' }
];
const zst = { metodo: 'repmax', ativa: 2 };
function montarZonas() {
  const pc = $('#zPace');
  if (!pc.dataset.mexido && estado.pace10) pc.value = fmt(estado.pace10, true);
  const n = (id) => { const v = parseInt($(id).value, 10); return isNaN(v) ? null : v; };
  const m = zst.metodo;
  const usaIdade = m !== 'repmax', usaRep = m !== 'idade', usaMax = m === 'repmax';
  $('#zIdadeWrap').hidden = !usaIdade;
  $('#zRepWrap').hidden = !usaRep;
  $('#zMaxWrap').hidden = !usaMax;
  $('#zDica').textContent = usaMax
    ? 'Use a FC máxima do teste ergométrico ou a que o seu relógio registrou num esforço máximo. Com ela, a idade não é necessária.'
    : 'A FC máxima é estimada como 220 menos a idade. Essa estimativa pode errar bastante de pessoa para pessoa; se você tiver a sua máxima medida, use o modo Repouso e máxima.';
  const idade = n('#zIdade') || 35;
  const medida = n('#zMax');
  const max = usaMax && medida && medida > 100 ? medida : 220 - idade;
  const kv = usaRep;
  const rep = kv ? (n('#zRepouso') || 60) : 0;
  const bpm = (p) => Math.round(kv ? (max - rep) * p + rep : max * p);
  // aceita 5, 5:15, 5.15 ou 5,15 (minutos e segundos) e 515 (5:15)
  const lerPace = (v) => {
    v = String(v).trim();
    if (!v) return null;
    let m, s;
    const sep = v.match(/^(\d{1,2})[:.,](\d{1,2})$/);
    if (sep) { m = +sep[1]; s = +sep[2].padEnd(2, '0'); }
    else if (/^\d{1,2}$/.test(v)) { m = +v; s = 0; }
    else if (/^\d{3,4}$/.test(v)) { m = +v.slice(0, -2); s = +v.slice(-2); }
    else return NaN;
    if (s > 59) return NaN;
    const tot = m * 60 + s;
    return tot >= 150 && tot <= 900 ? tot : NaN;
  };
  const seg = lerPace(pc.value);
  const temPace = Number.isFinite(seg);
  $('#zPaceDica').textContent = Number.isNaN(seg)
    ? 'Digite o pace em minutos e segundos por km, por exemplo 5:15 ou 6:00.'
    : 'Se preencher, cada zona mostra também o ritmo aproximado. Pode deixar em branco.';
  $('#zPaceDica').style.color = Number.isNaN(seg) ? '#FF9B8F' : '';
  const ritmo = (s) => fmt(Math.max(120, s), true);
  $('#zRepWrap').hidden = !kv;
  $$('[data-metodo]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.metodo === zst.metodo));
  $('#zResumo').innerHTML =
    `<div><span>Máxima</span><b>${max}</b><small>${usaMax ? 'informada' : 'estimada pela idade'}</small></div>` +
    `<div><span>Repouso</span><b>${kv ? rep : '—'}</b><small>bpm</small></div>` +
    `<div><span>Reserva</span><b>${kv ? max - rep : '—'}</b><small>bpm</small></div>`;
  $('#zBarra').innerHTML = ZONAS.map((z) => `<span style="background:${z.cor}"></span>`).join('');
  $('#zEscala').innerHTML = `<span>${bpm(.5)} bpm</span><span>${max} bpm</span>`;
  $('#zCompacto').innerHTML = ZONAS.map((z) =>
    `<li><span class="ponto" style="background:${z.cor}"></span><span class="nm">${z.nome}</span><span class="bp" style="color:${z.cor}">${bpm(z.de)}–${bpm(z.ate)}</span></li>`).join('');
  $('#zLista').innerHTML = ZONAS.map((z) =>
    `<div class="zona" style="--cor:${z.cor}"><span class="cor"></span><span class="corpo"><span class="l1"><span class="nome">${z.nome}</span><span class="faixa">${bpm(z.de)}–${bpm(z.ate)}</span></span>` +
    `<span class="l2">${Math.round(z.de * 100)}–${Math.round(z.ate * 100)}%${temPace ? ` · pace ${ritmo(seg + z.dp[1])}–${ritmo(seg + z.dp[0])} /km` : ''}</span>` +
    `<span class="uso">${z.uso}</span></span></div>`).join('');
}
$('#ferrZonas').addEventListener('input', (e) => { if (e.target.id === 'zPace') e.target.dataset.mexido = '1'; montarZonas(); });
$('#ferrZonas').addEventListener('click', (e) => {
  const m = e.target.closest('[data-metodo]');
  if (m) { zst.metodo = m.dataset.metodo; montarZonas(); }
});

/* ================== Ritmos de treino (VDOT) ================== */
const vo2 = (v) => -4.60 + 0.182258 * v + 0.000104 * v * v;            // v em m/min
const pctMax = (t) => 0.8 + 0.1894393 * Math.exp(-0.012778 * t) + 0.2989558 * Math.exp(-0.1932605 * t); // t em min
const velDeVo2 = (o) => (-0.182258 + Math.sqrt(0.182258 ** 2 + 4 * 0.000104 * (4.60 + o))) / (2 * 0.000104);
function tempoPrevisto(vdot, km) {
  const d = km * 1000; let lo = d / 500, hi = d / 50;
  for (let i = 0; i < 60; i++) { const t = (lo + hi) / 2; (vo2(d / t) / pctMax(t) > vdot) ? lo = t : hi = t; }
  return (lo + hi) / 2 * 60;
}
function calcRitmos() {
  const km = Number($('#rtDist').value), s = segundos($('#rtTempo').value);
  if (!s || s < 600) { $('#rtVdot').textContent = '—'; $('#rtTabela').innerHTML = '<tbody><tr><td>Confira o tempo, no formato h:mm:ss.</td></tr></tbody>'; return; }
  const t = s / 60, vdot = vo2(km * 1000 / t) / pctMax(t);
  $('#rtVdot').textContent = vdot.toFixed(1).replace('.', ',');
  const pace = (pct) => 60000 / velDeVo2(vdot * pct);           // s/km
  const faixa = (a, b) => `${fmt(pace(a), true)}–${fmt(pace(b), true)}`;
  const linhas = [
    ['Rodagem leve', 'Maior parte da semana', faixa(.62, .70)],
    ['Ritmo de maratona', 'Treinos longos no ritmo da prova', fmt(tempoPrevisto(vdot, 42.195) / 42.195, true)],
    ['Limiar', 'Contínuo de 20 a 30 min', faixa(.86, .88)],
    ['Intervalado', 'Tiros de 3 a 5 min', faixa(.97, 1)],
    ['Tiro curto', 'Tiros de 200 a 400 m', faixa(1.05, 1.08)]
  ];
  $('#rtTabela').innerHTML = '<tbody>' + linhas.map(([n, u, p]) => `<tr><td>${n}<small>${u}</small></td><td>${p} /km</td></tr>`).join('') + '</tbody>';
}
['change', 'input'].forEach((ev) => { $('#rtDist').addEventListener(ev, calcRitmos); $('#rtTempo').addEventListener(ev, calcRitmos); });

/* ================== Pulseira de pace ================== */
let pzModo = 'constante';
function calcPulseira() {
  const km = Number($('#pzDist').value), T = segundos($('#pzTempo').value);
  $$('[data-pz]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.pz === pzModo));
  if (!T || T < 300) { $('#pzTabela').innerHTML = '<p class="vazio" style="padding:12px;border:0">Confira o tempo alvo, no formato h:mm:ss.</p>'; return; }
  // terminar mais forte: segunda metade 2% mais rápida
  const p1 = pzModo === 'negativo' ? (2 * T) / (km * 1.98) : T / km, p2 = pzModo === 'negativo' ? p1 * 0.98 : p1;
  const ate = (x) => x <= km / 2 ? x * p1 : (km / 2) * p1 + (x - km / 2) * p2;
  const marcas = []; for (let k = 1; k < km; k++) marcas.push(k); marcas.push(km);
  const meio = Math.round(km / 2);
  $('#pzTabela').innerHTML = `<table><thead><tr><th>Km</th><th>Pace</th><th>Passagem</th></tr></thead><tbody>` +
    marcas.map((k, i) => { const ini = i ? marcas[i - 1] : 0; const parc = (ate(k) - ate(ini)) / (k - ini);
      const rot = k === km ? (km % 1 ? km.toFixed(1).replace('.', ',') : km) : k;
      return `<tr${k === meio && km > 5 ? ' class="meio"' : ''}><td>${rot}</td><td>${fmt(parc, true)}</td><td>${fmt(ate(k))}</td></tr>`; }).join('') + '</tbody></table>';
}
['change', 'input'].forEach((ev) => { $('#pzDist').addEventListener(ev, calcPulseira); $('#pzTempo').addEventListener(ev, calcPulseira); });
$('#ferrPulseira').addEventListener('click', (e) => { const b = e.target.closest('[data-pz]'); if (b) { pzModo = b.dataset.pz; calcPulseira(); } });
$('#pzImprimir').addEventListener('click', () => { document.body.classList.add('imprimindo'); window.print(); setTimeout(() => document.body.classList.remove('imprimindo'), 500); });

/* ================== Conversor de esteira ================== */
const lerMinSeg = (v) => { const m = String(v).trim().match(/^(\d{1,2})(?:[:.,](\d{1,2}))?$/); if (!m) return null; const s = m[2] ? +m[2].padEnd(2, '0') : 0; return s > 59 ? null : +m[1] * 60 + s; };
function calcEsteira(origem) {
  const pc = $('#esPace'), kh = $('#esKmh'), mi = $('#esMilha');
  let sKm = null;
  if (origem === 'kmh') { const v = parseFloat(String(kh.value).replace(',', '.')); if (v >= 3 && v <= 30) sKm = 3600 / v; }
  else if (origem === 'milha') { const s = lerMinSeg(mi.value); if (s) sKm = s / 1.609344; }
  else sKm = lerMinSeg(pc.value);
  if (!sKm || sKm < 120 || sKm > 1200) return;
  if (origem !== 'pace') pc.value = fmt(sKm, true);
  if (origem !== 'kmh') kh.value = (3600 / sKm).toFixed(1).replace('.', ',');
  if (origem !== 'milha') mi.value = fmt(sKm * 1.609344, true);
}
$('#esPace').addEventListener('input', () => calcEsteira('pace'));
$('#esKmh').addEventListener('input', () => calcEsteira('kmh'));
$('#esMilha').addEventListener('input', () => calcEsteira('milha'));
$('#esTabela').innerHTML = '<tbody>' + [8, 9, 10, 11, 12, 13, 14, 15, 16].map((v) => `<tr><td>${v} km/h</td><td>${fmt(3600 / v, true)} /km</td></tr>`).join('') + '</tbody>';

/* ================== Percurso (GPX), altimetria, clima ================== */
const RAD = Math.PI / 180;
const metros = (a, b) => { const dLat = (b[0] - a[0]) * RAD, dLng = (b[1] - a[1]) * RAD; const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * RAD) * Math.cos(b[0] * RAD) * Math.sin(dLng / 2) ** 2; return 12742000 * Math.asin(Math.sqrt(x)); };

// Lê o texto de um arquivo GPX e devolve os pontos [lat, lng, altitude]
function lerGpx(texto) {
  const doc = new DOMParser().parseFromString(texto, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('Arquivo GPX inválido.');
  let nos = [...doc.getElementsByTagName('trkpt')];
  if (!nos.length) nos = [...doc.getElementsByTagName('rtept')];
  if (nos.length < 2) throw new Error('O arquivo não tem um trajeto com pontos.');
  return nos.map((n) => {
    const e = n.getElementsByTagName('ele')[0];
    const ele = e ? parseFloat(e.textContent) : NaN;
    return [parseFloat(n.getAttribute('lat')), parseFloat(n.getAttribute('lon')), Number.isFinite(ele) ? ele : null];
  }).filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
}

// Reduz para no máximo ~600 pontos e calcula distância, subida e descida
function prepararPercurso(pts) {
  let dist = 0; const comD = [[...pts[0], 0]];
  for (let i = 1; i < pts.length; i++) { dist += metros(pts[i - 1], pts[i]); comD.push([...pts[i], dist]); }
  const passo = Math.max(10, dist / 600);
  const red = [comD[0]];
  for (const p of comD) if (p[3] - red[red.length - 1][3] >= passo) red.push(p);
  if (red[red.length - 1] !== comD[comD.length - 1]) red.push(comD[comD.length - 1]);
  const temAlt = red.filter((p) => p[2] != null).length > red.length * 0.8;
  if (temAlt) { // suaviza a altitude (o GPS oscila)
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

// Distância acumulada (km) de cada ponto salvo
function comDistancia(c) {
  const p = c.percurso || []; let d = 0;
  const pts = p.map((x, i) => { if (i) d += metros(p[i - 1], x) / 1000; return { lat: x[0], lng: x[1], ele: x[2], km: d }; });
  // GPX costuma medir um pouco diferente da distância oficial (4,98 em vez de 5): ajusta proporcionalmente
  const of = +c.km_oficial;
  if (of && d && Math.abs(of - d) / of <= 0.15) { const f = of / d; pts.forEach((q) => { q.km *= f; }); }
  return pts;
}
function noKm(pts, km) {
  if (!pts.length) return null;
  if (km <= 0) return pts[0];
  for (let i = 1; i < pts.length; i++) if (pts[i].km >= km) {
    const a = pts[i - 1], b = pts[i], t = (km - a.km) / ((b.km - a.km) || 1);
    return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t, ele: a.ele == null ? null : a.ele + (b.ele - a.ele) * t, km };
  }
  return pts[pts.length - 1];
}

// Gráfico de altimetria em SVG
function svgAltimetria(pts, alturaPx = 140) {
  const comAlt = pts.filter((p) => p.ele != null);
  if (comAlt.length < 2) return '';
  const tot = pts[pts.length - 1].km, mn = Math.min(...comAlt.map((p) => p.ele)), mx = Math.max(...comAlt.map((p) => p.ele));
  const W = 1000, H = alturaPx, pad = 18, faixa = Math.max(20, mx - mn);
  const x = (k) => (k / tot) * W, y = (e) => H - pad - ((e - mn) / faixa) * (H - pad * 2);
  const linha = comAlt.map((p, i) => `${i ? 'L' : 'M'}${x(p.km).toFixed(1)} ${y(p.ele).toFixed(1)}`).join(' ');
  return `<svg class="altimetria" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Altimetria do percurso, de ${Math.round(mn)} a ${Math.round(mx)} metros">
    <path d="${linha} L${W} ${H} L0 ${H} Z" fill="var(--alt-area)"/>
    <path d="${linha}" fill="none" stroke="var(--alt-linha)" stroke-width="2" vector-effect="non-scaling-stroke"/>
    <line class="alt-cursor" x1="0" x2="0" y1="0" y2="${H}" stroke="#FF4D00" stroke-width="2" vector-effect="non-scaling-stroke" style="display:none"/>
  </svg><div class="alt-escala"><span>${Math.round(mn)} m</span><span>${Math.round(mx)} m</span></div>`;
}

// Clima: previsão (até 16 dias antes) ou média dos 3 anos anteriores no mesmo dia
const cacheClima = {};
async function climaProva(c) {
  const chave = `${c.id}|${c.data}`;
  if (cacheClima[chave]) return cacheClima[chave];
  const lat = c.lat ?? CENTRO[0], lng = c.lng ?? CENTRO[1];
  const dias = (new Date(c.data + 'T12:00:00-03:00') - Date.now()) / 864e5;
  const q = `latitude=${lat}&longitude=${lng}&hourly=temperature_2m,relative_humidity_2m&timezone=America%2FSao_Paulo`;
  const pega = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error('clima'); const j = await r.json(); return j.hourly; };
  let horas, fonte;
  try {
    if (dias <= 15) {
      const h = await pega(`https://api.open-meteo.com/v1/forecast?${q}&start_date=${c.data}&end_date=${c.data}`);
      horas = h.temperature_2m.map((t, i) => ({ t, u: h.relative_humidity_2m[i] })); fonte = 'previsão do tempo';
    } else {
      const ano = +c.data.slice(0, 4), md = c.data.slice(4);
      const anos = await Promise.all([1, 2, 3].map((k) => pega(`https://archive-api.open-meteo.com/v1/archive?${q}&start_date=${ano - k}${md}&end_date=${ano - k}${md}`).catch(() => null)));
      const ok = anos.filter(Boolean);
      if (!ok.length) throw new Error('clima');
      horas = Array.from({ length: 24 }, (_, i) => ({
        t: ok.reduce((a, h) => a + h.temperature_2m[i], 0) / ok.length,
        u: ok.reduce((a, h) => a + h.relative_humidity_2m[i], 0) / ok.length
      }));
      fonte = `média de ${ok.length} ${ok.length === 1 ? 'ano anterior' : 'anos anteriores'} nesta data`;
    }
  } catch { return (cacheClima[chave] = null); }
  return (cacheClima[chave] = { horas, fonte });
}
const horaLargada = (c) => c.horario ? +c.horario.slice(0, 2) + +c.horario.slice(3, 5) / 60 : 7;
function climaNa(clima, hora) {
  if (!clima) return null;
  const i = Math.max(0, Math.min(22, Math.floor(hora))), t = hora - i, a = clima.horas[i], b = clima.horas[i + 1] || a;
  return { t: a.t + (b.t - a.t) * t, u: a.u + (b.u - a.u) * t };
}

/* ================== Simulador da prova ================== */
// Custo das subidas: +3,3% de tempo por 1% de inclinação; descidas devolvem 1,8% por 1%.
// Calor: +0,4% por °C acima de 15°C, e mais 0,1% por °C quando a umidade passa de 60%.
// Estratégia: est de -5 (sair forte, split positivo) a +5 (guardar para o fim, split negativo), até ±4% nas pontas.
// Subidas: adj de 0 (manter o mesmo ritmo, mais esforço) a 1 (manter o mesmo esforço, ritmo varia com o terreno).
function simular(c, pts, alvoSeg, clima, opc = {}) {
  const est = opc.est ?? 0, adj = opc.adj ?? 1, passo = opc.passo || 1;
  const tot = pts[pts.length - 1].km;
  const n = Math.max(1, Math.ceil(tot / passo - 0.1));
  const base = alvoSeg / tot, larg = horaLargada(c);
  const trechos = [];
  for (let i = 0; i < n; i++) {
    const ini = i * passo, fim = i === n - 1 ? tot : (i + 1) * passo, len = fim - ini;
    const a = noKm(pts, ini), b = noKm(pts, fim);
    const dEle = a.ele != null && b.ele != null ? b.ele - a.ele : 0;
    // ganho e perda acumulados dentro do trecho (não só a diferença entre começo e fim)
    let ganho = 0, perda = 0, ant = a.ele;
    if (ant != null) {
      for (const q of pts) { if (q.km <= ini || q.km >= fim || q.ele == null) continue; const d = q.ele - ant; if (d > 0) ganho += d; else perda -= d; ant = q.ele; }
      if (b.ele != null) { const d = b.ele - ant; if (d > 0) ganho += d; else perda -= d; }
    }
    // subidas pesam mais que descidas devolvem: +3,3% por 1% de subida, −1,8% por 1% de descida (descida limitada a 6%)
    const m = len * 1000, incUp = (ganho / m) * 100, incDown = Math.min(6, (perda / m) * 100);
    const fInc = 1 + 0.033 * incUp - 0.018 * incDown;
    const cl = climaNa(clima, larg + (alvoSeg * (ini + len / 2) / tot) / 3600);
    const fCal = cl ? 1 + 0.004 * Math.max(0, cl.t - 15) + (cl.u > 60 ? 0.001 * Math.max(0, cl.t - 15) : 0) : 1;
    const meio = (ini + len / 2) / tot;
    const fEst = 1 + (est / 5) * 0.04 * (1 - 2 * meio);
    trechos.push({ km: fim, rot: Math.abs(fim - Math.round(fim)) < 0.06 ? String(Math.round(fim)) : fim.toFixed(1).replace('.', ','), len, dEle, ganho, perda, f: fInc * fCal, w: (1 + adj * (fInc - 1)) * fCal * fEst, temp: cl ? cl.t : null });
  }
  const plano = trechos.reduce((s, t) => s + base * t.f * t.len, 0);
  const k = alvoSeg / trechos.reduce((s, t) => s + base * t.w * t.len, 0); let acum = 0;
  trechos.forEach((t) => { t.pace = base * t.w * k; acum += t.pace * t.len; t.pass = acum; });
  const metade = trechos.reduce((a, t) => { const ini = t.km - t.len, d1 = Math.max(0, Math.min(t.km, tot / 2) - ini); a[0] += d1 * t.pace; a[1] += (t.len - d1) * t.pace; return a; }, [0, 0]);
  return { plano, dif: plano - alvoSeg, trechos, tot, metade };
}

let simEstado = { alvo: null, comClima: true, km: 0, est: 0, adj: 100, passo: 1 }, simMapa = null, simFantasma = null, simFeito = null, simPts = [], simCorrida = null, simClima = null;
async function montarSimulador(c) {
  const box = $('#simBox');
  if (!box) return;
  simCorrida = c; simPts = comDistancia(c);
  const tot = simPts[simPts.length - 1].km;
  if (!simEstado.alvo || simEstado.corrida !== c.id) {
    const ref = estado.pace10 ? estado.pace10 * Math.pow(tot / 10, 1.06) * 10 : tot * 330;
    simEstado = { alvo: fmt(Math.round(ref / 60) * 60), comClima: false, km: 0, corrida: c.id, est: 0, adj: 100, passo: 1 };
  }
  $('#simAlvo').value = simEstado.alvo;
  $('#simEst').value = simEstado.est; $('#simAdj').value = simEstado.adj; $('#simPasso').value = String(simEstado.passo);
  if ($('#simKm')) $('#simKm').max = tot.toFixed(1);
  simClima = null;
  atualizarSimulador();
}
function atualizarSimulador() {
  const c = simCorrida; if (!c) return;
  const alvo = segundos($('#simAlvo').value);
  const clima = simEstado.comClima ? simClima : null;
  if (simClima && $('#simClimaInfo')) {
    const ini = climaNa(simClima, horaLargada(c)), fim = climaNa(simClima, horaLargada(c) + (alvo || 3600) / 3600);
    $('#simClimaInfo').textContent = `${Math.round(ini.t)}°C na largada e ${Math.round(fim.t)}°C na chegada, umidade de ${Math.round(ini.u)}% (${simClima.fonte}).`;
  }
  if (!alvo || alvo < 600) { $('#simResultado').innerHTML = '<p class="muted" style="margin:0">Digite o tempo alvo no formato h:mm:ss.</p>'; return; }
  const r = simular(c, simPts, alvo, clima, { est: simEstado.est, adj: simEstado.adj / 100, passo: simEstado.passo });
  textoEstrategia(r);
  const piores = r.trechos.filter((t) => t.len >= 0.5).sort((a, b) => b.f - a.f).slice(0, 2).sort((a, b) => a.km - b.km).map((t) => `km ${t.rot}`).join(' e ');
  $('#simResultado').innerHTML = `<span class="rot">SE VOCÊ CORRER NO RITMO PLANO DO ALVO</span>
    <div class="sim-tempo"><b>${fmt(r.plano)}</b><span class="${r.dif > 5 ? 'pior' : 'melhor'}">${r.dif > 5 ? `+${fmt(r.dif, true)} acima do alvo` : r.dif < -5 ? `${fmt(-r.dif, true)} abaixo do alvo` : 'no alvo'}</span></div>
    <p>${r.dif > 5 ? `${clima ? 'O percurso e o calor custam' : 'O percurso custa'} cerca de ${fmt(r.dif, true)}. Os trechos mais pesados são ${piores}. Para fechar em ${fmt(alvo)}, siga o ritmo de cada km abaixo: segure nas subidas e use as descidas para recuperar.` : 'Para o seu alvo, o percurso é praticamente neutro. Ritmo constante funciona bem.'}</p>`;
  const media = alvo / r.tot, maxDev = Math.max(...r.trechos.map((t) => Math.abs(t.pace - media))) || 1;
  $('#simBarras').innerHTML = r.trechos.map((t) => { const dv = t.pace - media, h = Math.max(3, Math.round(Math.abs(dv) / maxDev * 24));
    return `<span class="${dv >= 0 ? 'lento' : 'rapido'}" style="height:${h}px;${dv >= 0 ? `align-self:flex-start;margin-top:${28 - h}px` : `align-self:flex-end;margin-bottom:${28 - h}px`}" title="km ${t.rot}: ${fmt(t.pace, true)}/km"></span>`; }).join('');
  const maxG = Math.max(1, ...r.trechos.map((t) => t.ganho / t.len)), pior = r.trechos.reduce((x, t) => (t.ganho / t.len > x.ganho / x.len ? t : x), r.trechos[0]);
  $('#simTabela').innerHTML = `<table><thead><tr><th>Km</th><th>Ganho</th><th>Perda</th><th>Pace</th><th>Passagem</th></tr></thead><tbody>${r.trechos.map((t) => {
    const g = Math.round(t.ganho), pd = Math.round(t.perda), w = Math.round((t.ganho / t.len) / maxG * 100);
    return `<tr${t === pior && g >= 5 ? ' class="km-duro" title="Km com mais subida"' : ''}><td>${t.rot}</td><td class="ganho"><span class="g-barra" style="width:${w}%"></span><span class="${g >= 5 ? 'sobe' : ''}">+${g} m</span></td><td class="${pd >= 5 ? 'desce' : 'perda0'}">${pd ? '−' + pd : 0} m</td><td>${fmt(t.pace, true)}</td><td>${fmt(t.pass)}</td></tr>`; }).join('')}</tbody></table>`;
  simEstado.r = r;
  moverFantasma();
}
function moverFantasma() {
  const r = simEstado.r; if (!r || !$('#simKm')) return;
  const km = Math.min(r.tot, Number($('#simKm').value) || 0);
  const p = noKm(simPts, km);
  let pass = 0, pace = r.trechos[0].pace;
  for (const t of r.trechos) { const ini = t.km - t.len; if (km >= t.km) pass = t.pass; else { pass += (km - ini) * t.pace; pace = t.pace; break; } }
  if (simFantasma && p) { simFantasma.setLatLng([p.lat, p.lng]); simFeito.setLatLngs(simPts.filter((x) => x.km <= km).map((x) => [x.lat, x.lng]).concat([[p.lat, p.lng]])); }
  const cur = $('#vCorrida .alt-cursor'); if (cur) { const x = (km / r.tot) * 1000; cur.setAttribute('x1', x); cur.setAttribute('x2', x); cur.style.display = ''; }
  $('#simLeitura').innerHTML = [['Km', km.toFixed(1).replace('.', ',')], ['Altitude', p && p.ele != null ? Math.round(p.ele) + ' m' : '—'], ['Pace', fmt(pace, true)], ['Passagem', fmt(pass)]]
    .map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('');
}
function textoEstrategia(r) {
  const e = simEstado.est, a = simEstado.adj;
  $('#simEstTxt').textContent = e === 0 ? 'Ritmo igual do começo ao fim' : e > 0 ? `Guardar para o fim (split negativo, nível ${e})` : `Sair mais forte (split positivo, nível ${-e})`;
  $('#simAdjTxt').textContent = a >= 95 ? 'Esforço constante: mais lento na subida, recupera na descida' : a <= 5 ? 'Pace igual em tudo: a subida exige mais força' : a >= 50 ? 'Poupa um pouco nas subidas' : 'Força um pouco nas subidas';
  $('#simMetades').innerHTML = `<div><span>1ª METADE</span><b>${fmt(r.metade[0])}</b></div><div><span>2ª METADE</span><b>${fmt(r.metade[1])}</b></div><div><span>Diferença</span><b>${Math.abs(r.metade[1] - r.metade[0]) < 0.5 ? '0:00' : (r.metade[1] - r.metade[0] > 0 ? '+' : '−') + fmt(Math.abs(r.metade[1] - r.metade[0]), true)}</b></div><div><span>Ritmo plano</span><b>${fmt(r.plano)}</b></div>`;
}
document.addEventListener('input', (e) => {
  if (e.target.id === 'simAlvo') { simEstado.alvo = e.target.value; atualizarSimulador(); }
  if (e.target.id === 'simEst') { simEstado.est = Number(e.target.value); atualizarSimulador(); }
  if (e.target.id === 'simAdj') { simEstado.adj = Number(e.target.value); atualizarSimulador(); }
  if (e.target.id === 'simPasso') { simEstado.passo = Number(e.target.value); atualizarSimulador(); }
  if (e.target.id === 'simKm') moverFantasma();
});
document.addEventListener('click', (e) => {
  if (e.target.closest('#simClima')) { simEstado.comClima = !simEstado.comClima; atualizarSimulador(); }
  if (e.target.closest('#simReset')) { Object.assign(simEstado, { est: 0, adj: 100 }); $('#simEst').value = 0; $('#simAdj').value = 100; atualizarSimulador(); }
  if (e.target.closest('#simImprimir')) { document.body.classList.add('imprimindo-sim'); window.print(); setTimeout(() => document.body.classList.remove('imprimindo-sim'), 500); }
});

/* ================== Onde bater meu recorde ================== */
/* Percursos: um principal (na corrida) e/ou um por distância */
const temTrajeto = (o) => o && Array.isArray(o.percurso) && o.percurso.length > 1;
// Distância oficial que corresponde ao GPX principal: a distância cadastrada mais próxima (até 15% de diferença)
function kmOficialDe(c) {
  const g = +c.percurso_km; if (!g) return null;
  const ks = (c.corrida_distancias || []).map((d) => +d.km).filter((k) => k > 0);
  const k = ks.sort((a, b) => Math.abs(a - g) - Math.abs(b - g))[0];
  return k && Math.abs(k - g) / k <= 0.15 ? k : null;
}
function percursosDe(c) {
  const lista = (c.corrida_distancias || []).filter(temTrajeto).slice().sort(porDist)
    .map((d) => ({ rotulo: d.rotulo, km: +d.km, percurso: d.percurso, percurso_km: d.percurso_km, subida_m: d.subida_m, descida_m: d.descida_m }));
  if (temTrajeto(c) && !lista.some((d) => Math.abs((d.percurso_km || 0) - (c.percurso_km || 0)) < 0.3)) lista.unshift({ rotulo: lista.length ? 'Principal' : 'Percurso', km: kmOficialDe(c), percurso: c.percurso, percurso_km: c.percurso_km, subida_m: c.subida_m, descida_m: c.descida_m });
  return lista;
}
function comPercurso(c) {
  if (temTrajeto(c)) return c;
  const ps = percursosDe(c); if (!ps.length) return c;
  const maior = ps.reduce((a, b) => ((b.percurso_km || 0) > (a.percurso_km || 0) ? b : a));
  return { ...c, percurso: maior.percurso, percurso_km: maior.percurso_km, subida_m: maior.subida_m, descida_m: maior.descida_m };
}
let rkFiltro = 'todas', rkAberta = null;
const notaPercurso = (c) => c.subida_m == null || !c.percurso_km ? null : Math.max(0, Math.min(100, Math.round(100 - 5 * (c.subida_m / c.percurso_km))));
function notaClima(cl) { if (!cl) return null; let n = 100; if (cl.t > 15) n -= (cl.t - 15) * 5; if (cl.t < 10) n -= (10 - cl.t) * 3; if (cl.u > 70) n -= (cl.u - 70) * 0.5; return Math.max(0, Math.min(100, Math.round(n))); }
function notaHorario(c) { if (!c.horario) return 70; const h = horaLargada(c); return h < 5 ? 80 : h <= 7.5 ? 95 : h <= 8.5 ? 80 : h <= 10 ? 60 : h < 17 ? 40 : 50; }
function grupoDist(c) { const ks = (c.corrida_distancias || []).filter((d) => d.km != null && +d.km > 0).map((d) => +d.km); return { ate10: ks.some((k) => k <= 12) || (!ks.length && c.percurso_km <= 12), meia: ks.some((k) => k > 18 && k < 25) || (!ks.length && c.percurso_km > 18 && c.percurso_km < 25) }; }
async function montarRanking() {
  const box = $('#rkLista'); if (!box) return;
  const limite = Date.now() + 120 * 864e5;
  const cand = pertoLista().map(comPercurso).filter((c) => c.percurso && c.percurso.length > 1 && c.subida_m != null && new Date(c.data + 'T12:00:00-03:00') <= limite);
  $$('[data-rk]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.rk === rkFiltro));
  const lista = cand.filter((c) => rkFiltro === 'todas' || grupoDist(c)[rkFiltro]);
  if (!lista.length) { box.innerHTML = `<p class="vazio rk-vazio">${cand.length ? 'Nenhuma prova com essa distância nos próximos meses.' : 'Assim que as provas tiverem o percurso cadastrado, o ranking aparece aqui.'}</p>`; return; }
  box.innerHTML = '<p class="muted" style="margin:0">Calculando…</p>';
  const notas = await Promise.all(lista.map(async (c) => {
    const cl = await climaProva(c), clh = climaNa(cl, horaLargada(c));
    const p = notaPercurso(c), cn = notaClima(clh), h = notaHorario(c);
    const indice = Math.round(p * 0.45 + (cn ?? 70) * 0.4 + h * 0.15);
    return { c, p, cn, h, clh, indice, fonte: cl?.fonte };
  }));
  notas.sort((a, b) => b.indice - a.indice);
  box.innerHTML = notas.map((n, i) => {
    const c = n.c, [abre, fecha] = abreLink(c, 'rk-link'), aberta = rkAberta === c.id;
    const subKm = (c.subida_m / c.percurso_km).toFixed(1).replace('.', ',');
    const fat = [['Percurso', n.p, `+${c.subida_m} m de subida`], ['Clima', n.cn ?? 0, n.clh ? `${Math.round(n.clh.t)}°C, ${Math.round(n.clh.u)}% umid.` : 'sem dados'], ['Horário', n.h, c.horario ? `largada ${c.horario.slice(0, 5).replace(':', 'h')}` : 'a confirmar']];
    return `<div class="rk-item${i === 0 ? ' top' : ''}">
      ${i === 0 ? '<span class="rk-selo">Sua melhor chance</span>' : ''}
      <button type="button" class="rk-cab" data-rk-abrir="${c.id}" aria-expanded="${aberta}">
        <span class="rk-pos">${String(i + 1).padStart(2, '0')}</span>
        <span class="rk-nome"><b>${esc(c.nome)}</b><small>${esc(c.cidade)} · ${dataLonga(c.data)}${rotulos(c).length ? ' · ' + esc(rotulos(c).join(', ')) : ''}</small></span>
        <span class="rk-indice" style="--g:${n.indice * 3.6}deg"><b>${n.indice}</b></span>
      </button>
      <div class="rk-fatores">${fat.map(([nm, v, t]) => `<span><em>${nm}</em><i><u style="width:${v}%"></u></i><small>${t}</small></span>`).join('')}</div>
      ${aberta ? `<div class="rk-porque"><p>${n.p >= 75 ? 'Percurso rápido' : n.p >= 50 ? 'Percurso com algumas subidas' : 'Percurso pesado'}: ${subKm} m de subida por km. ${n.clh ? `O clima nesse horário costuma ficar em ${Math.round(n.clh.t)}°C (${n.fonte}).` : ''} ${n.h >= 90 ? 'Largada cedo, no ar mais fresco.' : ''}</p>${abre}${mod('pagina_corrida') ? 'Simular esta prova' : 'Ver a prova'}${fecha}</div>` : ''}
    </div>`;
  }).join('');
}
document.addEventListener('click', (e) => {
  const f = e.target.closest('[data-rk]'); if (f) { rkFiltro = f.dataset.rk; rkAberta = null; montarRanking(); return; }
  const a = e.target.closest('[data-rk-abrir]'); if (a) { rkAberta = rkAberta === a.dataset.rkAbrir ? null : a.dataset.rkAbrir; montarRanking(); }
});

/* ================== Mapas ================== */
function camadas() {
  return {
    // Mapa da Esri (funciona também abrindo o arquivo direto do computador ou celular, sem chave)
    mapa: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Mapa © <a href="https://www.esri.com">Esri</a>' }),
    escuro: L.layerGroup([
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', { maxZoom: 16, attribution: 'Mapa © <a href="https://www.esri.com">Esri</a>' }),
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', { maxZoom: 16 })
    ]),
    sat: L.layerGroup([
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Imagens © Esri' }),
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 })
    ])
  };
}
const iconePino = (ativo, aberta) => L.divIcon({ className: '', html: `<div class="pino${ativo ? ' ativo' : ''}${aberta ? ' aberta' : ''}"></div>`, iconSize: [22, 22], iconAnchor: [11, 11], popupAnchor: [0, -12] });
function circuloRaio() { return L.circle(origem(), { radius: RAIO_KM * 1000, color: '#FF4D00', weight: 1.5, dashArray: '6 6', fillColor: '#FF4D00', fillOpacity: 0.05, interactive: false }); }
function comCoords() { return publicadas().filter((c) => c.lat != null && c.lng != null); }

function desenharFiltros(alvo) {
  const opts = ['todas', '5K', '10K', '21K', '42K'];
  alvo.innerHTML = opts.map((o) => `<button type="button" class="filtro" data-f="${o}" aria-pressed="${estado.filtro === o}">${o === 'todas' ? 'Todas' : o}</button>`).join('');
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-f]');
  if (!b) return;
  estado.filtro = b.dataset.f;
  $$('.filtros').forEach(desenharFiltros);
  atualizarMarcadores();
  montarCartoes();
});

/* ================== Localização do visitante ("Perto de mim") ================== */
// A posição fica só no navegador (nunca vai para o servidor). Guardamos arredondada (~1 km) para abrir perto da pessoa na próxima visita.
const NO_BRASIL = (la, ln) => la > -34 && la < 6 && ln > -74 && ln < -34;
function lerPosSalva() {
  try { const v = JSON.parse(localStorage.getItem('mm_pos') || 'null'); if (v && NO_BRASIL(v[0], v[1])) return v; } catch { /* sem armazenamento */ }
  return null;
}
function desenharVoce() { // ponto azul "você está aqui" nos dois mapas
  vocePino.forEach((m) => m.remove()); vocePino = [];
  if (estado.pos) [mapaGrande, mapaCompacto].forEach((m) => {
    if (!m) return;
    if (!m.getPane('voce')) { const pn = m.createPane('voce'); pn.style.zIndex = 650; pn.style.pointerEvents = 'none'; }
    vocePino.push(L.circleMarker(estado.pos, { pane: 'voce', radius: 20, stroke: false, fillColor: '#1A73E8', fillOpacity: 0.18, interactive: false }).addTo(m));
    vocePino.push(L.circleMarker(estado.pos, { pane: 'voce', radius: 9, color: '#fff', weight: 3, fillColor: '#1A73E8', fillOpacity: 1, interactive: false }).addTo(m));
  });
}
function rotuloPerto() {
  const sub = $('#painelSub'); if (sub) sub.textContent = estado.pos ? 'Raio de 30 km a partir da sua localização' : 'Raio de 30 km a partir de Indaiatuba';
  $$('[data-perto]').forEach((b) => { b.setAttribute('aria-pressed', String(!!estado.pos)); b.textContent = estado.pos ? 'Perto de mim ✓' : (b.dataset.perto === 'home' ? 'Usar minha localização' : 'Perto de mim'); });
}
// Centraliza o mapa da tela inicial na posição da pessoa; repete depois que o mapa terminar de se ajustar à tela
function centralizarCompacto() {
  const ir = () => {
    if (!mapaCompacto) return;
    mapaCompacto.invalidateSize();
    mapaCompacto.setView(origem(), estado.pos ? 11 : Math.max(mapaCompacto.getZoom(), 9), { animate: false });
    if (!matchMedia('(min-width: 1000px)').matches) mapaCompacto.panBy([0, -70], { animate: false }); // mesmo deslocamento da abertura (celular)
  };
  ir(); setTimeout(ir, 400);
}
function desenharPos(centralizar) {
  const o = origem();
  [circuloGrande, circuloCompacto].forEach((c) => c && c.setLatLng(o));
  desenharVoce(); rotuloPerto();
  if (centralizar) {
    if (mapaGrande) mapaGrande.setView(estado.pos || [-14.2, -51.9], estado.pos ? 11 : 4);
    if (mapaCompacto) centralizarCompacto();
  }
  montarCartoes();
  if (mapaGrande) listarMapa();
}
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* segue */ } };
function lerLocalizacao(manual) {
  navigator.geolocation.getCurrentPosition((r) => {
    const la = r.coords.latitude, ln = r.coords.longitude;
    if (!NO_BRASIL(la, ln)) { if (manual) toast('Sua localização está fora do Brasil. Escolha a cidade no filtro.'); return; }
    estado.pos = [la, ln];
    lsSet('mm_pos', JSON.stringify([+la.toFixed(2), +ln.toFixed(2)]));
    try { localStorage.removeItem('mm_pos_off'); } catch { /* segue */ }
    desenharPos(true);
    if (!manual) toast('Mostrando as corridas perto de você');
  }, (e) => { if (manual) toast(e.code === 1 ? 'Sem permissão de localização. Escolha a cidade no filtro.' : 'Não consegui descobrir onde você está. Escolha a cidade no filtro.'); },
  { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
}
function pedirLocalizacao() {
  if (estado.pos) { // segundo toque: volta para a visão do Brasil e não pergunta mais sozinho
    estado.pos = null;
    try { localStorage.removeItem('mm_pos'); } catch { /* segue */ }
    lsSet('mm_pos_off', '1');
    desenharPos(true); return;
  }
  if (!navigator.geolocation) return toast('Este aparelho não informa a localização. Escolha a cidade no filtro.');
  toast('Procurando a sua localização…');
  lerLocalizacao(true);
}
// Ao abrir a página inicial: usa a localização se já foi permitida; senão pergunta uma vez (e só de novo depois de 7 dias)
function localizacaoAutomatica() {
  if (estado.pos || !navigator.geolocation || location.pathname !== '/' || lsGet('mm_pos_off')) return;
  const recente = Date.now() - (+lsGet('mm_pos_ask') || 0) < 7 * 864e5;
  const perguntar = () => { if (recente) return; lsSet('mm_pos_ask', String(Date.now())); lerLocalizacao(false); };
  if (navigator.permissions && navigator.permissions.query) {
    navigator.permissions.query({ name: 'geolocation' }).then((r) => {
      if (r.state === 'granted') lerLocalizacao(false);
      else if (r.state === 'prompt') perguntar();
    }).catch(perguntar);
  } else perguntar();
}
document.addEventListener('click', (e) => { if (e.target.closest('[data-perto]')) pedirLocalizacao(); });

let grupoCompacto;
// Agrupa os pinos próximos numa bolinha com o número de corridas; ao aproximar o zoom (ou clicar) eles se separam
function agrupador(interativo) {
  if (!L.markerClusterGroup) return L.layerGroup();
  return L.markerClusterGroup({
    maxClusterRadius: (z) => (z >= 13 ? 30 : 55),
    showCoverageOnHover: false,
    spiderfyOnMaxZoom: true,
    zoomToBoundsOnClick: interativo,
    chunkedLoading: true,
    iconCreateFunction: (cl) => {
      const n = cl.getChildCount();
      const tam = n < 10 ? 36 : n < 50 ? 44 : n < 200 ? 52 : 60;
      return L.divIcon({ html: `<span>${n}</span>`, className: 'grupo-pino', iconSize: [tam, tam] });
    }
  });
}
function montarMapaCompacto() {
  if (!mapaCompacto) {
    const desk = matchMedia('(min-width: 1000px)').matches;
    mapaCompacto = L.map('mapaHero', { zoomControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false, touchZoom: false, tap: false }).setView(origem(), estado.pos ? 11 : desk ? 10 : 9);
    camadas().escuro.addTo(mapaCompacto);
    circuloCompacto = circuloRaio().addTo(mapaCompacto);
    grupoCompacto = agrupador(false).addTo(mapaCompacto);
    desenharVoce();
    mapaCompacto.on('click', () => { location.hash = '#mapa'; });
    if (!desk) mapaCompacto.panBy([0, -70], { animate: false });
  }
  setTimeout(() => mapaCompacto.invalidateSize(), 50);
  atualizarMarcadores();
}

let mapaGrande, grupoGrande, camadasGrande, marcadores = new Map(), circuloGrande, circuloCompacto, vocePino = [];
function montarMapaGrande() {
  desenharFiltros($('#filtrosMapa'));
  desenharExtras();
  desenharCidades();
  if (!mapaGrande) {
    mapaGrande = L.map('mapaGrande', { zoomControl: false }).setView(origem(), estado.pos ? 11 : 10);
    L.control.zoom({ position: 'bottomright', zoomInTitle: 'Aproximar', zoomOutTitle: 'Afastar' }).addTo(mapaGrande);
    camadasGrande = camadas();
    camadasGrande[estado.camada].addTo(mapaGrande);
    circuloGrande = circuloRaio().addTo(mapaGrande);
    grupoGrande = agrupador(true).addTo(mapaGrande);
    desenharVoce();
    mapaGrande.on('moveend', listarMapa);
    $$('.alterna button').forEach((b) => b.addEventListener('click', () => trocarCamada(b.dataset.camada)));
    $('#buscaMapa').addEventListener('input', buscar);
  }
  setTimeout(() => { mapaGrande.invalidateSize(); atualizarMarcadores(); }, 60);
}
function trocarCamada(k) {
  if (k === estado.camada) return;
  mapaGrande.removeLayer(camadasGrande[estado.camada]);
  estado.camada = k;
  camadasGrande[k].addTo(mapaGrande);
  $$('.alterna button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.camada === k));
}

function popupHtml(c) {
  const l = linkCorrida(c);
  const popFoto = c.imagem_url ? `<div class="pop-foto"><img src="${esc(c.imagem_url)}" alt="" loading="lazy" onerror="this.parentNode.remove()"></div>` : `<div class="pop-foto">${placeholderImagem(c.nome, c.estado, rotulos(c).join(' · '), c.lat == null ? c.cidade : null, {w:240,h:135})}</div>`;
  return `<div class="pop">${popFoto}<span class="data">${dataLonga(c.data)}</span><span class="nome">${esc(c.nome)}</span><span class="cid">${esc(c.cidade)}${rotulos(c).length ? ', ' + rotulos(c).join(', ') : ''}</span>${l ? `<a class="btn btn-escuro" href="${esc(l.href)}"${l.ext ? ' target="_blank" rel="noopener"' : ''}>${l.ext ? 'Ir para a inscrição' : 'Ver corrida'}</a>` : ''}</div>`;
}

function atualizarMarcadores() {
  const lista = comCoords().filter(passaFiltro);
  // leve deslocamento para corridas no mesmo ponto
  const usados = {};
  const pos = (c) => { const k = c.lat.toFixed(3) + c.lng.toFixed(3); const n = usados[k] = (usados[k] || 0) + 1; return [c.lat + (n - 1) * 0.004, c.lng + (n - 1) * 0.004]; };
  if (grupoCompacto) {
    grupoCompacto.clearLayers();
    grupoCompacto.addLayers ? grupoCompacto.addLayers(lista.map((c) => L.marker([c.lat, c.lng], { icon: iconePino(false, c.inscricoes_abertas), interactive: false, keyboard: false })))
      : lista.forEach((c) => L.marker([c.lat, c.lng], { icon: iconePino(false, c.inscricoes_abertas), interactive: false, keyboard: false }).addTo(grupoCompacto));
  }
  if (grupoGrande) {
    grupoGrande.clearLayers(); marcadores.clear();
    Object.keys(usados).forEach((k) => delete usados[k]);
    const novos = [];
    lista.filter(passaExtras).forEach((c) => {
      const mk = L.marker(pos(c), { icon: iconePino(false, c.inscricoes_abertas), title: c.nome, alt: c.nome }).bindPopup(popupHtml(c), { className: 'pc-pop', maxWidth: 290 });
      mk.on('popupopen', () => { mk.setIcon(iconePino(true)); destacarItem(c.id, true); });
      mk.on('popupclose', () => { mk.setIcon(iconePino(false, c.inscricoes_abertas)); destacarItem(c.id, false); });
      novos.push(mk); marcadores.set(c.id, mk);
    });
    if (grupoGrande.addLayers) grupoGrande.addLayers(novos); else novos.forEach((m) => m.addTo(grupoGrande));
    listarMapa();
  }
}

function listarMapa() {
  if (!mapaGrande) return;
  const b = mapaGrande.getBounds();
  const termo = $('#buscaMapa').value.trim().toLowerCase();
  const lista = comCoords().filter(passaFiltro).filter(passaExtras).filter((c) => b.contains([c.lat, c.lng]))
    .filter((c) => !termo || (c.nome + ' ' + c.cidade).toLowerCase().includes(termo));
  if (estado.pos) lista.sort((a, b) => distKm(estado.pos, [a.lat, a.lng]) - distKm(estado.pos, [b.lat, b.lng]));
  const n = lista.length;
  $('#mapaTit').textContent = n === 0 ? 'Nenhuma corrida nesta área' : n === 1 ? '1 corrida nesta área' : n > 1000 ? 'Mais de mil corridas' : `${n} corridas nesta área`;
  // desenha em partes para não travar quando a área tem centenas de provas
  mapaMostradas = 40;
  mapaListaAtual = lista;
  desenharListaMapa();
}
let mapaMostradas = 40, mapaListaAtual = [];
function cartaoMapa(c) {
  const p = partes(c.data);
  const dists = rotulos(c);
  const l = linkCorrida(c);
  const fotoEl = c.imagem_url ? `<img src="${esc(c.imagem_url)}" alt="" loading="lazy" onerror="this.remove()">` : placeholderImagem(c.nome, c.estado, rotulos(c).join(' · '), c.lat == null ? c.cidade : null);
  const foto = `${fotoEl}<span class="cm-sem">${p.dia} ${p.mes}</span>${c.inscricoes_abertas ? '<span class="cm-selo">Inscrições abertas</span>' : ''}`;
  return `<article class="cartao-mapa" data-id="${c.id}">
    ${l ? `<a class="cm-foto" href="${esc(l.href)}"${l.ext ? ' target="_blank" rel="noopener"' : ''} aria-label="${esc(c.nome)}">${foto}</a>` : `<button type="button" class="cm-foto" data-foco="${c.id}" aria-label="Mostrar ${esc(c.nome)} no mapa">${foto}</button>`}
    <div class="cm-info"><span class="cm-cid">${esc(c.cidade)}${c.estado ? ' · ' + esc(c.estado) : ''}</span><span class="cm-data">${textoDist(c) ? textoDist(c) + ' · ' : ''}${p.sem}, ${p.d} ${p.mes.toLowerCase()}</span></div>
    <span class="cm-nome">${esc(c.nome)}</span>
    ${dists.length ? `<div class="chips">${dists.map((r) => `<span class="chip">${esc(r)}</span>`).join('')}</div>` : ''}
    <span class="cm-acoes">${l ? `<a class="cm-link" href="${esc(l.href)}"${l.ext ? ' target="_blank" rel="noopener"' : ''}>${l.ext ? 'Ir para a inscrição' : 'Ver corrida'} →</a>` : ''}<button type="button" class="cm-ver-mapa" data-foco="${c.id}">Ver no mapa</button></span>
  </article>`;
}
function desenharListaMapa() {
  const lista = mapaListaAtual;
  $('#listaMapa').innerHTML = lista.length ? `<div class="grade-mapa">${lista.slice(0, mapaMostradas).map(cartaoMapa).join('')}</div>` +
    (lista.length > mapaMostradas ? `<div class="mais-mapa" id="maisMapa">Carregando mais corridas…</div>` : '') :
    '<p class="vazio">Nenhuma corrida nesta área com esses filtros. Afaste o mapa, arraste para outra região ou tire algum filtro.</p>';
  const fim = $('#maisMapa');
  if (fim && 'IntersectionObserver' in window) {
    if (observaFim) observaFim.disconnect();
    observaFim = new IntersectionObserver((ent) => {
      if (!ent[0].isIntersecting) return;
      observaFim.disconnect();
      // acrescenta só os próximos cartões, sem redesenhar os que já estão na tela
      const prox = mapaListaAtual.slice(mapaMostradas, mapaMostradas + 40);
      mapaMostradas += prox.length;
      $('.grade-mapa').insertAdjacentHTML('beforeend', prox.map(cartaoMapa).join(''));
      if (mapaMostradas >= mapaListaAtual.length) fim.remove(); else observaFim.observe(fim);
    }, { root: $('#vMapa aside'), rootMargin: '600px' });
    observaFim.observe(fim);
  }
}
let observaFim = null;

/* Filtros extras do mapa (estilo Airbnb) e filtro por cidade */
const EXTRAS = [
  ['abertas', 'Inscrições abertas'], ['fds', 'Este fim de semana'], ['30d', 'Próximos 30 dias'],
  ['noite', 'Noturnas'], ['curta', 'Até 5K'], ['longa', 'Acima de 42K'], ['mapa', 'Com mapa do percurso']
];
estado.extras = new Set();
estado.cidade = '';
function fimDeSemana() {
  const h = new Date(); h.setHours(0, 0, 0, 0);
  const dow = h.getDay(); // 0 dom, 6 sáb
  const sab = new Date(h); sab.setDate(h.getDate() + (dow === 0 ? -1 : 6 - dow));
  const dom = new Date(sab); dom.setDate(sab.getDate() + 1);
  const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  return [iso(sab), iso(dom)];
}
function passaExtras(c) {
  if (estado.cidade && `${c.cidade}|${c.estado || ''}` !== estado.cidade) return false;
  const ds = c.corrida_distancias || [];
  for (const x of estado.extras) {
    if (x === 'abertas' && !c.inscricoes_abertas) return false;
    if (x === 'fds') { const [s, d] = fimDeSemana(); if (c.data < s || c.data > d) return false; }
    if (x === '30d') { const lim = new Date(); lim.setDate(lim.getDate() + 30); if (c.data > lim.toISOString().slice(0, 10)) return false; }
    if (x === 'noite' && !(c.horario && c.horario.slice(0, 5) >= '17:00')) return false;
    if (x === 'curta' && !ds.some((d) => d.km != null && +d.km > 0 && +d.km <= 5.5)) return false;
    if (x === 'longa' && !ds.some((d) => (d.km != null && +d.km > 42.3) || d.horas)) return false;
    if (x === 'mapa' && !temTrajeto(c) && !ds.some(temTrajeto)) return false;
  }
  return true;
}
function desenharExtras() {
  $('#extrasMapa').innerHTML = EXTRAS.map(([k, t]) => `<button type="button" class="filtro" data-extra="${k}" aria-pressed="${estado.extras.has(k)}">${t}</button>`).join('');
}
function desenharCidades() {
  const sel = $('#cidadeMapa');
  const cont = new Map();
  comCoords().forEach((c) => { const k = `${c.cidade}|${c.estado || ''}`; cont.set(k, (cont.get(k) || 0) + 1); });
  const ops = [...cont.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt'));
  sel.innerHTML = '<option value="">Todas as cidades</option>' + ops.map(([k, n]) => { const [cid, uf] = k.split('|'); return `<option value="${esc(k)}"${k === estado.cidade ? ' selected' : ''}>${esc(cid)}${uf ? ' - ' + esc(uf) : ''} (${n})</option>`; }).join('');
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-extra]');
  if (!b) return;
  const k = b.dataset.extra;
  if (estado.extras.has(k)) estado.extras.delete(k); else estado.extras.add(k);
  if (k === 'fds' && estado.extras.has('fds')) estado.extras.delete('30d');
  if (k === '30d' && estado.extras.has('30d')) estado.extras.delete('fds');
  desenharExtras();
  atualizarMarcadores();
});
$('#cidadeMapa').addEventListener('change', (e) => {
  estado.cidade = e.target.value;
  atualizarMarcadores();
  if (estado.cidade) {
    const achadas = comCoords().filter(passaFiltro).filter(passaExtras);
    if (achadas.length) mapaGrande.fitBounds(L.latLngBounds(achadas.map((c) => [c.lat, c.lng])).pad(0.3), { maxZoom: 13 });
  }
});
$('#listaMapa').addEventListener('click', (e) => {
  if (e.target.id === 'maisMapa') { mapaMostradas += 40; desenharListaMapa(); } // sem IntersectionObserver
});
$('#listaMapa').addEventListener('mouseover', (e) => {
  const a = e.target.closest('.cartao-mapa'); if (!a) return;
  const mk = marcadores.get(a.dataset.id); if (mk) mk.setIcon(iconePino(true));
});
$('#listaMapa').addEventListener('mouseout', (e) => {
  const a = e.target.closest('.cartao-mapa'); if (!a || a.contains(e.relatedTarget)) return;
  const mk = marcadores.get(a.dataset.id); const c = estado.corridas.find((x) => String(x.id) === a.dataset.id);
  if (mk && !mk.isPopupOpen()) mk.setIcon(iconePino(false, c && c.inscricoes_abertas));
});
function destacarItem(id, on) { const el = $(`#listaMapa [data-id="${id}"]`); if (el) { el.classList.toggle('ativo', on); if (on) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } }
$('#listaMapa').addEventListener('click', (e) => {
  const b = e.target.closest('[data-foco]'); if (!b) return;
  b.dataset.id = b.dataset.foco;
  const mk = marcadores.get(b.dataset.id); if (!mk) return;
  if (grupoGrande.zoomToShowLayer) grupoGrande.zoomToShowLayer(mk, () => mk.openPopup());
  else { mapaGrande.flyTo(mk.getLatLng(), Math.max(mapaGrande.getZoom(), 12), { duration: .6 }); mapaGrande.once('moveend', () => mk.openPopup()); }
});
function buscar() {
  const termo = $('#buscaMapa').value.trim().toLowerCase();
  if (termo.length >= 3) {
    const achadas = comCoords().filter((c) => (c.nome + ' ' + c.cidade).toLowerCase().includes(termo));
    if (achadas.length) {
      const bb = L.latLngBounds(achadas.map((c) => [c.lat, c.lng]));
      if (!mapaGrande.getBounds().contains(bb)) { mapaGrande.fitBounds(bb.pad(0.4), { maxZoom: 13 }); return; }
    }
  }
  listarMapa();
}

/* ================== Página da notícia ================== */
async function mostrarNoticia(slug) {
  const v = $('#vNoticia');
  estado.noticias.forEach((x) => { if (!x.slug) x.slug = slugify(x.titulo); });
  let n = estado.noticias.find((x) => x.slug === slug);
  if (!n && estado.admin && sb) { const r = await sb.from('noticias').select('*').eq('slug', slug).maybeSingle(); n = r.data; }
  if (!n) { v.innerHTML = '<div class="wrap" style="padding:64px 0"><h1 class="display" style="font-size:56px">Notícia não encontrada</h1><p class="muted">Ela pode ter sido removida. <a href="#" style="color:var(--cone-txt);font-weight:600">Voltar para o início</a></p></div>'; return; }
  const quando = n.publicado_em || n.criado_em;
  const data = quando ? new Date(quando).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  const outras = estado.noticias.filter((x) => x.slug !== slug).slice(0, 4);
  document.title = `${n.titulo} · Mapmove`;
  atualizarSEO({
    titulo: `${n.titulo} · Mapmove`,
    descricao: (n.resumo || n.titulo).slice(0, 160),
    url: `/noticia/${n.slug || slugify(n.titulo)}`,
    tipo: 'article',
    ldJson: { '@context': 'https://schema.org', '@type': 'NewsArticle', headline: n.titulo, description: n.resumo || '', datePublished: n.publicado_em || n.criado_em || '', url: `${BASE_URL}/noticia/${n.slug || slugify(n.titulo)}` },
  });
  v.innerHTML = `<div class="wrap pagina-noticia">
    <article class="noticia-art">
      <a href="#" class="voltar">← Voltar</a>
      ${n.status && n.status !== 'publicado' ? `<div class="aviso erro" style="margin:12px 0">Prévia: esta notícia está como "${esc(n.status)}" e não aparece para o público.</div>` : ''}
      <span class="editoria">${esc(NOMES_ED[n.editoria] || '')}${data ? ' · ' + data : ''}</span>
      <h1 class="display">${esc(n.titulo)}</h1>
      ${n.resumo ? `<p class="noticia-linha">${esc(n.resumo)}</p>` : ''}
      ${n.autor ? `<p class="noticia-autor">Por ${esc(n.autor)}</p>` : ''}
      ${n.imagem_url ? `<figure class="noticia-foto"><img src="${esc(n.imagem_url)}" alt="">${n.imagem_credito ? `<figcaption>${esc(n.imagem_credito)}</figcaption>` : ''}</figure>` : ''}
      <div class="texto-corrida noticia-texto">${textoRico(n.conteudo || '')}</div>
      ${n.fonte_nome ? `<p class="noticia-fonte">Com informações de ${n.fonte_url ? `<a href="${esc(n.fonte_url)}" target="_blank" rel="noopener">${esc(n.fonte_nome)}</a>` : esc(n.fonte_nome)}</p>` : ''}
    </article>
    ${outras.length ? `<aside class="noticia-mais"><h2 class="display">Mais notícias</h2><ol class="lista-num">${outras.map((o, i) => `<li><span class="num">${String(i + 1).padStart(2, '0')}</span><span><span class="editoria">${esc(NOMES_ED[o.editoria] || '')}</span><a class="tit link-noticia" href="#noticia/${esc(o.slug)}">${esc(o.titulo)}</a></span></li>`).join('')}</ol></aside>` : ''}
  </div>`;
}

/* ================== Página da corrida ================== */
const passoKm = (tot) => tot <= 12 ? 1 : tot <= 25 ? 2 : 5;
function marcasKm(tot) {
  if (!tot) return '';
  const st = passoKm(tot), ms = [];
  for (let k = 0; k < tot - st * 0.35; k += st) ms.push(k);
  return `<div class="alt-kms" aria-hidden="true">${ms.map((k) => `<span style="left:${(k / tot) * 100}%">${k}</span>`).join('')}<span class="fim" style="left:100%">${String(+tot.toFixed(1)).replace('.', ',')} km</span></div>`;
}
function rumo(a, b) {
  const r = Math.PI / 180, y = Math.sin((b.lng - a.lng) * r) * Math.cos(b.lat * r);
  const x = Math.cos(a.lat * r) * Math.sin(b.lat * r) - Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lng - a.lng) * r);
  return (Math.atan2(y, x) / r + 360) % 360;
}
function enfeitarPercurso(mapa, pts) {
  const tot = pts[pts.length - 1].km, st = passoKm(tot);
  const camada = L.layerGroup().addTo(mapa);
  // setas de sentido, a meio caminho entre as marcas de km
  const passoSeta = Math.max(0.4, Math.min(st, tot / 8));
  for (let k = passoSeta / 2; k < tot - 0.1; k += passoSeta) {
    const a = noKm(pts, k), b = noKm(pts, Math.min(tot, k + 0.05));
    if (!a || !b) continue;
    L.marker([a.lat, a.lng], { icon: L.divIcon({ className: '', html: `<div class="seta-perc" style="transform:rotate(${rumo(a, b)}deg)"></div>`, iconSize: [16, 16], iconAnchor: [8, 8] }), interactive: false, keyboard: false }).addTo(camada);
  }
  // marcas de km
  for (let k = st; k < tot - 0.15; k += st) {
    const a = noKm(pts, k);
    L.marker([a.lat, a.lng], { icon: L.divIcon({ className: '', html: `<div class="km-perc">${k}</div>`, iconSize: [22, 22], iconAnchor: [11, 11] }), interactive: false, keyboard: false, title: `km ${k}` }).addTo(camada);
  }
  return camada;
}
function ligarAltimetria(pts, mapa) {
  const box = $('#altInter'); if (!box) return;
  const svg = $('svg', box), dica = $('#altDica'), cur = $('.alt-cursor', box);
  const tot = pts[pts.length - 1].km;
  const ponto = L.circleMarker([pts[0].lat, pts[0].lng], { radius: 8, color: '#fff', weight: 3, fillColor: '#1E2124', fillOpacity: 1, interactive: false });
  const mostrar = (km) => {
    km = Math.max(0, Math.min(tot, km));
    const p = noKm(pts, km), q = noKm(pts, Math.min(tot, km + 0.1)), o = noKm(pts, Math.max(0, km - 0.1));
    const inc = p.ele != null && q.ele != null && o.ele != null ? ((q.ele - o.ele) / (((q.km - o.km) * 1000) || 1)) * 100 : null;
    if (!mapa.hasLayer(ponto)) ponto.addTo(mapa);
    ponto.setLatLng([p.lat, p.lng]);
    if (!mapa.getBounds().pad(-0.1).contains(ponto.getLatLng())) mapa.panTo(ponto.getLatLng(), { animate: true });
    const x = (km / tot) * 1000; cur.setAttribute('x1', x); cur.setAttribute('x2', x); cur.style.display = '';
    dica.hidden = false;
    let pass = null; const rs = simEstado && simEstado.r && $('#simBox') ? simEstado.r : null;
    if (rs) { pass = 0; for (const t of rs.trechos) { const i0 = t.km - t.len; if (km >= t.km) pass = t.pass; else { pass += (km - i0) * t.pace; break; } } }
    dica.innerHTML = `<b>km ${km.toFixed(2).replace('.', ',')}</b>${pass != null ? `<span class="pass">passa em ${fmt(pass)}</span>` : ''}${p.ele != null ? `<span>${Math.round(p.ele)} m</span>` : ''}${inc != null ? `<span class="${inc > 1 ? 'sobe' : inc < -1 ? 'desce' : ''}">${inc > 0 ? '+' : ''}${inc.toFixed(1).replace('.', ',')}%</span>` : ''}`;
    const w = box.clientWidth, px = (km / tot) * w;
    dica.style.left = Math.max(0, Math.min(w - dica.offsetWidth, px - dica.offsetWidth / 2)) + 'px';
  };
  const sair = () => { dica.hidden = true; ponto.remove(); cur.style.display = 'none'; };
  const kmDoEvento = (e) => { const r = svg.getBoundingClientRect(); return ((e.clientX - r.left) / r.width) * tot; };
  box.addEventListener('pointerdown', (e) => { box.setPointerCapture(e.pointerId); mostrar(kmDoEvento(e)); });
  box.addEventListener('pointermove', (e) => mostrar(kmDoEvento(e)));
  box.addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse') setTimeout(sair, 1500); });
  box.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') sair(); });
  // passar o mouse sobre o trajeto no mapa também mostra o ponto
  mapa.on('mousemove', (e) => {
    let melhor = null, dm = Infinity;
    const alvo = mapa.latLngToContainerPoint(e.latlng);
    for (let i = 0; i < pts.length; i += 2) { const d = alvo.distanceTo(mapa.latLngToContainerPoint([pts[i].lat, pts[i].lng])); if (d < dm) { dm = d; melhor = pts[i]; } }
    if (melhor && dm < 18) mostrar(melhor.km); else if (!dica.hidden && dm >= 30) sair();
  });
  mapa.on('mouseout', sair);
}
let mapaCorrida;
// Só para o admin: atalhos de editar/excluir no topo da página da corrida
let editarAoAbrirAdmin = null;
// Admin na página da corrida: lê a página de inscrição e oferece a imagem e o local encontrados para salvar
async function buscarFotoLocal(barra, c) {
  $('.admin-busca', barra)?.remove();
  const caixa = document.createElement('div');
  caixa.className = 'admin-busca';
  barra.append(caixa);
  if (!/^https?:\/\//i.test(c.link_inscricao || '')) { caixa.innerHTML = '<small>Esta corrida não tem link de inscrição. Use "Editar" para colar o link e marcar o local no mapa.</small>'; return; }
  caixa.innerHTML = '<small>Lendo a página da inscrição…</small>';
  let j;
  try {
    const r = await fetchAdmin(`/api/extrair?url=${encodeURIComponent(c.link_inscricao)}`);
    j = await r.json();
    if (!r.ok) throw new Error(j.erro || 'Não foi possível ler a página.');
  } catch (e) { caixa.innerHTML = `<small>${esc(e.message || 'Não foi possível ler a página.')}</small>`; return; }
  const temImg = !!j.imagem, temPonto = j.lat != null && j.lng != null;
  if (!temImg && !temPonto && !j.local) { caixa.innerHTML = '<small>Não encontrei imagem nem local na página da inscrição. Use "Editar" para colocar à mão.</small>'; return; }
  caixa.innerHTML = `${temImg ? `<label class="admin-busca-item"><input type="checkbox" data-usar="img" checked>
      <img src="${esc(j.imagem)}" alt="" onerror="this.closest('label').querySelector('small').textContent='Essa imagem não abriu.'">
      <span><b>Imagem de divulgação</b><br><small>${c.imagem_url ? 'Vai trocar a imagem atual. ' : ''}É a arte do organizador: use só com permissão e com o crédito.</small></span></label>` : '<small>Nenhuma imagem encontrada.</small>'}
    ${temPonto || j.local ? `<label class="admin-busca-item"><input type="checkbox" data-usar="local" checked>
      <span><b>Local da largada</b><br><small>${esc(j.local || 'sem nome')}${temPonto ? (j.aproximado ? ' · aproximado, pelo endereço (confira no mapa depois)' : ' · local exato') : ' · sem coordenadas'}${c.lat != null ? ' · vai trocar o pino atual (desmarque para manter)' : ''}</small></span></label>` : '<small>Nenhum local encontrado.</small>'}
    <div><button class="btn btn-escuro" type="button" data-acao="salvar-busca">Salvar o que estiver marcado</button></div>`;
  $('[data-acao="salvar-busca"]', caixa).addEventListener('click', async () => {
    const dados = {};
    if ($('[data-usar="img"]', caixa)?.checked) {
      dados.imagem_url = j.imagem;
      if (!c.imagem_credito) dados.imagem_credito = `Imagem: divulgação${c.organizador ? ' / ' + c.organizador : ''}`;
    }
    if ($('[data-usar="local"]', caixa)?.checked) {
      if (j.local) dados.local_largada = j.local;
      if (temPonto) { dados.lat = j.lat; dados.lng = j.lng; dados.pino_conferido_em = null; }
    }
    if (!Object.keys(dados).length) return toast('Marque o que quer salvar.');
    const { error } = await sb.from('corridas').update(dados).eq('id', c.id);
    if (error) return toast('Não foi possível salvar.');
    toast('Corrida atualizada');
    const alvo = estado.corridas.find((x) => x.id === c.id);
    if (alvo) Object.assign(alvo, dados);
    mostrarCorrida(c.slug);
  });
}
function barraAdminCorrida(v, c) {
  if (!estado.admin || !sb || !c || !c.id) return;
  const barra = document.createElement('div');
  barra.className = 'wrap admin-corrida';
  barra.innerHTML = `<span class="muted"><b>Admin</b> · ${c.status === 'publicado' ? 'publicada' : esc(c.status || '')}</span>
    <span class="admin-corrida-acoes"><button class="btn btn-cone" type="button" data-acao="buscar">Buscar foto e local</button> <button class="btn btn-linha" type="button" data-acao="editar">Editar</button> <button class="btn btn-perigo" type="button" data-acao="excluir">Excluir</button></span>`;
  v.prepend(barra);
  $('[data-acao="buscar"]', barra).addEventListener('click', () => buscarFotoLocal(barra, c));
  $('[data-acao="editar"]', barra).addEventListener('click', () => { editarAoAbrirAdmin = c.id; abaAdmin = 'corridas'; location.hash = '#admin'; });
  $('[data-acao="excluir"]', barra).addEventListener('click', async () => {
    if (!confirm(`Excluir "${c.nome}"? Isso não pode ser desfeito.`)) return;
    const { error } = await sb.from('corridas').delete().eq('id', c.id);
    if (error) return toast('Não foi possível excluir.');
    toast('Corrida excluída');
    estado.corridas = estado.corridas.filter((x) => x.id !== c.id);
    irInicio(); atualizarPublico();
  });
}
const dominioDoLink = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return 'do organizador'; } };
/* ---------- Adicionar ao calendário ---------- */
function eventoCalendario(c) {
  const [a, m, d] = c.data.split('-').map(Number);
  const [hh, mm] = (c.horario || '07:00').split(':').map(Number);
  // horário de Brasília (UTC-3) convertido para UTC
  const ini = new Date(Date.UTC(a, m - 1, d, hh + 3, mm));
  const fim = new Date(ini.getTime() + 3 * 3600e3);
  const fmt = (x) => x.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const pagina = `${location.origin}/corrida/${encodeURIComponent(c.slug)}`;
  const local = [c.local_largada, c.cidade && `${c.cidade}${c.estado ? ' - ' + c.estado : ''}`].filter(Boolean).join(', ');
  const dists = rotulos(c).join(', ');
  const texto = [dists && `Distâncias: ${dists}`, c.horario ? '' : 'Horário da largada a confirmar.', c.link_inscricao && `Inscrição: ${c.link_inscricao}`, `Mais informações: ${pagina}`].filter(Boolean).join('\n');
  return { titulo: c.nome, ini: fmt(ini), fim: fmt(fim), local, texto, pagina };
}
function linkGoogleAgenda(c) {
  const e = eventoCalendario(c);
  return `https://calendar.google.com/calendar/render?${new URLSearchParams({ action: 'TEMPLATE', text: e.titulo, dates: `${e.ini}/${e.fim}`, location: e.local, details: e.texto })}`;
}
function baixarIcs(c) {
  const e = eventoCalendario(c);
  const q = (t) => String(t || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Mapmove//Corridas//PT-BR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
    `UID:${c.id || c.slug}@mapmove`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`,
    `DTSTART:${e.ini}`, `DTEND:${e.fim}`, `SUMMARY:${q(e.titulo)}`, `LOCATION:${q(e.local)}`, `DESCRIPTION:${q(e.texto)}`, `URL:${e.pagina}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${q('Amanhã: ' + e.titulo + ' (retire o kit)')}`, 'TRIGGER:-P1D', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `${c.slug}.ics` });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// corridas que já aconteceram não vêm na carga inicial: busca no banco quando alguém abre a página
const passadasBuscadas = new Set();
function mostrarCorrida(slug, percIdx = 0) {
  const c0 = [...estado.corridas, ...(estado.passadas || [])].find((x) => x.slug === slug && (x.status === 'publicado' || estado.admin));
  if (!c0 && sb && !estado.demo && !passadasBuscadas.has(slug)) {
    passadasBuscadas.add(slug);
    $('#vCorrida').innerHTML = '<div class="wrap" style="padding:64px 0"><p class="muted">Carregando…</p></div>';
    sb.from('corridas').select('*, corrida_distancias(*)').eq('slug', slug).maybeSingle().then(({ data }) => {
      if (data) (estado.passadas = estado.passadas || []).push(data);
      if (rotaAtual().slice(9) === slug) mostrarCorrida(slug, percIdx);
    });
    return;
  }
  const percs = c0 ? percursosDe(c0) : [];
  const pSel = percs[Math.min(percIdx, Math.max(0, percs.length - 1))];
  const c = c0 && pSel ? { ...c0, percurso: pSel.percurso, percurso_km: pSel.percurso_km, subida_m: pSel.subida_m, descida_m: pSel.descida_m, km_oficial: pSel.km && Math.abs(pSel.km - pSel.percurso_km) / pSel.km <= 0.15 ? pSel.km : null } : c0;
  const v = $('#vCorrida');
  if (!c) { v.innerHTML = '<div class="wrap" style="padding:64px 0"><h1 class="display" style="font-size:56px">Corrida não encontrada</h1><p class="muted">Ela pode ter sido removida ou já aconteceu. <a href="#" style="color:var(--cone-txt);font-weight:600">Voltar para a agenda</a></p></div>'; return; }
  document.title = `${c.nome} · ${c.cidade} · Mapmove`;
  const dist = (c.corrida_distancias || []).slice().sort(porDist);
  const distTexto = dist.length ? dist.map((d) => d.rotulo).join(', ') : '';
  const descCorrida = c.descricao || (distTexto ? `Corrida em ${c.cidade}/${c.estado}. Distâncias: ${distTexto}.` : `Corrida em ${c.cidade}, ${c.estado}.`);
  atualizarSEO({
    titulo: `${c.nome} · ${c.cidade} · Mapmove`,
    descricao: descCorrida.slice(0, 160),
    url: `/corrida/${c.slug}`,
    tipo: 'article',
    ldJson: {
      '@context': 'https://schema.org', '@type': 'SportsEvent',
      name: c.nome, startDate: c.data,
      location: { '@type': 'Place', name: c.cidade, address: { '@type': 'PostalAddress', addressLocality: c.cidade, addressRegion: c.estado, addressCountry: 'BR' } },
      url: `${BASE_URL}/corrida/${c.slug}`,
      description: descCorrida.slice(0, 300),
      organizer: c.organizador ? { '@type': 'Organization', name: c.organizador } : undefined,
    },
  });
  const passou = c.data < hojeISO();
  const temPerc = Array.isArray(c.percurso) && c.percurso.length > 1;
  const proximasCidade = estado.corridas
    .filter((x) => x.slug !== slug && x.cidade === c.cidade && x.estado === c.estado && x.data >= hojeISO())
    .sort((a, b) => a.data.localeCompare(b.data))
    .slice(0, 5);
  const proximasHtml = proximasCidade.length ? `<section class="caixa proximas-cidade" aria-labelledby="proxTit">
    <h2 class="display" id="proxTit">Próximas em ${esc(c.cidade)}</h2>
    <ul class="proximas-lista">${proximasCidade.map((x) => {
      const dd = (x.corrida_distancias || []).slice().sort(porDist);
      return `<li><a class="proxima-item" href="#corrida/${esc(x.slug)}">${bib(x.data, true)}<div class="proxima-info"><b>${esc(x.nome)}</b>${dd.length ? `<span class="proxima-dists">${dd.map((d) => esc(d.rotulo)).join(' · ')}</span>` : ''}</div><svg class="proxima-seta" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" d="M9 18l6-6-6-6"/></svg></a></li>`;
    }).join('')}</ul>
  </section>` : '';
  const brl = (v) => v == null ? 'Preço a confirmar' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const simHtml = temPerc && mod('simulador') ? `<section class="caixa sim sim-lado" id="simBox" aria-labelledby="simTit">
    <div class="sim-cab"><div><span class="rot">Simulador da prova</span><h2 class="display" id="simTit">Monte a sua estratégia</h2></div>
      <div class="sim-entrada"><label class="campo">Tempo alvo<input id="simAlvo" inputmode="numeric"></label></div></div>
    <div class="sim-grade">
      <div class="sim-col">
        <div class="sim-ctrl"><div class="sim-ctrl-top"><span>Estratégia</span><b id="simEstTxt"></b></div>
          <input type="range" id="simEst" min="-5" max="5" step="1" value="0" aria-describedby="simEstTxt" aria-label="Estratégia de ritmo">
          <div class="sim-ctrl-pontas"><span>Sair forte</span><span>Igual</span><span>Guardar pro fim</span></div></div>
        <div class="sim-ctrl"><div class="sim-ctrl-top"><span>Nas subidas</span><b id="simAdjTxt"></b></div>
          <input type="range" id="simAdj" min="0" max="100" step="5" value="100" aria-describedby="simAdjTxt" aria-label="Ajuste pelo terreno">
          <div class="sim-ctrl-pontas"><span>Forçar nas subidas</span><span>Poupar nas subidas</span></div></div>
        <div class="sim-ctrl-linha"><label class="campo">Parciais<select id="simPasso"><option value="1">A cada 1 km</option><option value="0.5">A cada 500 m</option></select></label>
          <button type="button" class="sim-reset" id="simReset">Voltar ao padrão</button></div>
        <div class="sim-metades" id="simMetades"></div>
        <div class="sim-resultado" id="simResultado"></div>
      </div>
      <div class="sim-col">
        <div class="sim-barras" id="simBarras" aria-hidden="true"></div><div class="sim-legenda"><span>▲ mais lento</span><span>▼ mais rápido</span></div>
        <div class="pulseira" id="simTabela"></div>
        <div class="sim-rodape"><button type="button" class="btn" id="simImprimir">Imprimir pulseira</button>
          <small class="nota">Estimativa pela altimetria do percurso. Passe o dedo na altimetria acima para ver a passagem em cada ponto.</small></div>
      </div>
    </div></section>` : '';
  const percHtml = temPerc ? `<div class="caixa bloco-perc${simHtml ? ' com-sim' : ''}" id="caixaPerc"><div class="perc-topo"><h2 class="display">Percurso</h2>
        ${percs.length > 1 ? `<div class="perc-abas" role="group" aria-label="Escolha o percurso">${percs.map((p, i) => `<button type="button" class="filtro" data-perc="${i}" aria-pressed="${p === pSel}">${esc(p.rotulo)}</button>`).join('')}</div>` : ''}
        <div class="perc-stats"><div${c.km_oficial && Math.abs(c.km_oficial - c.percurso_km) >= 0.005 ? ` title="O GPX mediu ${String(c.percurso_km).replace('.', ',')} km. O site ajusta para a distância oficial."` : ''}><span>DISTÂNCIA</span><b>${String(+(c.km_oficial || c.percurso_km).toFixed(2)).replace('.', ',')} km</b></div><div><span>Subida</span><b>${c.subida_m != null ? '+' + c.subida_m + ' m' : '—'}</b></div><div><span>Descida</span><b>${c.descida_m != null ? '−' + c.descida_m + ' m' : '—'}</b></div></div></div>
        <div id="mapaCorrida" class="mapa-perc"></div>
        <div class="alt-inter" id="altInter">${svgAltimetria(comDistancia(c))}${marcasKm(c.km_oficial || c.percurso_km)}<div class="alt-dica" id="altDica" hidden></div></div>
        <small class="alt-ajuda">Passe o dedo ou o mouse sobre a altimetria para ver cada ponto no mapa. As setas mostram o sentido da prova.</small></div>
` : '';
  const semTexto = !c.imagem_url && !c.descricao && !(c.kit_inclui || []).length && (temPerc || c.lat == null);
  v.innerHTML = `<div class="wrap pagina-corrida${semTexto ? ' sem-texto' : ''}">
    ${c.data < hojeISO() ? `<div class="aviso aviso-passada"><b>Esta corrida já aconteceu</b> em ${dataLonga(c.data)}. <a href="#" data-ir="quadro">Ver as próximas corridas</a></div>` : ''}
    <div class="cab">${bib(c.data)}<div><span class="editoria">${dataLonga(c.data)}${c.horario ? ', largada às ' + c.horario.slice(0, 5) : ''}</span><h1 class="display">${esc(c.nome)}</h1><span class="muted" style="font-size:18px">${esc(c.cidade)}, ${esc(c.estado)}${c.organizador ? ' · Organização: ' + esc(c.organizador) : ''}</span>${c.estado && c.cidade && slugify(c.cidade) ? `<p class="ver-cidade"><a href="/corridas/${esc(String(c.estado).toLowerCase())}/${slugify(c.cidade)}">Ver todas as corridas em ${esc(c.cidade)}/${esc(c.estado)}</a> · <a href="/corridas/${esc(String(c.estado).toLowerCase())}">Corridas em ${esc(c.estado)}</a></p>` : ''}</div></div>
    <div class="corpo-corrida">
    <div class="principal">
      <figure class="foto-cred"><div class="foto" style="height:360px">${c.imagem_url ? `<img src="${esc(c.imagem_url)}" alt="${esc(c.nome)}">` : placeholderImagem(c.nome, c.estado, rotulos(c).join(' · '), c.lat == null ? c.cidade : null, {w:800,h:360})}</div>${c.imagem_url && c.imagem_credito ? `<figcaption>${esc(c.imagem_credito)}</figcaption>` : ''}</figure>
      ${c.descricao ? `<div class="caixa"><h2 class="display">Sobre a corrida</h2><div class="texto-corrida">${textoRico(c.descricao)}</div></div>` : ''}
      ${temPerc ? '' :
      c.lat != null ? `<div class="caixa"><h2 class="display">Largada</h2><p style="margin:0 0 14px">${esc(c.local_largada || c.cidade)}</p><div id="mapaCorrida"></div></div>` : ''}
      ${(c.kit_inclui || []).length ? `<div class="caixa"><h2 class="display">O que vem no kit</h2><ul class="kit">${c.kit_inclui.map((k) => `<li>${esc(k)}</li>`).join('')}</ul></div>` : ''}
    </div>
    <aside class="lado"><div class="card-insc">
      <div class="ci-topo"><h2 class="display">Inscrição</h2>${passou ? '<span class="ci-status fechada">Já aconteceu</span>' : c.inscricoes_abertas ? '<span class="ci-status aberta">Abertas</span>' : '<span class="ci-status fechada">Encerradas</span>'}</div>
      <div class="ci-dists">${dist.length ? dist.map((d) => `<div class="ci-dist"><b>${esc(d.rotulo)}</b><span>${d.preco == null ? 'preço a confirmar' : brl(d.preco)}</span></div>`).join('') : '<p class="muted" style="margin:0">Distâncias a confirmar.</p>'}</div>
      ${linkSeguro(c.link_inscricao) ? `<a class="btn btn-cone ci-cta" href="${esc(c.link_inscricao)}" target="_blank" rel="noopener">${c.inscricoes_abertas && !passou ? 'Fazer inscrição' : 'Ver site da prova'}<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.2" d="M7 17 17 7M9 7h8v8"/></svg></a>
        <small class="ci-fonte">no site ${esc(dominioDoLink(c.link_inscricao))}</small>` : ''}
      ${passou ? '' : `<details class="ci-agenda">
        <summary><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" d="M4 6h16v14H4zM4 10h16M9 3v4M15 3v4"/></svg>Adicionar à agenda</summary>
        <div class="ci-agenda-menu">
          <a href="${esc(linkGoogleAgenda(c))}" target="_blank" rel="noopener">Google Agenda</a>
          <button type="button" id="baixarIcs">Apple, Outlook e outros</button>
          <small>Com lembrete na véspera, para retirar o kit.</small>
        </div></details>`}
    </div>
    <button type="button" class="ci-compartilhar" id="btnCompartilhar"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="18" cy="5" r="3" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="6" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="18" cy="19" r="3" fill="none" stroke="currentColor" stroke-width="2"/><path fill="none" stroke="currentColor" stroke-width="2" d="m8.59 13.51 6.83 3.98M15.41 6.51 8.59 10.49"/></svg><span>Compartilhar</span></button>
    <a href="#mapa" class="ci-mapa" data-mod="mapa"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5" fill="none" stroke="currentColor" stroke-width="2"/></svg>Ver corridas próximas no mapa</a>
    </aside>
    </div>
${percHtml}${simHtml}${proximasHtml}</div>`;
  $('#baixarIcs', v)?.addEventListener('click', () => baixarIcs(c));
  $('#btnCompartilhar', v)?.addEventListener('click', async () => {
    const url = `https://mapmove.com.br/corrida/${encodeURIComponent(c.slug)}`;
    const titulo = c.nome;
    const texto = `${c.nome} · ${dataLonga(c.data)} em ${c.cidade}/${c.estado}`;
    const btn = $('#btnCompartilhar', v);
    const label = $('span', btn);
    if (navigator.share) {
      try { await navigator.share({ title: titulo, text: texto, url }); } catch { /* cancelado */ }
    } else {
      try {
        await navigator.clipboard.writeText(url);
        label.textContent = 'Link copiado!';
        setTimeout(() => { label.textContent = 'Compartilhar'; }, 2500);
      } catch {
        prompt('Copie o link:', url);
      }
    }
  });
  // menu "Adicionar à agenda": fecha ao escolher ou ao clicar fora
  const menuAg = $('.ci-agenda', v);
  if (menuAg) {
    $$('.ci-agenda-menu a, .ci-agenda-menu button', menuAg).forEach((x) => x.addEventListener('click', () => { menuAg.open = false; }));
    document.addEventListener('click', (e) => { if (menuAg.open && !menuAg.contains(e.target)) menuAg.open = false; });
  }
  $$('[data-perc]', v).forEach((b) => b.addEventListener('click', () => {
    const y = window.scrollY; mostrarCorrida(slug, Number(b.dataset.perc)); window.scrollTo(0, y);
    setTimeout(() => $(`[data-perc="${b.dataset.perc}"]`)?.focus(), 60);
  }));
  if (temPerc || c.lat != null) {
    setTimeout(() => {
      if (mapaCorrida) mapaCorrida.remove();
      mapaCorrida = L.map('mapaCorrida', { scrollWheelZoom: false }).setView(temPerc ? [c.percurso[0][0], c.percurso[0][1]] : [c.lat, c.lng], 14);
      camadas().mapa.addTo(mapaCorrida);
      if (temPerc) {
        const ll = c.percurso.map((p) => [p[0], p[1]]);
        const ic = (cls) => L.divIcon({ className: '', html: `<div class="${cls}"></div>`, iconSize: [16, 16], iconAnchor: [8, 8] });
        L.polyline(ll, { color: '#1E2124', weight: 6, opacity: .35 }).addTo(mapaCorrida);
        const ptsP = comDistancia(c);
        enfeitarPercurso(mapaCorrida, ptsP);
        const circuito = metros(c.percurso[0], c.percurso[c.percurso.length - 1]) < 150;
        const etiqueta = (cls, txt) => L.divIcon({ className: '', html: `<div class="etq-perc ${cls}"><span></span>${txt}</div>`, iconSize: null, iconAnchor: [8, 8] });
        if (circuito) L.marker(ll[0], { icon: etiqueta('ini', 'Largada e chegada'), title: 'Largada e chegada', alt: 'Largada e chegada', zIndexOffset: 500 }).addTo(mapaCorrida);
        else {
          L.marker(ll[ll.length - 1], { icon: etiqueta('fim', 'Chegada'), title: 'Chegada', alt: 'Chegada', zIndexOffset: 400 }).addTo(mapaCorrida);
          L.marker(ll[0], { icon: etiqueta('ini', 'Largada'), title: 'Largada', alt: 'Largada', zIndexOffset: 500 }).addTo(mapaCorrida);
        }
        ligarAltimetria(ptsP, mapaCorrida);
        mapaCorrida.fitBounds(L.latLngBounds(ll).pad(0.08));
        if (mod('simulador')) montarSimulador(c);
      } else L.marker([c.lat, c.lng], { icon: iconePino(true), alt: c.nome }).addTo(mapaCorrida);
    }, 30);
  }
  barraAdminCorrida(v, c0);
}

/* ================== Ferramentas ================== */
function segundos(t) { const p = t.trim().split(':').map(Number); if (p.some(isNaN) || !p.length) return null; return p.reduce((acc, v) => acc * 60 + v, 0); }
function fmt(s, curto) { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), ss = String(s % 60).padStart(2, '0'); return h && !curto ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${h * 60 + m}:${ss}`; }
function calcular() {
  const d = Number($('#calcDist').value), t = segundos($('#calcTempo').value);
  if (!t) { $('#calcPace').textContent = 'Confira o tempo'; $('#calcProj').innerHTML = ''; return; }
  $('#calcPace').innerHTML = `${fmt(t / d, true)} <small>/km</small>`;
  estado.pace10 = (t * Math.pow(10 / d, 1.06)) / 10;
  const alvos = [[5, '5K'], [10, '10K'], [21.0975, 'Meia maratona'], [42.195, 'Maratona']].filter(([k]) => k !== d);
  $('#calcProj').innerHTML = '<tbody>' + alvos.map(([k, n]) => { const tt = t * Math.pow(k / d, 1.06); return `<tr><td>${n}</td><td>${fmt(tt)} (${fmt(tt / k, true)} /km)</td></tr>`; }).join('') + '</tbody>';
}
$('#calcDist').addEventListener('change', calcular);
$('#calcTempo').addEventListener('input', calcular);
['change', 'input'].forEach((ev) => $(ev === 'change' ? '#calcDist' : '#calcTempo').addEventListener(ev, () => { if (mod('zonas_fc')) montarZonas(); }));
// cidades conhecidas (das corridas carregadas) para o campo de cidade do aviso
function cidadesAviso() {
  const m = new Map();
  for (const c of estado.corridas) {
    if (!c.cidade || c.lat == null) continue;
    const k = `${c.cidade}|${c.estado || ''}`;
    const v = m.get(k) || { cidade: c.cidade, uf: c.estado || '', lat: 0, lng: 0, n: 0 };
    v.lat += +c.lat; v.lng += +c.lng; v.n++; m.set(k, v);
  }
  return [...m.values()].map((v) => ({ ...v, lat: v.lat / v.n, lng: v.lng / v.n })).sort((x, y) => x.cidade.localeCompare(y.cidade, 'pt-BR'));
}
$('#avisoCidade')?.addEventListener('focus', () => {
  const dl = $('#avisoCidades'); if (!dl || dl.childElementCount) return;
  dl.innerHTML = cidadesAviso().map((c) => `<option value="${esc(c.cidade)}${c.uf ? ' - ' + esc(c.uf) : ''}">`).join('');
});
$('#formAviso').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('#avisoMsg'), btn = $('button[type="submit"]', e.target);
  const email = $('#avisoEmail').value.trim().toLowerCase();
  const [nomeCid, ufCid] = $('#avisoCidade').value.trim().split(/\s+-\s+/);
  const conhecida = cidadesAviso().find((c) => semAcento(c.cidade) === semAcento(nomeCid) && (!ufCid || c.uf === ufCid.toUpperCase()));
  const distancias = $$('.av-dist input:checked', e.target).map((x) => x.value);
  if (!distancias.length) { msg.className = 'msg erro'; msg.textContent = 'Marque pelo menos uma distância.'; return; }
  btn.disabled = true; msg.className = 'msg'; msg.textContent = 'Enviando…';
  try {
    const r = await fetch('/api/avisos', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, cidade: conhecida ? conhecida.cidade : nomeCid, uf: conhecida ? conhecida.uf : (ufCid || 'SP'), lat: conhecida?.lat, lng: conhecida?.lng, raio: +$('#avisoRaio').value, distancias }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erro || 'Não deu para cadastrar agora. Tente de novo em alguns minutos.');
    msg.className = 'msg ok';
    msg.textContent = j.ja_confirmado ? 'Preferências atualizadas. Você continua recebendo os avisos.'
      : j.confirmacao_enviada ? 'Quase lá. Enviamos um e-mail para você confirmar a inscrição.'
      : 'Inscrição recebida. Assim que os avisos começarem, você recebe um e-mail para confirmar.';
    e.target.reset();
  } catch (err) { msg.className = 'msg erro'; msg.textContent = err.message; }
  btn.disabled = false;
});

/* ================== SEO dinâmico ================== */
const BASE_URL = 'https://mapmove.com.br';
const DESC_SITE = document.querySelector('meta[name="description"]')?.content || '';
const TITULO_PADRAO = document.title;
function atualizarSEO({ titulo, descricao, url, tipo, ldJson } = {}) {
  const t = titulo || TITULO_PADRAO;
  const d = descricao || DESC_SITE;
  const u = url ? BASE_URL + url : BASE_URL + '/';
  document.querySelector('meta[name="description"]').content = d;
  const el = (id) => document.getElementById(id);
  if (el('ogTitle')) el('ogTitle').content = t;
  if (el('ogDesc')) el('ogDesc').content = d;
  if (el('ogUrl')) el('ogUrl').content = u;
  if (el('ogType')) el('ogType').content = tipo || 'website';
  if (el('twTitle')) el('twTitle').content = t;
  if (el('twDesc')) el('twDesc').content = d;
  if (el('canonicalUrl')) el('canonicalUrl').href = u;
  if (el('ldJson')) el('ldJson').textContent = JSON.stringify(ldJson || { '@context': 'https://schema.org', '@type': 'WebSite', name: 'Mapmove', url: BASE_URL });
}

/* ================== Rotas ================== */
// título padrão (as páginas /corrida/... chegam com o título da prova, vindo do servidor)
const TITULO_SITE_RAW = document.querySelector('meta[name="pc-titulo"]')?.content || document.title;
const TITULO_SITE = TITULO_SITE_RAW;
// endereço de verdade da corrida (/corrida/nome-da-prova), usado pelo Google e no compartilhamento
function rotaCorridaPeloCaminho() { const m = location.pathname.match(/^\/corrida\/([^/]+)\/?$/); return m ? decodeURIComponent(m[1]) : ''; }
function rotaAtual() { return decodeURIComponent(location.hash) || (rotaCorridaPeloCaminho() ? '#corrida/' + rotaCorridaPeloCaminho() : ''); }
// volta para a página inicial sem recarregar (também a partir de /corrida/...)
function irInicio() { history.pushState('', '', '/'); rotear(); }
function rotear() {
  const h = rotaAtual();
  const eMapa = h === '#mapa', eAdmin = h === '#admin', eCorrida = h.startsWith('#corrida/'), eNoticia = h.startsWith('#noticia/'), eDica = h.startsWith('#dica/'), eZonas = h === '#zonas' && mod('zonas_fc');
  $('#vMapa').hidden = !(eMapa && mod('mapa'));
  document.body.style.overflow = eMapa ? 'hidden' : '';
  $('#vHome').hidden = eAdmin || eCorrida || eNoticia || eDica;
  $('#vNoticia').hidden = !eNoticia;
  $('#vDica').hidden = !eDica;
  if (!eNoticia && !eCorrida && !eDica) { document.title = TITULO_SITE; atualizarSEO(); }
  $('#vAdmin').hidden = !eAdmin;
  $('#vCorrida').hidden = !eCorrida;
  $('#navApp').hidden = eAdmin || eMapa;
  $$('#navApp a').forEach((a) => a.classList.toggle('ativo', (eMapa && a.getAttribute('href') === '#mapa') || (eZonas && a.dataset.ir === 'ferramentas')));
  if (eMapa && mod('mapa')) montarMapaGrande();
  if (eCorrida) { mostrarCorrida(h.slice(9)); scrollTo(0, 0); }
  if (eNoticia) { mostrarNoticia(h.slice(9)); scrollTo(0, 0); }
  if (eDica) { mostrarDica(h.slice(6)); scrollTo(0, 0); }
  if (eAdmin) { abrirAdmin(); scrollTo(0, 0); }
  if (eZonas) setTimeout(() => $('#ferrZonas').scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  if (!eMapa && !eAdmin && !eCorrida && !eNoticia && !eDica && mapaCompacto) setTimeout(() => mapaCompacto.invalidateSize(), 50);
}
window.addEventListener('hashchange', rotear);
window.addEventListener('popstate', () => { if (!location.hash) rotear(); });
document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-ir]'); if (!a) return;
  e.preventDefault();
  if (location.hash || rotaCorridaPeloCaminho()) irInicio();
  setTimeout(() => $('#' + a.dataset.ir)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30);
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && location.hash === '#mapa') location.hash = ''; });

/* ================== Admin ================== */
let abaAdmin = 'corridas', mapaForm;
async function abrirAdmin() {
  if (estado.demo) { $('#adminBox').innerHTML = '<div class="login"><h1 class="display">Área do administrador</h1><div class="aviso erro">O admin precisa do banco de dados, que não está acessível nesta visualização. Abra o site pelo endereço publicado (Netlify) para entrar.</div><a href="#" class="btn btn-linha">Voltar para o site</a></div>'; return; }
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return telaLogin();
  const { data: ehAdmin, error } = await sb.rpc('is_admin');
  if (error || !ehAdmin) return telaLogin('Esta conta entrou, mas não é administradora. No Supabase, rode o comando de admin do final do script com este e-mail.');
  estado.admin = true;
  $('#btnEntrar').textContent = 'Admin';
  if (!editarAoAbrirAdmin) return pintarAdmin();
  // veio do botão "Editar" da página da corrida: abre direto o formulário (sem carregar a lista por cima)
  const id = editarAoAbrirAdmin; editarAoAbrirAdmin = null;
  pintarAdmin(true);
  $('#conteudoAdmin').innerHTML = '<p class="muted">Carregando…</p>';
  const { data: c } = await sb.from('corridas').select('*, corrida_distancias(*)').eq('id', id).maybeSingle();
  if (c) formCorrida(c); else adminCorridas();
}
function telaLogin(erro) {
  $('#adminBox').innerHTML = `<form class="login" id="formLogin">
    <h1 class="display">Área do administrador</h1>
    ${erro ? `<div class="aviso erro" role="alert">${esc(erro)}</div>` : ''}
    <label class="campo">Usuário<input type="text" id="lgEmail" required autocomplete="username" autocapitalize="none" spellcheck="false"></label>
    <label class="campo">Senha<input type="password" id="lgSenha" required autocomplete="current-password"></label>
    <button class="btn btn-escuro" type="submit">Entrar</button>
  </form>`;
  $('#formLogin').addEventListener('submit', async (e) => {
    e.preventDefault();
    const usuario = $('#lgEmail').value.trim().toLowerCase();
    const email = usuario.includes('@') ? usuario : `${usuario}@${DOMINIO_ADMIN}`;
    const { error } = await sb.auth.signInWithPassword({ email, password: $('#lgSenha').value });
    if (error) return telaLogin('Usuário ou senha incorretos. Confira e tente de novo.');
    abrirAdmin();
  });
}
// ---------- localizador global do painel (corridas publicadas + pendentes) ----------
let buscaAdmin = '', cacheCorr = null, cachePend = null;
const textoBusca = (c) => semAcento([c.nome, c.cidade, c.estado, c.local_largada, c.organizador].filter(Boolean).join(' '));
function filtrarBusca(lista) {
  const termos = semAcento(buscaAdmin).split(/\s+/).filter(Boolean);
  if (!termos.length) return lista;
  return lista.filter((c) => { const t = textoBusca(c); return termos.every((x) => t.includes(x)); });
}
function contarBusca() {
  const ativo = !!buscaAdmin.trim();
  const info = $('#buscaAdminInfo');
  $$('.cont-aba').forEach((b) => { b.textContent = ''; });
  if (!ativo) { if (info) info.textContent = ''; return; }
  const nc = cacheCorr ? filtrarBusca(cacheCorr).length : null, np = cachePend ? filtrarBusca(cachePend).length : null;
  const bc = $('[data-cont="corridas"]'), bp = $('[data-cont="pendentes"]');
  if (bc && nc != null) bc.textContent = ` ${nc}`;
  if (bp && np != null) bp.textContent = ` ${np}`;
  if (info) info.textContent = nc == null || np == null ? 'Procurando…' : `${nc} publicada(s) e ${np} pendente(s) encontradas`;
}
// carrega as duas listas (uma vez) para contar os resultados nas abas
async function prepararBusca() {
  if (!cacheCorr) cacheCorr = await recarregarCorridas();
  if (!cachePend) cachePend = await carregarPendentes();
  contarBusca();
}
async function carregarPendentes() {
  // o banco devolve no máximo 1000 linhas por vez: busca em páginas até acabar
  let data = [];
  for (let de = 0; ; de += 1000) {
    let r = await sb.from('corridas_pendentes').select('*, nota_pendente').eq('status', 'pendente').order('data').order('id').range(de, de + 999);
    if (r.error) r = await sb.from('corridas_pendentes').select('*').eq('status', 'pendente').order('data').order('id').range(de, de + 999);
    if (r.error) return null;
    data = data.concat(r.data || []);
    if (!r.data || r.data.length < 1000) break;
  }
  return data;
}
const dominioLink = (u) => { try { return new URL(u).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; } };
const opcoesSel = (pares, atual) => pares.map(([v, t]) => `<option value="${esc(v)}"${v === atual ? ' selected' : ''}>${t}</option>`).join('');
const ORDENS_DATA = { proximas: (a, b) => a.data.localeCompare(b.data), distantes: (a, b) => b.data.localeCompare(a.data), recentes: (a, b) => String(b.criado_em || '').localeCompare(String(a.criado_em || '')) };

/* ---------- Saúde do robô ---------- */
const NAO_TERMINOU_MIN = 3;
const situacaoExec = (e) => e.fim ? (e.ok ? 'ok' : 'falhou') : (Date.now() - new Date(e.inicio) > NAO_TERMINOU_MIN * 60e3 ? 'nao_terminou' : 'rodando');
function problemasRobo(execs) {
  const avisos = [];
  const agendadas = execs.filter((e) => e.origem !== 'admin');
  if (!agendadas.length) return ['Nenhuma rodada do robô registrada ainda. O registro começou agora; a próxima rodada agendada vai aparecer aqui.'];
  const horas = (Date.now() - new Date(agendadas[0].inicio)) / 3600e3;
  if (horas > 26) avisos.push(`O robô não roda há ${Math.round(horas)} horas. Confira os agendamentos (cron) na Vercel.`);
  for (const rota of ['enriquecer', 'coletar']) {
    const ult = agendadas.filter((e) => e.rota === rota && situacaoExec(e) !== 'rodando').slice(0, 2);
    if (ult.length === 2 && ult.every((e) => situacaoExec(e) !== 'ok')) avisos.push(`As 2 últimas rodadas de "${rota}" falharam ou não terminaram.`);
  }
  return avisos;
}
async function verificarRobo() {
  const { data } = await sb.from('robo_execucoes').select('rota, origem, inicio, fim, ok').order('inicio', { ascending: false }).limit(30);
  const tem = data && problemasRobo(data).length && data.length;
  const aba = $('[data-aba="robo"] span');
  if (aba) aba.innerHTML = tem ? 'Robô <i class="ponto-alerta" title="O robô precisa de atenção"></i>' : 'Robô';
}
async function adminRobo() {
  const box = $('#conteudoAdmin');
  box.innerHTML = '<p class="muted">Carregando…</p>';
  const { data, error } = await sb.from('robo_execucoes').select('*').order('inicio', { ascending: false }).limit(150);
  if (error) { box.innerHTML = '<div class="aviso erro">A tabela de execuções ainda não existe. Rode o script <b>sql/21-robo-log-e-passadas.sql</b> no Supabase.</div>'; return; }
  const execs = data || [];
  const avisos = problemasRobo(execs);
  const quando = (t) => new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const dur = (e) => e.fim ? `${Math.round((new Date(e.fim) - new Date(e.inicio)) / 1000)} s` : '—';
  const ROT = { ok: ['publicado', 'ok'], falhou: ['', 'falhou'], nao_terminou: ['', 'não terminou'], rodando: ['rascunho', 'rodando…'] };
  const resumo = (e) => {
    const r = e.resultado || {};
    if (e.erro) return `<small class="pend-urgente">${esc(e.erro)}</small>`;
    if (e.rota === 'enriquecer' && r.textos_lidos != null) return `<small>${r.textos_lidos} página(s) lidas para descrição · ${r.com_texto} com texto</small>`;
    if (e.rota === 'enriquecer' && r.devolvidas != null) return `<small>${r.devolvidas ? `${r.devolvidas} pendente(s) sem imagem ou local voltaram para a fila` : 'nenhuma pendente para reprocessar'}</small>`;
    if (e.rota === 'enriquecer') return `<small>${[r.processadas != null && `${r.processadas} lidas`, r.com_imagem && `${r.com_imagem} com imagem`, r.com_local && `${r.com_local} com local`, r.falhas && `${r.falhas} falhas`, r.conferidos && `${r.conferidos} pinos conferidos`, r.corrigidos && `${r.corrigidos} corrigidos`, r.publicadas && `<b>${r.publicadas} publicadas</b>`, r.pendentes_expiradas && `${r.pendentes_expiradas} pendentes vencidas`].filter(Boolean).join(' · ') || 'nada a fazer'}</small>`;
    if (e.rota === 'avisos') return `<small>${r.servico_configurado === false ? 'serviço de e-mail não configurado · ' : ''}${[r.enviados && `<b>${r.enviados} resumos enviados</b>`, r.simulados && `${r.simulados} simulados`, r.sem_novidade && `${r.sem_novidade} sem corrida nova`, r.confirmacoes && `${r.confirmacoes} confirmações`, r.falhas && `${r.falhas} falhas`].filter(Boolean).join(' · ') || `${r.inscritos || 0} inscritos para enviar`}</small>`;
    if (e.rota === 'coletar' && Array.isArray(r.relatorio)) {
      const t = r.relatorio.reduce((a, x) => { for (const k of ['no_calendario', 'novas', 'gravadas', 'completadas']) if (typeof x[k] === 'number') a[k] = (a[k] || 0) + x[k]; if (x.erro || x.completar_erro) a.erros = (a.erros || 0) + 1; return a; }, {});
      const NOMES = { no_calendario: 'no calendário', novas: 'novas', gravadas: 'gravadas na fila', completadas: 'detalhes completados', erros: 'erro(s)' };
      const txt = Object.entries(t).map(([k, v]) => `${v} ${NOMES[k]}`).join(' · ');
      return `<small>${txt || `${r.relatorio.length} estado(s)`}</small>`;
    }
    return '';
  };
  const ult = (rota) => execs.find((e) => e.rota === rota && e.origem !== 'admin');
  const cartao = (rota, nome) => { const e = ult(rota); const st = e ? situacaoExec(e) : null;
    return `<div class="caixa robo-cartao"><span class="muted">${nome}</span><b>${e ? quando(e.inicio) : 'sem registro'}</b>${e ? `<span class="status ${ROT[st][0]}">${ROT[st][1]}</span>` : ''}</div>`; };
  const publicadas7 = execs.filter((e) => Date.now() - new Date(e.inicio) < 7 * 864e5).reduce((a, e) => a + ((e.resultado || {}).publicadas || 0), 0);
  box.innerHTML = `${avisos.map((a) => `<div class="aviso erro" role="alert">${esc(a)}</div>`).join('')}
  <div class="robo-cartoes">${cartao('coletar', 'Última coleta')}${cartao('enriquecer', 'Último enriquecimento')}
    <div class="caixa robo-cartao"><span class="muted">Publicadas pelo robô (7 dias)</span><b>${publicadas7}</b></div></div>
  <p class="muted"><small>Cada rodada do robô fica registrada aqui por 60 dias. "Não terminou" quase sempre é a Vercel encerrando a rodada por tempo (limite de 60 s).</small></p>
  <div class="tabela-wrap"><table class="tab"><thead><tr><th>Quando</th><th>Rotina</th><th>Situação</th><th>Duração</th><th>Resultado</th></tr></thead><tbody>
  ${execs.map((e) => { const st = situacaoExec(e); return `<tr><td>${quando(e.inicio)}${e.origem === 'admin' ? '<br><small class="muted">pelo admin</small>' : ''}</td><td><b>${esc(e.rota)}</b><br><small class="muted">${esc(e.parametros || '')}</small></td><td><span class="status ${ROT[st][0]}">${ROT[st][1]}</span></td><td>${dur(e)}</td><td>${resumo(e)}</td></tr>`; }).join('') || '<tr><td colspan="5" class="muted">Nenhuma rodada registrada ainda.</td></tr>'}
  </tbody></table></div>`;
}

function pintarAdmin(semConteudo) {
  const abas = [['corridas', 'Corridas'], ['pendentes', 'Pendentes'], ['padroes', 'Padrões de busca'], ['robo', 'Robô'], ['noticias', 'Notícias'], ['modulos', 'Módulos'], ['inscritos', 'Inscritos']];
  $('#adminBox').innerHTML = `
    <div class="barra-admin"><h1 class="display" style="margin:0">Painel</h1><div style="display:flex;gap:10px"><a href="#" class="btn btn-linha">Ver o site</a><button class="btn btn-linha" id="btnSair">Sair</button></div></div>
    <div class="busca-admin"><input type="search" class="campo-busca" id="buscaAdmin" placeholder="Localizar corrida em todo o painel: nome, cidade, local ou organizador…" value="${esc(buscaAdmin)}" aria-label="Localizar corrida"><span class="muted" id="buscaAdminInfo"></span></div>
    <div class="abas" role="tablist">${abas.map(([k, n]) => `<button role="tab" data-aba="${k}" aria-selected="${abaAdmin === k}"><span>${n}</span><b class="cont-aba" data-cont="${k}"></b></button>`).join('')}</div>
    <div id="conteudoAdmin"></div>`;
  let tBusca;
  $('#buscaAdmin').addEventListener('input', (e) => {
    clearTimeout(tBusca);
    tBusca = setTimeout(() => {
      buscaAdmin = e.target.value;
      if (buscaAdmin.trim() && !['corridas', 'pendentes'].includes(abaAdmin)) { abaAdmin = cacheCorr && filtrarBusca(cacheCorr).length ? 'corridas' : 'pendentes'; pintarAdmin(); return; }
      if (abaAdmin === 'corridas') adminCorridas(false); else if (abaAdmin === 'pendentes') adminPendentes(false);
      contarBusca();
    }, 250);
  });
  $$('[data-aba]').forEach((b) => b.addEventListener('click', () => { abaAdmin = b.dataset.aba; pintarAdmin(); }));
  $('#btnSair').addEventListener('click', async () => { await sb.auth.signOut(); estado.admin = false; $('#btnEntrar').textContent = 'Entrar'; irInicio(); });
  verificarRobo();
  if (semConteudo) return;
  if (buscaAdmin.trim()) prepararBusca();
  ({ corridas: adminCorridas, pendentes: adminPendentes, padroes: adminPadroes, robo: adminRobo, noticias: adminNoticias, modulos: adminModulos, inscritos: adminInscritos })[abaAdmin]();
}
async function recarregarCorridas() {
  const { data } = await todasPaginas(() => sb.from('corridas').select('*, corrida_distancias(*)').order('data', { ascending: false }).order('id'));
  return data || [];
}

let ordemCorr = 'proximas', prazoCorr = 'futuras', situacaoCorr = '', siteCorr = '', ufCorr = '', statusCorr = '';
const SITUACOES_CORR = { completas: (c) => c.imagem_url && c.lat != null, sem_img: (c) => !c.imagem_url, sem_local: (c) => c.lat == null, sem_dist: (c) => !(c.corrida_distancias || []).length, sem_desc: (c) => !textoSimples(c.descricao), desc_auto: (c) => !!c.descricao_auto && !!textoSimples(c.descricao), desc_sua: (c) => !c.descricao_auto && !!textoSimples(c.descricao) };
// descrição em texto puro (a descrição é guardada com formatação): usada para mostrar o começo na lista do admin
function textoSimples(h) {
  return String(h || '').replace(/<br\s*\/?>|<\/p>|<\/li>|<\/h\d>/gi, ' ').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, ' ').trim();
}
async function adminCorridas(recarregar = true) {
  const box = $('#conteudoAdmin');
  if (recarregar || !cacheCorr) { box.innerHTML = '<p class="muted">Carregando…</p>'; cacheCorr = await recarregarCorridas(); }
  const todas = cacheCorr || [];
  contarBusca();
  const ufs = [...new Set(todas.map((c) => c.estado).filter(Boolean))].sort();
  if (ufCorr && !ufs.includes(ufCorr)) ufCorr = '';
  const contSites = {}; todas.forEach((c) => { const d = dominioLink(c.link_inscricao); if (d) contSites[d] = (contSites[d] || 0) + 1; });
  const sites = Object.keys(contSites).sort((a, b) => contSites[b] - contSites[a]);
  if (siteCorr && !contSites[siteCorr]) siteCorr = '';
  const completas = todas.filter(SITUACOES_CORR.completas).length;
  const noPrazo = (c) => { const d = diasAte(c.data); return prazoCorr === '' ? true : prazoCorr === 'futuras' ? d >= 0 : prazoCorr === 'passadas' ? d < 0 : d >= 0 && d <= Number(prazoCorr); };
  // com busca ativa, procura em todas as datas
  const lista = filtrarBusca(todas).filter((c) => (buscaAdmin.trim() || noPrazo(c)) && (!situacaoCorr || SITUACOES_CORR[situacaoCorr](c))
    && (!siteCorr || dominioLink(c.link_inscricao) === siteCorr) && (!ufCorr || c.estado === ufCorr) && (!statusCorr || c.status === statusCorr));
  lista.sort(ORDENS_DATA[ordemCorr] || ORDENS_DATA.proximas);
  box.innerHTML = `<div class="barra-admin" style="flex-wrap:wrap;gap:8px"><span class="muted">${lista.length} de ${todas.length} corrida(s) cadastrada(s)</span><button class="btn btn-cone" id="novaCorrida" style="margin-left:auto">Nova corrida</button></div>
  <div class="filtros-admin">
  <select class="campo" id="ordemCorr" title="Ordenar">${opcoesSel([['proximas', 'Data mais próxima primeiro'], ['distantes', 'Data mais distante primeiro'], ['recentes', 'Cadastradas mais recentemente']], ordemCorr)}</select>
  <select class="campo" id="situacaoCorr" title="Situação">${opcoesSel([['', 'Qualquer situação'], ['completas', `Completas: com imagem e local (${completas})`], ['sem_img', 'Falta imagem'], ['sem_local', 'Falta local'], ['sem_dist', 'Falta distâncias'], ['sem_desc', `Sem descrição (${todas.filter(SITUACOES_CORR.sem_desc).length})`], ['desc_auto', `Descrição automática, para conferir (${todas.filter(SITUACOES_CORR.desc_auto).length})`], ['desc_sua', 'Descrição sua']], situacaoCorr)}</select>
  <select class="campo" id="siteCorr" title="Site de inscrição"><option value="">Todos os sites</option>${sites.map((d) => `<option value="${esc(d)}"${d === siteCorr ? ' selected' : ''}>${esc(d)} (${contSites[d]})</option>`).join('')}</select>
  <select class="campo" id="prazoCorr" title="Período">${opcoesSel([['futuras', 'Próximas (a partir de hoje)'], ['7', 'Próximos 7 dias'], ['15', 'Próximos 15 dias'], ['30', 'Próximos 30 dias'], ['60', 'Próximos 60 dias'], ['passadas', 'Já aconteceram'], ['', 'Qualquer data']], prazoCorr)}</select>
  <select class="campo" id="statusCorr" title="Status">${opcoesSel([['', 'Qualquer status'], ['publicado', 'Publicadas'], ['rascunho', 'Rascunho'], ['arquivado', 'Arquivadas']], statusCorr)}</select>
  ${ufs.length > 1 ? `<select class="campo" id="ufCorr" title="Estado"><option value="">Todos os estados</option>${ufs.map((u) => `<option${u === ufCorr ? ' selected' : ''}>${esc(u)}</option>`).join('')}</select>` : ''}
  </div>${buscaAdmin.trim() ? '<p class="muted" style="margin:0 0 10px"><small>Com a busca ativa, aparecem corridas de qualquer data.</small></p>' : ''}
  <div class="tabela-wrap"><table class="tab"><thead><tr><th>Data</th><th>Corrida</th><th>Cidade</th><th>Descrição</th><th>Distâncias</th><th>Status</th><th><span class="muted" style="font-weight:400">Ações</span></th></tr></thead><tbody>
  ${lista.map((c) => { const p = partes(c.data); const fd = diasAte(c.data); const dt = textoSimples(c.descricao); return `<tr><td>${p.dia}/${String(MESES.indexOf(p.mes) + 1).padStart(2, '0')}/${p.ano}<br><small class="${fd >= 0 && fd <= 7 ? 'pend-urgente' : 'muted'}">${fd < 0 ? 'já aconteceu' : fd === 0 ? 'hoje' : fd === 1 ? 'amanhã' : `em ${fd} dias`}</small></td><td>${c.imagem_url ? `<img class="pend-mini" src="${esc(c.imagem_url)}" alt="" loading="lazy" onerror="this.remove()">` : ''}<b>${esc(c.nome)}</b> <span class="selos-pend"><span class="selo-pend ${c.imagem_url ? 'ok' : ''}">${c.imagem_url ? '✓' : '✗'} imagem</span><span class="selo-pend ${c.lat != null ? 'ok' : ''}">${c.lat != null ? '✓' : '✗'} local</span></span>${c.local_largada ? `<br><small class="muted">${esc(c.local_largada)}</small>` : ''}</td><td>${esc(c.cidade)}${c.estado ? ` <small class="muted">${esc(c.estado)}</small>` : ''}</td><td class="col-desc">${dt ? `<span class="selo-desc ${c.descricao_auto ? 'auto' : ''}">${c.descricao_auto ? 'automática' : 'sua'}</span> <span class="desc-ini">${esc(dt.length > 110 ? dt.slice(0, 110) + '…' : dt)}</span>` : '<span class="muted">Sem descrição</span>'}</td><td>${esc(rotulos(c).join(', ') || '—')}</td><td><span class="status ${c.status}">${c.status}</span></td><td class="acoes"><a class="btn btn-linha btn-olho" href="#corrida/${esc(c.slug)}" target="_blank" rel="noopener" title="Visualizar página" aria-label="Visualizar página de ${esc(c.nome)}"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" style="vertical-align:-3px"><path fill="none" stroke="currentColor" stroke-width="2" d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/></svg></a> <button class="btn btn-linha" data-editar="${c.id}">Editar</button> <button class="btn btn-perigo" data-excluir="${c.id}">Excluir</button></td></tr>`; }).join('') || `<tr><td colspan="7" class="muted">${todas.length ? 'Nenhuma corrida com esses filtros.' : 'Nenhuma corrida ainda. Clique em "Nova corrida" para cadastrar a primeira.'}</td></tr>`}
  </tbody></table></div>`;
  $('#novaCorrida').addEventListener('click', () => formCorrida());
  [['ordemCorr', (v) => { ordemCorr = v; }], ['situacaoCorr', (v) => { situacaoCorr = v; }], ['siteCorr', (v) => { siteCorr = v; }], ['prazoCorr', (v) => { prazoCorr = v; }], ['statusCorr', (v) => { statusCorr = v; }], ['ufCorr', (v) => { ufCorr = v; }]]
    .forEach(([id, set]) => $('#' + id, box)?.addEventListener('change', (e) => { set(e.target.value); adminCorridas(false); }));
  $$('[data-editar]', box).forEach((b) => b.addEventListener('click', () => formCorrida(todas.find((c) => c.id === b.dataset.editar))));
  $$('[data-excluir]', box).forEach((b) => b.addEventListener('click', async () => {
    const c = todas.find((x) => x.id === b.dataset.excluir);
    if (!confirm(`Excluir "${c.nome}"? Isso não pode ser desfeito.`)) return;
    const { error } = await sb.from('corridas').delete().eq('id', c.id);
    toast(error ? 'Não foi possível excluir.' : 'Corrida excluída');
    adminCorridas(); atualizarPublico();
  }));
}

/* ---------- Fila de corridas encontradas pela busca automática ---------- */
const COORD_CIDADES = {
  'indaiatuba': [-23.0903, -47.2181], 'salto': [-23.2003, -47.2869], 'itu': [-23.2642, -47.2993], 'elias fausto': [-23.0428, -47.3736],
  'monte mor': [-22.9467, -47.3158], 'campinas': [-22.9056, -47.0608], 'hortolandia': [-22.8582, -47.2200], 'sumare': [-22.8219, -47.2669],
  'cabreuva': [-23.3075, -47.1328], 'valinhos': [-22.9707, -46.9958], 'vinhedo': [-23.0297, -46.9750], 'capivari': [-22.9951, -47.5071],
  'rafard': [-23.0106, -47.5317], 'jundiai': [-23.1857, -46.8978], 'itupeva': [-23.1526, -47.0578], 'porto feliz': [-23.2153, -47.5236]
};
const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
// Nota de confiança (calculada no banco, 0 a 100): o robô publica sozinho a partir de 90
const NOTA_PUBLICA = 90;
function detalheNota(p) {
  const falta = [];
  if (!p.imagem_sugerida) falta.push('imagem');
  if (p.lat == null) falta.push('pino');
  else {
    if (!p.pino_conferido_em) falta.push('pino ainda não conferido');
    const semLocal = 20 + (p.imagem_sugerida ? 20 : 0) + 10 + (p.pino_conferido_em ? 10 : 0) + (p.distancias ? 15 : 0) + (p.horario ? 5 : 0) + (p.descricao ? 5 : 0);
    if (p.nota_pendente != null && p.nota_pendente < semLocal + 15) falta.push('local é só a cidade');
  }
  if (!p.distancias) falta.push('distâncias');
  if (!p.horario) falta.push('horário');
  if (!p.descricao) falta.push('descrição');
  return falta;
}
function seloNota(p) {
  if (p.nota_pendente == null) return '';
  const n = p.nota_pendente, falta = detalheNota(p);
  const cls = n >= NOTA_PUBLICA ? 'alta' : n >= 70 ? 'media' : 'baixa';
  const dica = n >= NOTA_PUBLICA ? 'O robô publica sozinha na próxima rodada.' : `Falta: ${falta.join(', ') || '—'}.`;
  return `<span class="selo-nota ${cls}" title="Nota de confiança ${n}/100. ${esc(dica)}">${n}</span>`;
}
let filtroUfPend = '', ordemPend = 'proximas', prazoPend = '', situacaoPend = '', sitePend = '';
let paraBuscaSeq = false;
const SITUACOES_PEND = { prontas: (p) => p.lat != null, auto: (p) => (p.nota_pendente || 0) >= NOTA_PUBLICA, quase: (p) => (p.nota_pendente || 0) >= 70 && (p.nota_pendente || 0) < NOTA_PUBLICA, com_img: (p) => !!p.imagem_sugerida, sem_img: (p) => !p.imagem_sugerida, sem_local: (p) => p.lat == null };
const diasAte = (iso) => { const [a, m, d] = iso.split('-').map(Number); const h = new Date(); return Math.round((new Date(a, m - 1, d) - new Date(h.getFullYear(), h.getMonth(), h.getDate())) / 864e5); };
async function adminPendentes(recarregar = true) {
  const box = $('#conteudoAdmin');
  if (recarregar || !cachePend) { box.innerHTML = '<p class="muted">Carregando…</p>'; cachePend = await carregarPendentes(); }
  const data = cachePend || [];
  contarBusca();
  if (!cachePend) { box.innerHTML = '<div class="aviso erro">Não foi possível carregar a fila. Confira se a tabela de pendentes existe no banco.</div>'; return; }
  const ufs = [...new Set(data.map((p) => p.estado).filter(Boolean))].sort();
  if (!ufs.includes(filtroUfPend)) filtroUfPend = '';
  const domPend = (p) => { try { return new URL(p.link_inscricao).hostname.replace(/^www\./, ''); } catch { return ''; } };
  const contSites = {}; data.forEach((p) => { const d = domPend(p); if (d) contSites[d] = (contSites[d] || 0) + 1; });
  const sitesPend = Object.keys(contSites).sort((a, b) => contSites[b] - contSites[a]);
  if (sitePend && !contSites[sitePend]) sitePend = '';
  const prontas = data.filter(SITUACOES_PEND.prontas).length;
  const lista = filtrarBusca(data).filter((p) => (!filtroUfPend || p.estado === filtroUfPend) && (!prazoPend || diasAte(p.data) <= Number(prazoPend))
    && (!situacaoPend || SITUACOES_PEND[situacaoPend](p)) && (!sitePend || domPend(p) === sitePend));
  const ordens = { proximas: (a, b) => a.data.localeCompare(b.data), distantes: (a, b) => b.data.localeCompare(a.data), recentes: (a, b) => String(b.criado_em || '').localeCompare(String(a.criado_em || '')) };
  ordens.nota = (a, b) => (b.nota_pendente || 0) - (a.nota_pendente || 0) || a.data.localeCompare(b.data);
  lista.sort(ordens[ordemPend] || ordens.proximas);
  const opc = (pares, atual) => pares.map(([v, t]) => `<option value="${v}"${v === atual ? ' selected' : ''}>${t}</option>`).join('');
  box.innerHTML = `<div class="barra-admin" style="flex-wrap:wrap;gap:8px"><span class="muted">${data.length ? `${lista.length} de ${data.length} corrida(s) encontrada(s) pela busca automática esperando revisão` : 'Nenhuma corrida esperando revisão. A busca automática roda todo dia de manhã.'}</span>
  <span style="display:flex;gap:8px;flex-wrap:wrap;margin-left:auto">
  <select class="campo" id="ordemPend" style="width:auto" title="Ordenar">${opc([['proximas', 'Data mais próxima primeiro'], ['distantes', 'Data mais distante primeiro'], ['recentes', 'Encontradas mais recentemente'], ['nota', 'Maior nota primeiro']], ordemPend)}</select>
  <select class="campo" id="situacaoPend" style="width:auto" title="Situação">${opc([['', 'Qualquer situação'], ['prontas', `Prontas: com local (${prontas})`], ['quase', `Nota 70 a 89: quase prontas (${data.filter(SITUACOES_PEND.quase).length})`], ['auto', `Nota 90+: o robô publica (${data.filter(SITUACOES_PEND.auto).length})`], ['com_img', `Com imagem (${data.filter(SITUACOES_PEND.com_img).length})`], ['sem_img', `Falta imagem (${data.filter(SITUACOES_PEND.sem_img).length})`], ['sem_local', `Falta local (${data.filter(SITUACOES_PEND.sem_local).length})`]], situacaoPend)}</select>
  <select class="campo" id="sitePend" style="width:auto" title="Site de inscrição"><option value="">Todos os sites</option>${sitesPend.map((d) => `<option value="${esc(d)}"${d === sitePend ? ' selected' : ''}>${esc(d)} (${contSites[d]})</option>`).join('')}</select>
  <select class="campo" id="prazoPend" style="width:auto" title="Período">${opc([['', 'Qualquer data'], ['7', 'Próximos 7 dias'], ['15', 'Próximos 15 dias'], ['30', 'Próximos 30 dias'], ['60', 'Próximos 60 dias']], prazoPend)}</select>
  ${ufs.length > 1 ? `<select class="campo" id="filtroUfPend" style="width:auto"><option value="">Todos os estados</option>${ufs.map((u) => `<option${u === filtroUfPend ? ' selected' : ''}>${u}</option>`).join('')}</select>` : ''}</span></div>
  <div class="lote-pend" id="lotePend"><label><input type="checkbox" id="selTodasPend"> Selecionar todas as ${lista.length} da lista</label>
    <span class="muted" id="contSelPend">nenhuma selecionada</span>
    <button class="btn btn-escuro" type="button" id="publicarSelPend" disabled>Publicar selecionadas</button>
    <button class="btn btn-perigo" type="button" id="recusarSelPend" disabled>Recusar selecionadas</button>
    <button class="btn btn-cone" type="button" id="buscarTodasPend" title="Busca imagem e local em cada pendente da lista, uma a uma, com 5 segundos entre cada">Buscar todas da lista</button></div>
  <div class="tabela-wrap"><table class="tab"><thead><tr><th style="width:28px"></th><th>Data</th><th>Corrida</th><th>Cidade</th><th>Distâncias</th><th>Fonte</th><th><span class="muted" style="font-weight:400">Ações</span></th></tr></thead><tbody>
  ${lista.map((p) => { const [a, m, d] = p.data.split('-'); const fd = diasAte(p.data); return `<tr><td><input type="checkbox" class="sel-pend" value="${p.id}" aria-label="Selecionar ${esc(p.nome)}"></td><td>${d}/${m}/${a}<br><small class="${fd <= 7 ? 'pend-urgente' : 'muted'}">${fd <= 0 ? 'hoje' : fd === 1 ? 'amanhã' : `em ${fd} dias`}</small></td><td>${p.imagem_sugerida ? `<img class="pend-mini" src="${esc(p.imagem_sugerida)}" alt="" loading="lazy" onerror="this.remove()">` : ''}${seloNota(p)}<b>${esc(p.nome)}</b> <span class="selos-pend"><span class="selo-pend ${p.imagem_sugerida ? 'ok' : ''}">${p.imagem_sugerida ? '✓' : '✗'} imagem</span><span class="selo-pend ${p.lat != null ? 'ok' : ''}">${p.lat != null ? '✓' : '✗'} local</span></span>${p.descricao ? `<br><small>${esc(p.descricao.length > 140 ? p.descricao.slice(0, 140) + '…' : p.descricao)}</small>` : ''}${p.observacao ? `<br><small class="muted">${esc(p.observacao)}</small>` : ''}${p.lat != null ? '<br><small class="muted">Local exato encontrado' + (p.local_largada ? ': ' + esc(p.local_largada) : '') + '</small>' : ''}${p.percurso_url || p.percurso_info ? `<br><small class="tem-perc">Tem percurso${p.percurso_info ? ': ' + esc(p.percurso_info) : ''}${p.percurso_url ? ` · <a href="${esc(p.percurso_url)}" target="_blank" rel="noopener">abrir</a>` : ''}</small>` : ''}</td><td>${esc(p.cidade)}</td><td>${esc(p.distancias || '—')}</td>
    <td>${p.fonte_url ? `<a href="${esc(p.fonte_url)}" target="_blank" rel="noopener" style="color:var(--cone-txt);font-weight:600">${esc(p.fonte || 'ver fonte')}</a>` : esc(p.fonte || '—')}</td>
    <td class="acoes"><button class="btn btn-cone" data-buscar-pend="${p.id}" ${p.link_inscricao ? '' : 'disabled title="Sem link de inscrição"'}>Buscar</button> <button class="btn btn-escuro" data-revisar="${p.id}">Revisar e aprovar</button> <button class="btn btn-perigo" data-recusar="${p.id}">Recusar</button></td></tr>`; }).join('') || '<tr><td colspan="7" class="muted">Tudo revisado por aqui.</td></tr>'}
  </tbody></table></div>`;
  const selUf = $('#filtroUfPend', box);
  if (selUf) selUf.addEventListener('change', () => { filtroUfPend = selUf.value; adminPendentes(false); });
  $('#ordemPend', box).addEventListener('change', (e) => { ordemPend = e.target.value; adminPendentes(false); });
  $('#prazoPend', box).addEventListener('change', (e) => { prazoPend = e.target.value; adminPendentes(false); });
  $('#situacaoPend', box).addEventListener('change', (e) => { situacaoPend = e.target.value; adminPendentes(false); });
  // seleção em lote
  const marcadas = () => $$('.sel-pend:checked', box).map((c) => c.value);
  const atualizarLote = () => {
    const n = marcadas().length;
    $('#contSelPend', box).textContent = n ? `${n} selecionada(s)` : 'nenhuma selecionada';
    $('#publicarSelPend', box).disabled = !n; $('#recusarSelPend', box).disabled = !n;
    const todas = $$('.sel-pend', box); $('#selTodasPend', box).checked = todas.length > 0 && n === todas.length;
  };
  $$('.sel-pend', box).forEach((c) => c.addEventListener('change', atualizarLote));
  $('#selTodasPend', box).addEventListener('change', (e) => { $$('.sel-pend', box).forEach((c) => { c.checked = e.target.checked; }); atualizarLote(); });
  $('#publicarSelPend', box).addEventListener('click', async (e) => {
    const ids = marcadas();
    const semLocal = lista.filter((p) => ids.includes(p.id) && !SITUACOES_PEND.prontas(p) && p.link_inscricao && p.cidade);
    if (!confirm(`Publicar ${ids.length} corrida(s) no site agora?${semLocal.length ? `\n\n${semLocal.length} delas não têm local exato: o pino vai para o centro da cidade e, se não houver endereço, a página mostra "local exato a confirmar".` : ''}\n\nA imagem de divulgação entra com crédito ao organizador quando disponível. Corridas que já existem no site não são duplicadas.`)) return;
    e.target.disabled = true;
    // sem local exato: assume o centro da cidade (uma consulta por cidade, com pausa para não sobrecarregar o serviço de mapas)
    const centros = new Map();
    for (let i = 0; i < semLocal.length; i++) {
      const p = semLocal[i], k = `${p.cidade}|${p.estado || 'SP'}`.toLowerCase();
      e.target.textContent = `Localizando cidades ${i + 1}/${semLocal.length}…`;
      if (!centros.has(k)) {
        if (centros.size) await new Promise((ok) => setTimeout(ok, 1100));
        let c = null;
        try { const r = await fetchAdmin(`/api/extrair?cidade=${encodeURIComponent(p.cidade)}&uf=${encodeURIComponent(p.estado || 'SP')}`); const j = await r.json(); if (r.ok && j.lat != null) c = [j.lat, j.lng]; } catch { /* fica sem pino e é pulada */ }
        centros.set(k, c);
      }
      const c = centros.get(k);
      if (!c) continue;
      const dados = { lat: c[0], lng: c[1] };
      if (!String(p.local_largada || '').trim()) dados.local_largada = `${p.cidade}, ${p.estado || 'SP'} (local exato a confirmar)`;
      await sb.from('corridas_pendentes').update(dados).eq('id', p.id);
    }
    e.target.textContent = 'Publicando…';
    const { data: r, error } = await sb.rpc('admin_publicar_pendentes', { p_ids: ids });
    if (error) { toast('Não foi possível publicar: ' + error.message); e.target.disabled = false; e.target.textContent = 'Publicar selecionadas'; return; }
    toast(`${r.publicadas} publicada(s)${r.ja_existiam ? `, ${r.ja_existiam} já existiam no site` : ''}${r.incompletas ? `, ${r.incompletas} puladas (sem link ou cidade não localizada)` : ''}.`);
    adminPendentes(); atualizarPublico();
  });
  $('#recusarSelPend', box).addEventListener('click', async () => {
    const ids = marcadas();
    if (!confirm(`Recusar ${ids.length} corrida(s)? Elas saem da fila.`)) return;
    const { error } = await sb.from('corridas_pendentes').update({ status: 'recusada', revisado_em: new Date().toISOString() }).in('id', ids);
    toast(error ? 'Não foi possível recusar.' : `${ids.length} recusada(s)`); adminPendentes();
  });
  $('#sitePend', box).addEventListener('change', (e) => { sitePend = e.target.value; adminPendentes(false); });
  $$('[data-recusar]', box).forEach((b) => b.addEventListener('click', async () => {
    await sb.from('corridas_pendentes').update({ status: 'recusada', revisado_em: new Date().toISOString() }).eq('id', b.dataset.recusar);
    toast('Corrida recusada'); adminPendentes();
  }));
  $$('[data-revisar]', box).forEach((b) => b.addEventListener('click', () => {
    const p = lista.find((x) => x.id === b.dataset.revisar);
    const coord = COORD_CIDADES[semAcento(p.cidade)];
    const dists = String(p.distancias || '').split(/\s*(?:,|;|\/|\be\b)\s*/).map((s) => s.trim()).filter(Boolean).map((s) => {
      const n = parseFloat(s.replace(',', '.').replace(/[^\d.]/g, ''));
      const km = /21|meia/i.test(s) ? 21.0975 : /42|marat/i.test(s) ? 42.195 : n;
      return km ? { rotulo: s.toUpperCase().replace(/\s*KM$/, 'K'), km, preco: p.preco_a_partir } : null;
    }).filter(Boolean);
    const temPonto = p.lat != null && p.lng != null;
    formCorrida({ nome: p.nome, cidade: p.cidade, estado: p.estado, data: p.data, horario: p.horario, link_inscricao: p.link_inscricao,
      descricao: p.descricao, descricao_auto: p.descricao_auto, organizador: p.organizador, local_largada: p.local_largada, imagem_sugerida: p.imagem_sugerida,
      lat: temPonto ? p.lat : coord ? coord[0] : null, lng: temPonto ? p.lng : coord ? coord[1] : null, status: 'publicado', inscricoes_abertas: true,
      corrida_distancias: dists.length ? dists : [{}] }, p);
  }));
  $$('[data-buscar-pend]', box).forEach((b) => b.addEventListener('click', async () => {
    const p = lista.find((x) => x.id === b.dataset.buscarPend);
    if (!p?.link_inscricao) return;
    b.disabled = true; b.textContent = '…';
    try {
      const r = await fetchAdmin(`/api/extrair?url=${encodeURIComponent(p.link_inscricao)}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro || 'Erro ao ler a página');
      const dados = {};
      if (j.imagem) dados.imagem_sugerida = j.imagem;
      if (j.lat != null) { dados.lat = j.lat; dados.lng = j.lng; }
      if (j.local) dados.local_largada = j.local;
      if (Object.keys(dados).length) {
        dados.enriquecido_em = new Date().toISOString();
        dados.tentativas_enriquecer = 0;
        await sb.from('corridas_pendentes').update(dados).eq('id', p.id);
        const achados = [j.imagem && 'imagem', j.lat != null && 'local'].filter(Boolean).join(' e ');
        toast(`${p.nome}: ${achados} encontrado(s).`);
        adminPendentes(false);
      } else {
        toast(`${p.nome}: não encontrei imagem nem local.`);
        b.disabled = false; b.textContent = 'Buscar';
      }
    } catch (e) {
      toast(`Erro: ${e.message}`);
      b.disabled = false; b.textContent = 'Buscar';
    }
  }));

  $('#buscarTodasPend', box).addEventListener('click', async function () {
    if (this.dataset.rodando) { paraBuscaSeq = true; this.textContent = 'Parando…'; return; }
    const fila = lista.filter((p) => p.link_inscricao && (!p.imagem_sugerida || p.lat == null));
    if (!fila.length) { toast('Todas da lista já têm imagem e local.'); return; }
    this.dataset.rodando = '1'; paraBuscaSeq = false;
    let i = 0, achados = 0;
    for (const p of fila) {
      if (paraBuscaSeq) break;
      this.textContent = `Parar (${i + 1}/${fila.length})`;
      const btn = $(`[data-buscar-pend="${p.id}"]`, box);
      if (btn) { btn.disabled = true; btn.textContent = '…'; }
      try {
        const r = await fetchAdmin(`/api/extrair?url=${encodeURIComponent(p.link_inscricao)}`);
        const j = r.ok ? await r.json() : null;
        if (j) {
          const dados = {};
          if (j.imagem && !p.imagem_sugerida) dados.imagem_sugerida = j.imagem;
          if (j.lat != null && p.lat == null) { dados.lat = j.lat; dados.lng = j.lng; }
          if (j.local && !p.local_largada) dados.local_largada = j.local;
          if (Object.keys(dados).length) {
            dados.enriquecido_em = new Date().toISOString();
            dados.tentativas_enriquecer = 0;
            await sb.from('corridas_pendentes').update(dados).eq('id', p.id);
            Object.assign(p, dados);
            achados++;
            if (btn) btn.textContent = '✓';
          } else {
            if (btn) { btn.disabled = false; btn.textContent = 'Buscar'; }
          }
        } else {
          if (btn) { btn.disabled = false; btn.textContent = 'Buscar'; }
        }
      } catch { if (btn) { btn.disabled = false; btn.textContent = 'Buscar'; } }
      i++;
      if (i < fila.length && !paraBuscaSeq) await new Promise((r) => setTimeout(r, 2000));
    }
    delete this.dataset.rodando;
    this.textContent = 'Buscar todas da lista';
    toast(`Busca concluída: ${achados} encontrado(s) de ${i} tentativa(s).`);
    adminPendentes(false);
  });
}

const percDist = new WeakMap();
const infoPerc = (p) => `${String(p.percurso_km).replace('.', ',')} km${p.subida_m != null ? `, +${p.subida_m} m` : ''}`;
function linhaDist(d = {}) {
  return `<div class="dist-form"><label class="campo">Nome<input name="rotulo" value="${esc(d.rotulo || '')}" placeholder="10K" required></label><label class="campo">Km <small>ou vazio</small><input name="km" type="number" step="any" min="0" inputmode="decimal" value="${d.km ?? ''}" placeholder="10"></label><label class="campo">Duração (h) <small>prova por tempo</small><input name="horas" type="number" step="0.5" min="0" value="${d.horas ?? ''}" placeholder="6"></label><label class="campo">Preço (R$)<input name="preco" type="number" step="0.01" min="0" value="${d.preco ?? ''}"></label><button type="button" class="btn btn-linha" data-rm aria-label="Remover distância">×</button>
    <div class="dist-gpx"><label class="btn btn-linha gpx-btn">GPX desta distância<input type="file" accept=".gpx,application/gpx+xml" data-gpx-dist hidden></label>
    <small data-gpx-info>${temTrajeto(d) ? `Percurso salvo: ${infoPerc(d)}.` : 'Sem percurso próprio.'}</small>
    ${temTrajeto(d) ? '<label class="check"><input type="checkbox" data-gpx-rm> Remover</label>' : ''}</div></div>`;
}
const coordValida = (la, lo) => isFinite(la) && isFinite(lo) && Math.abs(la) <= 90 && Math.abs(lo) <= 180 && !(la === 0 && lo === 0);
function lerCoordenadas(txt) {
  let t = String(txt); try { t = decodeURIComponent(t); } catch { /* segue */ }
  const ok = (a, b) => { let la = parseFloat(a), lo = parseFloat(b); if (Math.abs(la) > 40 && Math.abs(lo) <= 40) [la, lo] = [lo, la]; return coordValida(la, lo) ? [la, lo] : null; };
  let m = t.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/); if (m) return ok(m[1], m[2]);
  m = t.match(/[?&](?:q|query|ll|destination|center)=(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/); if (m) return ok(m[1], m[2]);
  m = t.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/); if (m) return ok(m[1], m[2]);
  const dms = [...t.matchAll(/(\d{1,3})°\s*(\d{1,2})['′]\s*([\d.]+)["″]?\s*([NSLOEW])/gi)];
  if (dms.length >= 2) {
    const v = (d) => (Number(d[1]) + Number(d[2]) / 60 + Number(d[3]) / 3600) * (/[SOW]/i.test(d[4]) ? -1 : 1);
    return ok(v(dms[0]), v(dms[1]));
  }
  m = t.match(/(-?\d{1,3}\.\d+)\s*[,;\s]\s*(-?\d{1,3}\.\d+)/); if (m) return ok(m[1], m[2]);
  m = t.match(/(-?\d{1,3},\d+)\s*[;\s]\s*(-?\d{1,3},\d+)/); if (m) return ok(m[1].replace(',', '.'), m[2].replace(',', '.'));
  return null;
}
/* ===== Texto formatado (negrito, itálico, listas, links) ===== */
const TAGS_OK = { P: 'p', BR: 'br', STRONG: 'strong', B: 'strong', EM: 'em', I: 'em', U: 'u', UL: 'ul', OL: 'ol', LI: 'li', A: 'a', H2: 'h3', H3: 'h3', H4: 'h3', BLOCKQUOTE: 'blockquote' };
const BLOCOS = new Set(['DIV', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'TABLE', 'TR', 'H1', 'H5', 'H6']);
function limparHtml(html) {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const fora = document.createElement('div');
  const copiar = (orig, dest) => {
    orig.childNodes.forEach((n) => {
      if (n.nodeType === 3) { dest.appendChild(document.createTextNode(n.textContent.replace(/ /g, ' '))); return; }
      if (n.nodeType !== 1) return;
      const tag = n.tagName;
      if (['SCRIPT', 'STYLE', 'META', 'LINK', 'TITLE', 'IFRAME', 'OBJECT', 'IMG', 'SVG'].includes(tag)) return;
      const st = n.getAttribute('style') || '';
      const peso = (st.match(/font-weight\s*:\s*(\w+)/i) || [])[1];
      const negrito = peso && (peso === 'bold' || Number(peso) >= 600);
      const italico = /font-style\s*:\s*italic/i.test(st);
      let alvo = dest;
      const nova = TAGS_OK[tag];
      if (tag === 'B' && peso && !negrito) { /* Google Docs embrulha tudo num <b> normal */ }
      else if (nova) {
        const el = document.createElement(nova);
        if (nova === 'a') {
          const href = n.getAttribute('href') || '';
          if (!/^(https?:|mailto:)/i.test(href)) { copiar(n, dest); return; }
          el.href = href; el.target = '_blank'; el.rel = 'noopener';
        }
        dest.appendChild(el); alvo = el;
      } else if (BLOCOS.has(tag)) { const el = document.createElement('p'); dest.appendChild(el); alvo = el; }
      if (negrito && nova !== 'strong') { const b = document.createElement('strong'); alvo.appendChild(b); alvo = b; }
      if (italico && nova !== 'em') { const i = document.createElement('em'); alvo.appendChild(i); alvo = i; }
      copiar(n, alvo);
    });
  };
  copiar(doc.body.firstChild, fora);
  fora.querySelectorAll('p p').forEach((p) => p.replaceWith(...p.childNodes));
  fora.querySelectorAll('p,li,strong,em,u,h3,blockquote').forEach((e) => { if (!e.textContent.trim() && !e.querySelector('br')) e.remove(); });
  return fora.innerHTML.trim();
}
const ehHtml = (t) => /<\/?(p|br|strong|b|em|i|ul|ol|li|a|h3|u|blockquote)\b/i.test(t || '');
function textoRico(t) {
  if (!t) return '';
  if (ehHtml(t)) return limparHtml(t);
  return String(t).split(/\n{2,}/).map((par) => `<p>${esc(par).replace(/\n/g, '<br>')}</p>`).join('');
}
function editorRico(nome, valor, altura = 180) {
  return `<div class="editor" data-editor="${nome}">
    <div class="editor-barra" role="toolbar" aria-label="Formatação">
      <button type="button" data-cmd="bold" title="Negrito"><b>N</b></button><button type="button" data-cmd="italic" title="Itálico"><i>I</i></button>
      <button type="button" data-cmd="formatBlock" data-arg="h3" title="Subtítulo">T</button>
      <button type="button" data-cmd="insertUnorderedList" title="Lista">• Lista</button><button type="button" data-cmd="insertOrderedList" title="Lista numerada">1. Lista</button>
      <button type="button" data-cmd="createLink" title="Link">Link</button><button type="button" data-cmd="removeFormat" title="Limpar formatação">Limpar</button>
    </div>
    <div class="editor-area" contenteditable="true" style="min-height:${altura}px">${textoRico(valor)}</div>
  </div>`;
}
function ligarEditores(raiz) {
  $$('.editor', raiz).forEach((ed) => {
    const area = $('.editor-area', ed);
    ed.querySelector('.editor-barra').addEventListener('mousedown', (e) => e.preventDefault());
    ed.querySelector('.editor-barra').addEventListener('click', (e) => {
      const b = e.target.closest('[data-cmd]'); if (!b) return;
      area.focus();
      if (b.dataset.cmd === 'createLink') { const u = prompt('Endereço do link (https://...)'); if (u && /^https?:\/\//i.test(u)) document.execCommand('createLink', false, u); return; }
      if (b.dataset.cmd === 'formatBlock') { const atual = document.queryCommandValue('formatBlock'); document.execCommand('formatBlock', false, /h3/i.test(atual) ? 'p' : 'h3'); return; }
      document.execCommand(b.dataset.cmd, false, b.dataset.arg || null);
    });
    area.addEventListener('paste', (e) => {
      const cd = e.clipboardData; if (!cd) return;
      e.preventDefault();
      const html = cd.getData('text/html');
      const limpo = html ? limparHtml(html) : textoRico(cd.getData('text/plain'));
      document.execCommand('insertHTML', false, limpo);
    });
  });
}
const valorEditor = (raiz, nome) => { const a = $(`[data-editor="${nome}"] .editor-area`, raiz); const h = limparHtml(a.innerHTML); return a.textContent.trim() ? h : null; };

/* ===== Envio de fotos para o Supabase Storage (bucket "fotos") ===== */
async function reduzirFoto(arq, max = 1600) {
  const img = await new Promise((ok, erro) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => erro(new Error('Não consegui ler essa imagem.')); i.src = URL.createObjectURL(arq); });
  const esc2 = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const cv = document.createElement('canvas'); cv.width = Math.round(img.naturalWidth * esc2); cv.height = Math.round(img.naturalHeight * esc2);
  cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
  URL.revokeObjectURL(img.src);
  const blob = await new Promise((ok) => cv.toBlob(ok, 'image/webp', 0.85)) || await new Promise((ok) => cv.toBlob(ok, 'image/jpeg', 0.85));
  return blob;
}
async function enviarFoto(arq, pasta) {
  if (!sb) throw new Error('Sem conexão com o banco.');
  if (!/^image\/(jpeg|png|webp)$/.test(arq.type)) throw new Error('Use uma foto JPG, PNG ou WebP.');
  const blob = await reduzirFoto(arq);
  const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
  const nome = `${pasta}/${new Date().toISOString().slice(0, 10)}-${Math.random().toString(36).slice(2, 8)}-${slugify(arq.name.replace(/\.[^.]+$/, '')).slice(0, 40) || 'foto'}.${ext}`;
  const { error } = await sb.storage.from('fotos').upload(nome, blob, { contentType: blob.type, cacheControl: '31536000', upsert: false });
  if (error) throw new Error(/row-level|policy|denied/i.test(error.message) ? 'Sem permissão para enviar. Entre como administrador.' : /size|large/i.test(error.message) ? 'A foto ficou grande demais (máx. 5 MB).' : 'Não foi possível enviar a foto.');
  return sb.storage.from('fotos').getPublicUrl(nome).data.publicUrl;
}
function campoFoto(valor) {
  return `<div class="campo campo-foto">Imagem
    <div class="foto-envio"><div class="foto-prev">${valor ? `<img src="${esc(valor)}" alt="">` : '<span>Sem foto</span>'}</div>
      <div class="foto-acoes"><label class="btn btn-linha">Enviar foto<input type="file" accept="image/jpeg,image/png,image/webp" data-foto-arq hidden></label>
        <input name="imagem_url" type="url" value="${esc(valor || '')}" placeholder="ou cole um link https://">
        <small data-foto-info>JPG, PNG ou WebP. A foto é reduzida automaticamente para carregar rápido.</small></div></div></div>`;
}
function ligarFoto(f, pasta) {
  const arq = $('[data-foto-arq]', f); if (!arq) return;
  const prev = $('.foto-prev', f), info = $('[data-foto-info]', f), url = f.imagem_url;
  const msgPadrao = info.textContent;
  const mostrar = (u) => {
    if (!u) { prev.innerHTML = '<span>Sem foto</span>'; info.textContent = msgPadrao; return; }
    if (!/^https?:\/\//i.test(u)) { prev.innerHTML = '<span>Link inválido</span>'; info.textContent = 'O link precisa começar com https://'; return; }
    prev.innerHTML = '<span>Carregando…</span>';
    const im = new Image();
    im.onload = () => { if (url.value.trim() !== u) return; prev.innerHTML = ''; prev.appendChild(im); info.textContent = `Pré-visualização ok (${im.naturalWidth}×${im.naturalHeight} px).`; };
    im.onerror = () => { if (url.value.trim() !== u) return; prev.innerHTML = '<span>Não abriu</span>'; info.textContent = 'Esse link não abriu como imagem. Confira se é o endereço do arquivo da foto (termina em .jpg, .png ou .webp), e não o da página.'; };
    im.alt = ''; im.src = u;
  };
  let tPrev; url.addEventListener('input', () => { clearTimeout(tPrev); tPrev = setTimeout(() => mostrar(url.value.trim()), 400); });
  url.addEventListener('change', () => mostrar(url.value.trim()));
  arq.addEventListener('change', async () => {
    const a = arq.files[0]; if (!a) return;
    info.textContent = 'Enviando…';
    try { const u = await enviarFoto(a, pasta); url.value = u; mostrar(u); info.textContent = 'Foto enviada. Ela é salva junto quando você salvar o formulário.'; }
    catch (e) { info.textContent = e.message; }
    arq.value = '';
  });
}

function formCorrida(c = {}, pendente = null) {
  const box = $('#conteudoAdmin');
  box.innerHTML = `<form class="form" id="fCorrida">
    <div class="inteiro form-topo"><h2 class="display" style="font-size:40px;margin:0">${c.id ? 'Editar corrida' : 'Nova corrida'}</h2><div class="form-topo-acoes">${c.id && c.slug ? `<a class="btn btn-linha" href="#corrida/${esc(c.slug)}" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" style="vertical-align:-3px"><path fill="none" stroke="currentColor" stroke-width="2" d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/></svg> Visualizar página</a>` : ''}<button class="btn btn-escuro" type="submit">Salvar corrida</button></div></div>
    <div class="campo inteiro busca-topo">Link de inscrição <small>Cole o link da página de inscrição (Ticket Sports, Sympla…) e clique no botão para trazer a imagem e o local.</small>
      <div class="busca-linha"><input name="link_inscricao" type="url" value="${esc(c.link_inscricao || '')}" placeholder="https://"><button type="button" class="btn btn-cone btn-buscar" id="buscarInfo">Buscar imagem e local</button></div>
      <small id="buscarMsg" role="status"></small><div id="sugTopo"></div></div>
    <label class="campo inteiro">Nome da corrida<input name="nome" required value="${esc(c.nome || '')}"></label>
    <label class="campo">Cidade<input name="cidade" required value="${esc(c.cidade || '')}" list="cidadesSug"></label>
    <datalist id="cidadesSug"><option>Indaiatuba</option><option>Salto</option><option>Itu</option><option>Elias Fausto</option><option>Monte Mor</option></datalist>
    <label class="campo">Estado<input name="estado" maxlength="2" value="${esc(c.estado || 'SP')}"></label>
    <label class="campo">Data<input name="data" type="date" required value="${esc(c.data || '')}"></label>
    <label class="campo">Horário da largada<input name="horario" type="time" value="${esc((c.horario || '').slice(0, 5))}"></label>
    <label class="campo inteiro">Local da largada<input name="local_largada" value="${esc(c.local_largada || '')}" placeholder="Ex.: Parque Ecológico, portão principal"></label>
    <label class="campo inteiro">Colar localização <small>Link do Google Maps ou coordenadas (ex.: -23.1361259, -47.2153). O pino e o endereço são preenchidos sozinhos.</small><input id="colarLocal" placeholder="Cole aqui o link do Google Maps ou as coordenadas" autocomplete="off"></label>
    <div class="campo inteiro">Posição no mapa <small>Ou clique no mapa para marcar o ponto da largada.</small><div id="mapaForm"></div>
      <small id="localInfo" role="status" style="display:block;margin-top:6px"></small>
      <div style="display:flex;gap:12px;margin-top:8px"><input name="lat" placeholder="Latitude" value="${c.lat ?? ''}" style="flex:1"><input name="lng" placeholder="Longitude" value="${c.lng ?? ''}" style="flex:1"></div></div>
    <div class="campo inteiro">Percurso principal (arquivo GPX) <small>Exporte do Strava, do Garmin ou do site da prova. Se cada distância tiver um trajeto diferente, envie o GPX de cada uma lá embaixo, em Distâncias; este campo pode ficar vazio.</small>
      <input type="file" id="gpxArquivo" accept=".gpx,application/gpx+xml" style="height:auto;padding:10px">
      <small id="gpxInfo">${c.percurso ? `Percurso salvo: ${String(c.percurso_km).replace('.', ',')} km${c.subida_m != null ? `, +${c.subida_m} m de subida` : ''}.` : 'Nenhum percurso enviado.'}</small>
      ${c.percurso ? '<label class="check"><input type="checkbox" name="remover_percurso"> Remover o percurso salvo</label>' : ''}</div>
    <div class="inteiro"><div class="campo" style="margin-bottom:8px">Distâncias</div><div id="distancias">${(c.corrida_distancias || [{}]).map(linhaDist).join('')}</div><button type="button" class="btn btn-linha" id="addDist">Adicionar distância</button></div>
    <div class="campo inteiro">Descrição <small>Pode colar texto formatado: negrito, itálico, listas e links são mantidos.</small>${c.descricao_auto ? '<small class="desc-auto">Texto escrito automaticamente a partir da página de inscrição. Confira os dados; ao editar, ele passa a ser seu.</small>' : ''}${editorRico('descricao', c.descricao)}</div>
    <label class="campo">Organizador<input name="organizador" value="${esc(c.organizador || '')}"></label>
    ${campoFoto(c.imagem_url)}
    ${c.imagem_sugerida && !c.imagem_url ? `<div class="campo inteiro sug-img"><span>Imagem de divulgação encontrada pela busca</span>
      <div class="sug-linha"><img src="${esc(c.imagem_sugerida)}" alt="" loading="lazy"><div><small>É a arte do organizador e tem direitos autorais. Use só se o organizador permitir (muitos liberam para divulgação) e sempre com o crédito.</small>
      <button type="button" class="btn btn-linha" id="usarSug">Usar esta imagem com crédito</button></div></div></div>` : ''}
    <label class="campo">Crédito da foto <small>Aparece pequeno embaixo da foto</small><input name="imagem_credito" value="${esc(c.imagem_credito || '')}" placeholder="Ex.: Foto: João Silva / Organização"></label>
    <label class="campo">O que vem no kit <small>Separe por vírgula</small><input name="kit" value="${esc((c.kit_inclui || []).join(', '))}" placeholder="Camiseta, medalha, chip"></label>
    <label class="check"><input type="checkbox" name="inscricoes_abertas" ${c.inscricoes_abertas === false ? '' : 'checked'}> Inscrições abertas</label>
    <label class="campo">Status<select name="status">${['rascunho', 'publicado', 'arquivado'].map((s) => `<option value="${s}" ${(c.status || 'rascunho') === s ? 'selected' : ''}>${s[0].toUpperCase() + s.slice(1)}</option>`).join('')}</select></label>
    <div class="acoes-form"><span id="fMsg" role="status"></span><button type="button" class="btn btn-linha" id="cancelar">Cancelar</button><button class="btn btn-escuro" type="submit">Salvar corrida</button></div>
  </form>`;
  const f = $('#fCorrida');
  ligarEditores(f);
  ligarFoto(f, 'corridas');
  $('#usarSug')?.addEventListener('click', () => {
    f.imagem_url.value = c.imagem_sugerida; f.imagem_url.dispatchEvent(new Event('change'));
    if (!f.imagem_credito.value.trim()) f.imagem_credito.value = `Imagem: divulgação${c.organizador ? ' / ' + c.organizador : ''}`;
    $('.sug-img', f)?.remove();
  });
  $$('.dist-form', f).forEach((el, i) => { const d = (c.corrida_distancias || [])[i]; if (temTrajeto(d)) percDist.set(el, { percurso: d.percurso, percurso_km: d.percurso_km, subida_m: d.subida_m, descida_m: d.descida_m }); });
  const linhasDist = new WeakMap();
  const desenharDist = (el, p) => {
    if (!mapaForm) return;
    linhasDist.get(el)?.remove();
    if (!p) return;
    const ln = L.polyline(p.percurso.map((q) => [q[0], q[1]]), { color: '#1E6FD9', weight: 3, dashArray: '6 6' }).addTo(mapaForm);
    linhasDist.set(el, ln); mapaForm.fitBounds(ln.getBounds().pad(0.1));
  };
  $('#distancias').addEventListener('change', async (e) => {
    const el = e.target.closest('.dist-form'); if (!el) return;
    if (e.target.matches('[data-gpx-rm]')) { $('[data-gpx-info]', el).textContent = e.target.checked ? 'O percurso desta distância será removido ao salvar.' : `Percurso salvo: ${infoPerc(percDist.get(el))}.`; return; }
    if (!e.target.matches('[data-gpx-dist]')) return;
    const arq = e.target.files[0]; if (!arq) return;
    try {
      const pts = lerGpx(await arq.text()); const p = prepararPercurso(pts);
      percDist.set(el, p); el.dataset.gpxNovo = '1';
      const rm = $('[data-gpx-rm]', el); if (rm) rm.checked = false;
      $('[data-gpx-info]', el).textContent = `Percurso lido: ${infoPerc(p)}. É salvo junto com a corrida.`;
      const km = $('[name=km]', el); if (!km.value) km.value = p.percurso_km;
      if (!f.lat.value) { f.lat.value = pts[0][0].toFixed(6); f.lng.value = pts[0][1].toFixed(6); }
      desenharDist(el, p);
    } catch (err) { $('[data-gpx-info]', el).textContent = `${err.message} Confira se é um arquivo .gpx.`; }
  });
  $('#addDist').addEventListener('click', () => $('#distancias').insertAdjacentHTML('beforeend', linhaDist()));
  $('#distancias').addEventListener('click', (e) => { if (e.target.closest('[data-rm]')) e.target.closest('.dist-form').remove(); });
  $('#cancelar').addEventListener('click', pendente ? adminPendentes : adminCorridas);

  if (mapaForm) mapaForm.remove();
  const inicio = c.lat != null ? [c.lat, c.lng] : CENTRO;
  mapaForm = L.map('mapaForm').setView(inicio, c.lat != null ? 14 : 10);
  camadas().mapa.addTo(mapaForm);
  let pino = c.lat != null ? L.marker(inicio, { icon: iconePino(true) }).addTo(mapaForm) : null;
  const marcar = (ll) => { if (pino) pino.setLatLng(ll); else pino = L.marker(ll, { icon: iconePino(true) }).addTo(mapaForm); };
  let autoLocal = '', autoCidade = '', timerGeo, nomeLink = '';
  const aplicarPonto = (lat, lng, centralizar) => {
    f.lat.value = lat.toFixed(7); f.lng.value = lng.toFixed(7);
    marcar(L.latLng(lat, lng));
    if (centralizar) mapaForm.setView([lat, lng], 16);
    clearTimeout(timerGeo);
    timerGeo = setTimeout(() => buscarEndereco(lat, lng), 700);
  };
  async function buscarEndereco(lat, lng) {
    const info = $('#localInfo');
    info.textContent = 'Buscando o endereço…';
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=pt-BR`);
      if (!r.ok) throw new Error();
      const j = await r.json(); const a = j.address || {};
      const rua = [a.road || a.pedestrian || a.footway, a.house_number].filter(Boolean).join(', ');
      const lugar = nomeLink || (j.name && j.name !== a.road ? j.name : '');
      const bairro = a.suburb || a.neighbourhood || a.quarter || '';
      const cidade = a.city || a.town || a.municipality || a.village || '';
      const texto = [lugar, rua, bairro].filter(Boolean).join(' · ');
      if (texto && (!f.local_largada.value.trim() || f.local_largada.value === autoLocal)) { f.local_largada.value = texto; autoLocal = texto; }
      if (cidade && (!f.cidade.value.trim() || f.cidade.value === autoCidade)) { f.cidade.value = cidade; autoCidade = cidade; }
      info.textContent = texto || cidade ? `Endereço encontrado: ${[texto, cidade].filter(Boolean).join(' – ')}. Confira e ajuste o nome do local se quiser.` : 'Ponto marcado. Não achei um endereço para este lugar; escreva o local da largada à mão.';
    } catch { info.textContent = 'Ponto marcado. Não consegui buscar o endereço agora; escreva o local da largada à mão.'; }
  }
  $('#colarLocal').addEventListener('input', (e) => {
    const t = e.target.value.trim(); if (!t) { $('#localInfo').textContent = ''; return; }
    if (/goo\.gl|maps\.app/i.test(t) && !lerCoordenadas(t)) { $('#localInfo').textContent = 'Esse é um link curto do Google Maps, e ele não traz as coordenadas. Abra o link no navegador e copie o endereço completo da barra, ou toque e segure no ponto do mapa e copie os números que aparecem.'; return; }
    const c = lerCoordenadas(t);
    const mp = t.match(/\/place\/([^/@?]+)/) || t.match(/[?&](?:query|q|destination)=([^&]+)/); nomeLink = '';
    if (mp) { try { nomeLink = decodeURIComponent(mp[1].replace(/\+/g, ' ')).replace(/,\s*Brasil$/i, '').trim(); } catch { nomeLink = mp[1].replace(/\+/g, ' '); } }
    if (!c && nomeLink && !/^-?\d+[.,]\d+/.test(nomeLink)) {
      const alvo = t; $('#localInfo').textContent = 'O link não traz coordenadas; procurando pelo endereço…';
      fetchAdmin(`/api/extrair?endereco=${encodeURIComponent(nomeLink)}`).then((r) => r.json()).then((j) => {
        if ($('#colarLocal').value.trim() !== alvo) return;
        if (j.lat != null) { if (!f.local_largada.value.trim()) { f.local_largada.value = nomeLink; autoLocal = nomeLink; } aplicarPonto(j.lat, j.lng, true); setTimeout(() => { $('#localInfo').textContent = 'Local aproximado, achado pelo endereço do link. Confira o pino e ajuste clicando no mapa se precisar.'; }, 1600); }
        else $('#localInfo').textContent = 'Não achei esse endereço no mapa. Marque o pino clicando no mapa.';
      }).catch(() => { $('#localInfo').textContent = 'Não consegui procurar o endereço agora. Marque o pino clicando no mapa.'; });
      return;
    }
    if (c) aplicarPonto(c[0], c[1], true);
    else if (/^-?\d{1,2}[.,]\d+$/.test(t)) { f.lat.value = t.replace(',', '.'); $('#localInfo').textContent = 'Recebi só a latitude. Cole as duas juntas (latitude, longitude) ou preencha a longitude abaixo.'; }
    else $('#localInfo').textContent = 'Não encontrei coordenadas aqui. Cole o link completo do Google Maps ou os números da latitude e longitude.';
  });
  const deCampos = () => { const la = parseFloat(String(f.lat.value).replace(',', '.')), lo = parseFloat(String(f.lng.value).replace(',', '.')); if (coordValida(la, lo)) aplicarPonto(la, lo, true); };
  f.lat.addEventListener('change', deCampos); f.lng.addEventListener('change', deCampos);
  $('#buscarInfo').addEventListener('click', async () => {
    const link = f.link_inscricao.value.trim(), msg = $('#buscarMsg');
    if (!/^https?:\/\//i.test(link)) { msg.textContent = 'Cole primeiro o link da página de inscrição.'; return; }
    msg.textContent = 'Lendo a página da inscrição…';
    try {
      const r = await fetchAdmin(`/api/extrair?url=${encodeURIComponent(link)}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro || 'Não foi possível ler a página.');
      const achou = [];
      if (j.mapa) $('#colarLocal').value = j.mapa;
      if (j.lat != null && j.lng != null) {
        if (j.local) { nomeLink = j.local; if (!f.local_largada.value.trim()) { f.local_largada.value = j.local; autoLocal = j.local; } }
        aplicarPonto(j.lat, j.lng, true); achou.push(j.aproximado ? 'local (aproximado, pelo endereço — confira o pino)' : 'local exato');
      } else if (j.local && !f.local_largada.value.trim()) { f.local_largada.value = j.local; achou.push('endereço (sem coordenadas — marque o pino no mapa)'); }
      if (j.imagem) {
        $('.sug-img', f)?.remove();
        $('#sugTopo', f).insertAdjacentHTML('beforeend', `<div class="campo inteiro sug-img"><span>Imagem de divulgação encontrada na página</span>
          <div class="sug-linha"><img src="${esc(j.imagem)}" alt="" onerror="this.closest('.sug-img').querySelector('small').textContent='Essa imagem não abriu.'"><div><small>É a arte do organizador e tem direitos autorais. Use só se o organizador permitir (muitos liberam para divulgação) e sempre com o crédito.</small>
          <button type="button" class="btn btn-linha" data-usar-img>Usar esta imagem com crédito</button></div></div></div>`);
        $('[data-usar-img]', f).addEventListener('click', () => {
          f.imagem_url.value = j.imagem; f.imagem_url.dispatchEvent(new Event('change'));
          if (!f.imagem_credito.value.trim()) f.imagem_credito.value = `Imagem: divulgação${f.organizador.value.trim() ? ' / ' + f.organizador.value.trim() : ''}`;
          $('.sug-img', f)?.remove();
        });
        achou.push('imagem');
      }
      msg.textContent = achou.length ? `Encontrado: ${achou.join(', ')}.` : 'Não encontrei imagem nem local nessa página.';
    } catch (e) { msg.textContent = e.message; }
  });
  mapaForm.on('click', (e) => { nomeLink = ''; aplicarPonto(e.latlng.lat, e.latlng.lng, false); });
  let gpxNovo = null, gpxLinha = c.percurso ? L.polyline(c.percurso.map((p) => [p[0], p[1]]), { color: '#FF4D00', weight: 3 }).addTo(mapaForm) : null;
  if (gpxLinha) mapaForm.fitBounds(gpxLinha.getBounds().pad(0.1));
  $('#gpxArquivo').addEventListener('change', async (e) => {
    const arq = e.target.files[0]; if (!arq) return;
    try {
      const pts = lerGpx(await arq.text());
      gpxNovo = prepararPercurso(pts);
      $('#gpxInfo').textContent = `Percurso lido: ${String(gpxNovo.percurso_km).replace('.', ',')} km` + (gpxNovo.subida_m != null ? `, +${gpxNovo.subida_m} m de subida e −${gpxNovo.descida_m} m de descida.` : '. O arquivo não tem altitude, então a altimetria e o simulador vão considerar o trajeto plano.') + ' Ele é salvo junto com a corrida.';
      if (!f.lat.value) { f.lat.value = pts[0][0].toFixed(6); f.lng.value = pts[0][1].toFixed(6); marcar(L.latLng(pts[0][0], pts[0][1])); }
      if (gpxLinha) gpxLinha.remove();
      gpxLinha = L.polyline(gpxNovo.percurso.map((p) => [p[0], p[1]]), { color: '#FF4D00', weight: 3 }).addTo(mapaForm);
      mapaForm.fitBounds(gpxLinha.getBounds().pad(0.1));
    } catch (err) { gpxNovo = null; $('#gpxInfo').textContent = `${err.message} Confira se é um arquivo .gpx exportado de um app de corrida.`; }
  });

  // descrição automática: continua marcada enquanto ninguém editar o texto
  const descInicial = valorEditor(f, 'descricao');
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('#fMsg');
    const dados = {
      nome: f.nome.value.trim(), cidade: f.cidade.value.trim(), estado: (f.estado.value || 'SP').toUpperCase(),
      data: f.data.value, horario: f.horario.value || null, local_largada: f.local_largada.value.trim() || null,
      lat: f.lat.value ? Number(f.lat.value) : null, lng: f.lng.value ? Number(f.lng.value) : null,
      descricao: valorEditor(f, 'descricao'), descricao_auto: !!c.descricao_auto && valorEditor(f, 'descricao') === descInicial, organizador: f.organizador.value.trim() || null,
      link_inscricao: f.link_inscricao.value.trim() || null, imagem_url: f.imagem_url.value.trim() || null, imagem_credito: f.imagem_credito.value.trim() || null,
      kit_inclui: f.kit.value.split(',').map((s) => s.trim()).filter(Boolean),
      inscricoes_abertas: f.inscricoes_abertas.checked, status: f.status.value
    };
    if (gpxNovo) Object.assign(dados, gpxNovo);
    else if (f.remover_percurso && f.remover_percurso.checked) Object.assign(dados, { percurso: null, percurso_km: null, subida_m: null, descida_m: null });
    if (!c.id) dados.slug = slugify(`${dados.nome}-${dados.data}`);
    msg.textContent = 'Salvando…';
    const r = c.id ? await sb.from('corridas').update(dados).eq('id', c.id).select().single() : await sb.from('corridas').insert(dados).select().single();
    if (r.error) { msg.textContent = r.error.code === '23505' ? 'Já existe uma corrida com esse nome nessa data.' : 'Não foi possível salvar. Confira os campos e tente de novo.'; return; }
    const id = r.data.id;
    const dists = $$('.dist-form', f).map((el) => {
      const p = $('[data-gpx-rm]', el)?.checked ? null : percDist.get(el);
      const kmV = $('[name=km]', el).value, hV = $('[name=horas]', el).value;
      return { corrida_id: id, rotulo: $('[name=rotulo]', el).value.trim(), km: kmV ? Number(kmV) : null, horas: hV ? Number(hV) : null, preco: $('[name=preco]', el).value ? Number($('[name=preco]', el).value) : null,
        percurso: p ? p.percurso : null, percurso_km: p ? p.percurso_km : null, subida_m: p ? p.subida_m : null, descida_m: p ? p.descida_m : null };
    }).filter((d) => d.rotulo);
    await sb.from('corrida_distancias').delete().eq('corrida_id', id);
    if (dists.length) await sb.from('corrida_distancias').insert(dists);
    if (pendente) await sb.from('corridas_pendentes').update({ status: 'aprovada', corrida_id: id, revisado_em: new Date().toISOString() }).eq('id', pendente.id);
    toast(pendente ? 'Corrida aprovada e salva' : 'Corrida salva');
    (pendente ? adminPendentes : adminCorridas)(); atualizarPublico();
  });
}

function seloVerif(n) {
  if (n.origem !== 'robo') return '<span class="muted">Própria</span>';
  const v = n.verificacao || 'pendente';
  const cor = v === 'aprovada' ? '#2E8B57' : v === 'reprovada' ? '#C0392B' : '#B8860B';
  const txt = v === 'aprovada' ? 'Aprovada' : v === 'reprovada' ? 'Reprovada' : 'Aguardando';
  return `<b style="color:${cor}">${txt}</b>${n.verificacao_nota ? `<br><small class="muted">${esc(n.verificacao_nota)}</small>` : ''}`;
}
async function adminNoticias() {
  const box = $('#conteudoAdmin');
  const { data: ns = [] } = await sb.from('noticias').select('*').order('criado_em', { ascending: false });
  box.innerHTML = `${mod('noticias') ? '' : '<div class="aviso ok" style="margin-bottom:16px">O módulo Notícias está desligado. Você pode cadastrar e publicar à vontade; elas só aparecem no site quando o módulo for ligado na aba Módulos.</div>'}
  <div class="barra-admin"><span class="muted">${(ns || []).length} notícia(s)</span><button class="btn btn-cone" id="novaNoticia">Nova notícia</button></div>
  <div class="tabela-wrap"><table class="tab"><thead><tr><th>Título</th><th>Editoria</th><th>Status</th><th>Direitos</th><th><span class="muted" style="font-weight:400">Ações</span></th></tr></thead><tbody>
  ${(ns || []).map((n) => `<tr><td><b>${esc(n.titulo)}</b>${n.destaque ? ' <span class="status">Manchete</span>' : ''}</td><td>${esc(NOMES_ED[n.editoria])}</td><td><span class="status ${n.status}">${n.status}</span></td><td>${seloVerif(n)}</td><td class="acoes"><a class="btn btn-linha" href="#noticia/${esc(n.slug)}" target="_blank" rel="noopener">Ver</a> <button class="btn btn-linha" data-editar="${n.id}">Editar</button> <button class="btn btn-perigo" data-excluir="${n.id}">Excluir</button></td></tr>`).join('') || '<tr><td colspan="5" class="muted">Nenhuma notícia ainda.</td></tr>'}
  </tbody></table></div>`;
  $('#novaNoticia').addEventListener('click', () => formNoticia());
  $$('[data-editar]', box).forEach((b) => b.addEventListener('click', () => formNoticia(ns.find((n) => n.id === b.dataset.editar))));
  $$('[data-excluir]', box).forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Excluir esta notícia? Isso não pode ser desfeito.')) return;
    await sb.from('noticias').delete().eq('id', b.dataset.excluir); toast('Notícia excluída'); adminNoticias(); atualizarPublico();
  }));
}
function formNoticia(n = {}) {
  const box = $('#conteudoAdmin');
  box.innerHTML = `<form class="form" id="fNoticia">
    <h2 class="display inteiro" style="font-size:40px">${n.id ? 'Editar notícia' : 'Nova notícia'}</h2>
    <label class="campo inteiro">Título<input name="titulo" required value="${esc(n.titulo || '')}"></label>
    <label class="campo inteiro">Resumo <small>Aparece embaixo da manchete</small><input name="resumo" value="${esc(n.resumo || '')}"></label>
    <div class="campo inteiro">Texto${editorRico('conteudo', n.conteudo, 240)}</div>
    <label class="campo">Editoria<select name="editoria">${Object.entries(NOMES_ED).map(([k, v]) => `<option value="${k}" ${n.editoria === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
    ${campoFoto(n.imagem_url)}
    <label class="campo">Crédito da foto <small>Aparece pequeno embaixo da foto</small><input name="imagem_credito" value="${esc(n.imagem_credito || '')}" placeholder="Ex.: Foto: Maria Souza / Prefeitura"></label>
    <label class="campo">Autor<input name="autor" value="${esc(n.autor || '')}"></label>
    <label class="campo">Fonte (nome)<input name="fonte_nome" value="${esc(n.fonte_nome || '')}" placeholder="Ex.: World Athletics"></label>
    <label class="campo">Fonte (link)<input name="fonte_url" type="url" value="${esc(n.fonte_url || '')}" placeholder="https://"></label>
    ${n.origem === 'robo' ? `<div class="aviso ${n.verificacao === 'aprovada' ? 'ok' : 'erro'} inteiro">Escrita pela busca automática. Verificação de direitos: ${seloVerif(n)}${n.fontes_extras ? `<br><small>Outras fontes: ${esc(n.fontes_extras)}</small>` : ''}</div>` : ''}
    <label class="campo">Status<select name="status">${['rascunho', 'publicado', 'arquivado'].map((s) => `<option value="${s}" ${(n.status || 'rascunho') === s ? 'selected' : ''}>${s[0].toUpperCase() + s.slice(1)}</option>`).join('')}</select></label>
    <label class="check inteiro"><input type="checkbox" name="destaque" ${n.destaque ? 'checked' : ''}> Usar como manchete principal da home</label>
    <div class="acoes-form"><span id="nMsg" role="status"></span><button type="button" class="btn btn-linha" id="cancelarN">Cancelar</button><button class="btn btn-escuro" type="submit">Salvar notícia</button></div>
  </form>`;
  const f = $('#fNoticia');
  ligarEditores(f);
  ligarFoto(f, 'noticias');
  $('#cancelarN').addEventListener('click', adminNoticias);
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const dados = { titulo: f.titulo.value.trim(), resumo: f.resumo.value.trim() || null, conteudo: valorEditor(f, 'conteudo'), editoria: f.editoria.value, imagem_url: f.imagem_url.value.trim() || null, imagem_credito: f.imagem_credito.value.trim() || null, autor: f.autor.value.trim() || null, fonte_nome: f.fonte_nome.value.trim() || null, fonte_url: f.fonte_url.value.trim() || null, status: f.status.value, destaque: f.destaque.checked };
    if (dados.status === 'publicado' && n.origem === 'robo' && n.verificacao !== 'aprovada' && !confirm('Esta notícia ainda não foi aprovada na verificação de direitos. Publicar mesmo assim?')) return;
    if (dados.status === 'publicado' && !n.publicado_em) dados.publicado_em = new Date().toISOString();
    if (!n.id) dados.slug = slugify(dados.titulo) + '-' + Date.now().toString(36);
    if (dados.destaque) await sb.from('noticias').update({ destaque: false }).neq('id', n.id || '00000000-0000-0000-0000-000000000000');
    const r = n.id ? await sb.from('noticias').update(dados).eq('id', n.id) : await sb.from('noticias').insert(dados);
    if (r.error) { $('#nMsg').textContent = 'Não foi possível salvar. Tente de novo.'; return; }
    toast('Notícia salva'); adminNoticias(); atualizarPublico();
  });
}

/* ---------- Padrões de busca por site (onde ficam a imagem e o local em cada site de inscrição) ---------- */
const dominioDe = (u) => { try { return new URL(u).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; } };
async function adminPadroes() {
  const box = $('#conteudoAdmin');
  box.innerHTML = '<p class="muted">Carregando…</p>';
  const pr = await sb.from('padroes_busca').select('*').order('dominio');
  if (pr.error) { box.innerHTML = '<div class="aviso erro">A tabela de padrões ainda não existe no banco. Rode o script <b>sql/19-padroes-busca.sql</b> no Supabase.</div>'; return; }
  const padroes = pr.data || [];
  let pend = [];
  for (let de = 0; ; de += 1000) {
    const r = await sb.from('corridas_pendentes').select('link_inscricao, imagem_sugerida, lat, enriquecido_em, data').eq('status', 'pendente').not('link_inscricao', 'is', null).range(de, de + 999);
    if (r.error || !r.data) break;
    pend = pend.concat(r.data);
    if (r.data.length < 1000) break;
  }
  const sites = {};
  for (const p of pend) {
    const d = dominioDe(p.link_inscricao); if (!d) continue;
    const s = sites[d] || (sites[d] = { d, n: 0, lidas: 0, img: 0, pino: 0, exemplo: null });
    s.n++; if (p.enriquecido_em) s.lidas++; if (p.imagem_sugerida) s.img++; if (p.lat != null) s.pino++;
    if (!s.exemplo || (p.enriquecido_em && !p.imagem_sugerida)) s.exemplo = p.link_inscricao;
  }
  for (const p of padroes) if (!sites[p.dominio]) sites[p.dominio] = { d: p.dominio, n: 0, lidas: 0, img: 0, pino: 0, exemplo: null };
  const lista = Object.values(sites).sort((a, b) => b.n - a.n);
  const temPadrao = (d) => padroes.find((p) => p.dominio === d);
  const pct = (a, b) => b ? Math.round(100 * a / b) + '%' : '—';
  box.innerHTML = `<div class="barra-admin"><span class="muted">Cada site de inscrição mostra a imagem e o local de um jeito. Ensine o padrão de um site e o robô passa a usar em todas as provas dele.</span>
    <button class="btn btn-cone" id="novoPadrao">Novo padrão</button></div>
  <div class="tabela-wrap"><table class="tab"><thead><tr><th>Site</th><th>Pendentes</th><th>Com imagem</th><th>Com local</th><th>Padrão</th><th><span class="muted" style="font-weight:400">Ações</span></th></tr></thead><tbody>
  ${lista.map((s) => `<tr><td><b>${esc(s.d)}</b></td><td>${s.n}</td><td>${s.lidas ? `${s.img} <small class="muted">(${pct(s.img, s.lidas)} das lidas)</small>` : '—'}</td><td>${s.lidas ? `${s.pino} <small class="muted">(${pct(s.pino, s.lidas)})</small>` : '—'}</td>
    <td>${temPadrao(s.d) ? '<span class="status publicado">configurado</span>' : '<span class="muted">genérico</span>'}</td>
    <td class="acoes">${temPadrao(s.d) ? `<button class="btn btn-cone" data-reproc="${esc(s.d)}">Reprocessar agora</button> ` : ''}<button class="btn btn-linha" data-padrao="${esc(s.d)}" data-exemplo="${esc(s.exemplo || '')}">${temPadrao(s.d) ? 'Editar padrão' : 'Ensinar padrão'}</button></td></tr>`).join('') || '<tr><td colspan="6" class="muted">Nenhum site na fila.</td></tr>'}
  </tbody></table></div>`;
  $('#novoPadrao').addEventListener('click', () => formPadrao({}, ''));
  $$('[data-reproc]', box).forEach((b) => b.addEventListener('click', () => reprocessarAgora(b.dataset.reproc, b)));
  $$('[data-padrao]', box).forEach((b) => b.addEventListener('click', () => formPadrao(temPadrao(b.dataset.padrao) || { dominio: b.dataset.padrao }, b.dataset.exemplo)));
}

// Roda o robô na hora só para um site (em rodadas de ~40 s até acabar a fila do site)
async function reprocessarAgora(dominio, botao) {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return toast('Entre de novo no admin.');
  await sb.rpc('admin_reprocessar_site', { p_site: dominio });
  const rotulo = botao ? botao.textContent : '';
  const tot = { processadas: 0, com_imagem: 0, com_local: 0, publicadas: 0, falhas: 0 };
  if (botao) botao.disabled = true;
  try {
    for (let rodada = 1; rodada <= 8; rodada++) {
      if (botao) botao.textContent = `Rodada ${rodada}… (${tot.processadas} lidas)`;
      const r = await fetch(`/api/enriquecer?site=${encodeURIComponent(dominio)}`, { headers: { authorization: `Bearer ${session.access_token}` } });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.erro || `erro ${r.status}`);
      for (const k in tot) tot[k] += j[k] || 0;
      if (!j.na_fila || !j.processadas) break;
    }
    toast(`${dominio}: ${tot.processadas} lida(s), ${tot.com_imagem} com imagem, ${tot.com_local} com local${tot.publicadas ? `, ${tot.publicadas} publicada(s)` : ''}${tot.falhas ? `, ${tot.falhas} falha(s)` : ''}.`);
  } catch (e) { toast('Não foi possível reprocessar: ' + e.message); }
  if (botao) { botao.disabled = false; botao.textContent = rotulo; }
  if (abaAdmin === 'padroes' && $('#novoPadrao')) adminPadroes();
}

function formPadrao(p, exemplo) {
  const box = $('#conteudoAdmin');
  box.innerHTML = `<form class="form" id="fPadrao">
    <div class="inteiro form-topo"><h2 class="display" style="font-size:40px;margin:0">${p.dominio ? 'Padrão de ' + esc(p.dominio) : 'Novo padrão'}</h2></div>
    <div class="inteiro aviso"><b>Como ensinar:</b> 1) abra o link de exemplo no navegador; 2) clique com o botão direito na foto da corrida e escolha <i>Copiar endereço da imagem</i>; 3) copie o texto do local da largada como aparece na página; 4) cole abaixo e clique em <b>Descobrir padrão</b>; 5) teste com outro link do mesmo site antes de salvar.</div>
    <label class="campo inteiro">Link de uma corrida deste site<input name="url" type="url" value="${esc(exemplo || '')}" placeholder="https://" required>
      <small>${exemplo ? `<a href="${esc(exemplo)}" target="_blank" rel="noopener">Abrir o link em outra aba</a>` : 'Cole o link de inscrição de uma corrida.'}</small></label>
    <label class="campo">Imagem (exemplo)<input name="ex_img" placeholder="endereço da imagem ou o elemento <img …>"><small>Melhor: botão direito na foto → Inspecionar → no código, botão direito → Copiar → Copiar elemento. Ou: Copiar endereço da imagem.</small></label>
    <label class="campo">Local da largada (exemplo)<input name="ex_local" placeholder="texto do local ou o elemento <span …>"><small>Copie o texto como aparece na página, ou o elemento (Inspecionar → Copiar elemento)</small></label>
    <label class="campo inteiro">Descrição da corrida (exemplo)<textarea name="ex_desc" rows="2" placeholder="um trecho do texto de apresentação da corrida, ou o elemento <div …>"></textarea><small>Copie uma frase do texto "sobre o evento" como aparece na página. O robô acha o bloco inteiro que contém essa frase.</small></label>
    <div class="inteiro" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center"><button type="button" class="btn btn-escuro" id="descobrir">Descobrir padrão</button><small id="msgPadrao" role="status"></small></div>
    <details class="inteiro" id="avancado"${p.img_antes || p.local_antes || p.desc_antes ? ' open' : ''}><summary style="cursor:pointer;font-weight:600">Marcadores (avançado)</summary>
      <p class="muted" style="margin:8px 0"><small>O robô pega o que estiver no código da página <b>entre</b> o texto "antes" e o texto "depois". Ou, se "antes" começar com <b>seletor:</b> (ex.: <code>seletor:img.ev-hero-img</code>), pega a imagem ou o texto do elemento com essa classe, e o "depois" não é usado.</small></p>
      <div class="form" style="padding:0;background:none">
        <label class="campo">Site (domínio)<input name="dominio" value="${esc(p.dominio || '')}" placeholder="exemplo.com.br" required></label>
        <label class="campo">Observação<input name="observacao" value="${esc(p.observacao || '')}"></label>
        <label class="campo">Imagem — antes<input name="img_antes" value="${esc(p.img_antes || '')}"></label>
        <label class="campo">Imagem — depois<input name="img_depois" value="${esc(p.img_depois || '')}" placeholder='"'></label>
        <label class="campo">Local — antes<input name="local_antes" value="${esc(p.local_antes || '')}"></label>
        <label class="campo">Local — depois<input name="local_depois" value="${esc(p.local_depois || '')}" placeholder="</span>"></label>
        <label class="campo">Descrição — antes<input name="desc_antes" value="${esc(p.desc_antes || '')}" placeholder="seletor:div.ev-sobre"></label>
        <label class="campo">Descrição — depois<input name="desc_depois" value="${esc(p.desc_depois || '')}" placeholder="</section>"></label>
      </div></details>
    <div class="inteiro" style="display:flex;gap:10px;flex-wrap:wrap"><button type="button" class="btn btn-linha" id="testarPadrao">Testar neste link</button></div>
    <div class="inteiro" id="resultadoPadrao"></div>
    <div class="inteiro" style="display:flex;gap:10px;flex-wrap:wrap;justify-content:space-between">
      <span style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn btn-escuro" type="submit">Salvar padrão</button><button class="btn btn-cone" type="button" id="salvarReproc">Salvar e reprocessar as pendentes do site</button></span>
      <span style="display:flex;gap:10px">${p.dominio && p.atualizado_em ? '<button class="btn btn-perigo" type="button" id="excluirPadrao">Excluir padrão</button>' : ''}<button class="btn btn-linha" type="button" id="voltarPadroes">Voltar</button></span></div>
  </form>`;
  const f = $('#fPadrao'), msg = $('#msgPadrao');
  f.url.addEventListener('change', () => { if (!f.dominio.value.trim()) f.dominio.value = dominioDe(f.url.value); });
  if (!f.dominio.value && exemplo) f.dominio.value = dominioDe(exemplo);
  $('#voltarPadroes').addEventListener('click', adminPadroes);
  $('#descobrir').addEventListener('click', async () => {
    const url = f.url.value.trim();
    if (!/^https?:\/\//i.test(url)) return (msg.textContent = 'Cole primeiro o link de uma corrida do site.');
    if (!f.ex_img.value.trim() && !f.ex_local.value.trim() && !f.ex_desc.value.trim()) return (msg.textContent = 'Cole o endereço da imagem, o texto do local e/ou um trecho da descrição.');
    msg.textContent = 'Lendo a página…';
    try {
      const r = await fetchAdmin(`/api/extrair?aprender=1&url=${encodeURIComponent(url)}&img=${encodeURIComponent(f.ex_img.value.trim())}&local=${encodeURIComponent(f.ex_local.value.trim())}&desc=${encodeURIComponent(f.ex_desc.value.trim())}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro || 'Não consegui ler a página.');
      const avisos = [];
      if (f.ex_img.value.trim()) {
        if (j.img && j.img.achou) { f.img_antes.value = j.img.antes; f.img_depois.value = j.img.depois; avisos.push('imagem: padrão encontrado'); }
        else avisos.push('imagem: não aparece no código da página (o site deve montar a página com JavaScript, aí o padrão não funciona)');
      }
      if (f.ex_local.value.trim()) {
        if (j.local && j.local.achou) { f.local_antes.value = j.local.antes; f.local_depois.value = j.local.depois; avisos.push('local: padrão encontrado'); }
        else avisos.push('local: não aparece no código da página (confira se copiou igual, ou o site monta com JavaScript)');
      }
      if (f.ex_desc.value.trim()) {
        if (j.desc && j.desc.achou) { f.desc_antes.value = j.desc.antes; f.desc_depois.value = j.desc.depois; avisos.push('descrição: padrão encontrado'); }
        else avisos.push('descrição: não achei um bloco com esse trecho (cole um trecho menor, ou o elemento <div …> inteiro; pode ser página montada por JavaScript)');
      }
      if (!f.dominio.value.trim()) f.dominio.value = dominioDe(url);
      $('#avancado').open = true;
      msg.textContent = avisos.join(' · ') + '. Agora teste.';
    } catch (e) { msg.textContent = e.message; }
  });
  const marcadores = () => ({ img_antes: f.img_antes.value, img_depois: f.img_depois.value, local_antes: f.local_antes.value, local_depois: f.local_depois.value, desc_antes: f.desc_antes.value, desc_depois: f.desc_depois.value });
  $('#testarPadrao').addEventListener('click', async () => {
    const url = f.url.value.trim(), out = $('#resultadoPadrao');
    if (!/^https?:\/\//i.test(url)) return (out.innerHTML = '<small>Cole um link para testar.</small>');
    out.innerHTML = '<small>Testando…</small>';
    try {
      const qs = new URLSearchParams({ url, teste: '1', ...marcadores() });
      const r = await fetchAdmin(`/api/extrair?${qs}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro || 'Não consegui ler a página.');
      out.innerHTML = `<div class="admin-busca" style="border:0;padding:0">
        <div class="admin-busca-item">${j.imagem ? `<img src="${esc(j.imagem)}" alt="" onerror="this.replaceWith('(a imagem não abriu)')">` : ''}<span><b>Imagem</b><br><small>${j.imagem ? esc(j.imagem) : 'não encontrada'}</small></span></div>
        <div class="admin-busca-item"><span><b>Local</b><br><small>${j.local ? esc(j.local) : 'não encontrado'}${j.lat != null ? ` · pino ${j.aproximado ? 'aproximado' : 'exato'} (${j.lat.toFixed(5)}, ${j.lng.toFixed(5)})` : ' · sem pino'}</small></span></div>
        <div class="admin-busca-item"><span><b>Descrição</b><br><small>${j.descricao_padrao ? esc(j.descricao_padrao.slice(0, 400)) + (j.descricao_padrao.length > 400 ? '…' : '') + ` (${j.descricao_padrao.length} caracteres)` : 'não encontrada pelo padrão' + (j.texto ? ' · a busca genérica achou ' + j.texto.length + ' caracteres' : '')}</small></span></div>
        <small class="muted">Dica: troque o link acima por outra corrida do mesmo site e teste de novo, para ter certeza de que o padrão serve para todas.</small></div>`;
    } catch (e) { out.innerHTML = `<small>${esc(e.message)}</small>`; }
  });
  const salvar = async () => {
    const dominio = f.dominio.value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
    if (!dominio || !dominio.includes('.')) { toast('Informe o site (domínio)'); return null; }
    const m = marcadores();
    for (const k in m) m[k] = m[k] ? m[k] : null;
    const dados = { dominio, ...m, observacao: f.observacao.value.trim() || null, atualizado_em: new Date().toISOString() };
    if (p.dominio && p.atualizado_em && p.dominio !== dominio) await sb.from('padroes_busca').delete().eq('dominio', p.dominio);
    const { error } = await sb.from('padroes_busca').upsert(dados);
    if (error) { toast('Não foi possível salvar o padrão.'); return null; }
    return dominio;
  };
  f.addEventListener('submit', async (e) => { e.preventDefault(); if (await salvar()) { toast('Padrão salvo'); adminPadroes(); } });
  $('#salvarReproc').addEventListener('click', async () => {
    const d = await salvar(); if (!d) return;
    toast('Padrão salvo. Reprocessando as pendentes do site…');
    await adminPadroes();
    reprocessarAgora(d, $(`[data-reproc="${CSS.escape(d)}"]`));
  });
  $('#excluirPadrao')?.addEventListener('click', async () => {
    if (!confirm(`Excluir o padrão de ${p.dominio}? O robô volta a usar a busca genérica para esse site.`)) return;
    await sb.from('padroes_busca').delete().eq('dominio', p.dominio); toast('Padrão excluído'); adminPadroes();
  });
}

function adminModulos() {
  const box = $('#conteudoAdmin');
  box.innerHTML = `<p class="muted" style="margin:0 0 16px">Ligue um módulo quando ele estiver pronto. A mudança aparece para os visitantes na hora.</p>
  <div>${estado.listaModulos.map((m) => `<div class="modulo"><div class="info"><b>${esc(m.nome)}</b><span class="muted">${esc(m.descricao || '')}</span></div>
    <label class="chave"><input type="checkbox" data-chave="${m.chave}" ${m.ativo ? 'checked' : ''} aria-label="${esc(m.nome)}"><span></span></label></div>`).join('')}</div>`;
  $$('[data-chave]', box).forEach((i) => i.addEventListener('change', async () => {
    const { error } = await sb.from('modulos').update({ ativo: i.checked }).eq('chave', i.dataset.chave);
    if (error) { i.checked = !i.checked; toast('Não foi possível alterar o módulo'); return; }
    const m = estado.listaModulos.find((x) => x.chave === i.dataset.chave); m.ativo = i.checked;
    estado.modulos[m.chave] = i.checked;
    toast(`${m.nome} ${i.checked ? 'ligado' : 'desligado'}`);
    aplicarModulos(); montarHome(); $('#vHome').hidden = true;
  }));
}

async function adminInscritos() {
  const box = $('#conteudoAdmin');
  box.innerHTML = '<p class="muted">Carregando…</p>';
  const { data } = await sb.from('inscritos_avisos').select('*').order('criado_em', { ascending: false });
  const lista = data || [];
  const conf = lista.filter((i) => i.confirmado && i.ativo).length, saiu = lista.filter((i) => !i.ativo).length;
  box.innerHTML = `<div class="barra-admin" style="flex-wrap:wrap;gap:8px"><span class="muted">${lista.length} inscrição(ões) · <b>${conf} confirmada(s) e ativa(s)</b> · ${lista.length - conf - saiu} aguardando confirmação · ${saiu} saíram</span>
    <span style="display:flex;gap:8px;margin-left:auto">${conf ? '<button class="btn btn-linha" id="copiar">Copiar e-mails confirmados</button>' : ''}<button class="btn btn-escuro" id="enviarResumo">Enviar resumo agora</button></span></div>
  <p class="muted"><small>O resumo sai sozinho todo dia às 9h para quem está há 7 dias sem receber e tem corrida nova no raio escolhido. O envio usa o serviço Resend; sem ele configurado na Vercel, nada é enviado (só simula).</small></p>
  <div class="tabela-wrap"><table class="tab"><thead><tr><th>E-mail</th><th>Cidade e raio</th><th>Distâncias</th><th>Situação</th><th>Último resumo</th><th>Desde</th></tr></thead><tbody>
  ${lista.map((i) => `<tr><td>${esc(i.email)}</td><td>${esc(i.cidade || '—')}${i.raio_km ? ` <small class="muted">até ${i.raio_km} km</small>` : ''}</td><td>${esc((i.distancias || []).join(', ') || 'todas')}</td>
    <td><span class="status ${!i.ativo ? '' : i.confirmado ? 'publicado' : 'rascunho'}">${!i.ativo ? 'saiu' : i.confirmado ? 'confirmado' : 'aguardando'}</span></td>
    <td>${i.ultimo_envio ? new Date(i.ultimo_envio).toLocaleDateString('pt-BR') : '—'}</td><td>${new Date(i.criado_em).toLocaleDateString('pt-BR')}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">Ninguém se inscreveu ainda.</td></tr>'}
  </tbody></table></div>`;
  $('#copiar')?.addEventListener('click', () => { navigator.clipboard.writeText(lista.filter((i) => i.confirmado && i.ativo).map((i) => i.email).join(', ')); toast('E-mails copiados'); });
  $('#enviarResumo').addEventListener('click', async (e) => {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return toast('Entre de novo no admin.');
    e.target.disabled = true; e.target.textContent = 'Enviando…';
    try {
      const r = await fetch('/api/avisos?acao=enviar', { headers: { authorization: `Bearer ${session.access_token}` } });
      const k = await r.json();
      if (!r.ok) throw new Error(k.erro || r.status);
      toast(k.servico_configurado ? `${k.enviados} resumo(s) enviado(s), ${k.sem_novidade} sem corrida nova${k.falhas ? `, ${k.falhas} falha(s)` : ''}.` : `Serviço de e-mail não configurado: ${k.simulados} resumo(s) seriam enviados.`);
    } catch (err) { toast('Não foi possível enviar: ' + err.message); }
    adminInscritos();
  });
}

// a manchete (destaque) vem primeiro para não ficar de fora do limite quando há 20 notícias mais novas
function buscarNoticias() {
  return sb.from('noticias').select('*').eq('status', 'publicado').order('destaque', { ascending: false }).order('publicado_em', { ascending: false }).limit(20);
}
function guardarNoticias(todas) {
  estado.dicas = todas.filter((x) => x.editoria === 'dica');
  estado.noticias = todas.filter((x) => x.editoria !== 'dica');
}

async function atualizarPublico() {
  const { data } = await sb.from('corridas').select('*, corrida_distancias(*)').gte('data', hojeISO()).order('data');
  if (data) estado.corridas = data;
  const n = await buscarNoticias();
  if (!n.error) guardarNoticias(n.data);
  montarHome(); $('#vHome').hidden = rotaAtual() === '#admin' || rotaAtual().startsWith('#corrida/');
}

// se quem abriu o site é admin, libera os atalhos de editar/excluir nas páginas das corridas
if (sb) sb.auth.getSession().then(async ({ data }) => {
  if (!data.session) return;
  $('#btnEntrar').textContent = 'Admin';
  const { data: ehAdmin } = await sb.rpc('is_admin');
  if (!ehAdmin) return;
  estado.admin = true;
  const h = rotaAtual();
  if (h.startsWith('#corrida/') && !$('#vCorrida .admin-corrida')) mostrarCorrida(h.slice(9));
}).catch(() => {});
carregar();
