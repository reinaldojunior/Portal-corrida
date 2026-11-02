// Robô de coleta (sem IA, sem custo de tokens): lê o calendário do Corridas BR por estado,
// descobre quais provas são novas e grava só essas na fila de pendentes do Supabase.
// Guarda apenas dados factuais (nome, data, cidade, distâncias, local, organizador, links).

const UA = 'Mozilla/5.0 (compatible; PaceClubBot/1.0; +https://paceclub-mu.vercel.app)';
const SUPABASE_URL = 'https://ssfsxdmzbubvygctdjgf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_s2yoUApfYl_ZvSUkqYYrVw_uXwKsybM';
const MAX_DETALHES = 35; // páginas de detalhe por execução (só das provas novas)

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const limpar = (s) => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&([a-z])(acute|grave|tilde|circ|cedil);/gi, (_, l) => l).replace(/\s+/g, ' ').trim();
const slug = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);

async function baixar(url) {
  const r = await fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'pt-BR' } });
  const buf = Buffer.from(await r.arrayBuffer());
  let texto = buf.toString('utf8');
  if (texto.includes('�')) texto = new TextDecoder('windows-1252').decode(buf);
  return { ok: r.ok, status: r.status, texto };
}

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

function distancias(txt) {
  const t = limpar(txt);
  if (!t) return null;
  return t.split(/\s*(?:;|\/|,(?!\d)|(?<!\d),|\s+e\s+)\s*/i).map((x) => x.trim()).filter(Boolean).map((x) => {
    const m = x.match(/^(\d+(?:[.,]\d+)?)\s*(km|k|m)?$/i);
    if (!m) return x;
    let n = parseFloat(m[1].replace(',', '.'));
    if ((m[2] || '').toLowerCase() === 'm' && n >= 100) n = n / 1000;
    return `${String(n).replace('.', ',')}K`;
  }).join(', ');
}

// Lê o calendário do estado: linhas com data (DD.MM), cidade, nome (link mostracorrida.asp?escolha=ID) e distâncias
function lerCalendario(html, uf) {
  const hoje = new Date(Date.now() - 3 * 3600e3);
  let ano = hoje.getUTCFullYear(), mesAnt = 0;
  const itens = [];
  const re = /<tr[^>]*>\s*<td[^>]*>\s*(\d{2})\.(\d{2})\s*(?:<\/span>)?\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>\s*<a href=['"]mostracorrida\.asp\?escolha=(\d+)[^'"]*['"][^>]*>([\s\S]*?)<\/a>\s*<\/td>([\s\S]*?)<\/tr>/gi;
  let m;
  while ((m = re.exec(html))) {
    const dia = +m[1], mes = +m[2];
    if (!mesAnt && mes < hoje.getUTCMonth()) ano += 1; // lista já começa no ano seguinte
    if (mesAnt && mes < mesAnt) ano += 1; // virou o ano dentro da lista
    mesAnt = mes;
    const nome = limpar(m[5]), cidade = limpar(m[3]);
    if (!nome || !cidade) continue;
    if (/\btre(i|í)n(a|ã)o\b|\btreino\b/i.test(nome)) continue;
    const tdDist = (m[6].match(/<td[^>]*>([\s\S]*?)<\/td>/i) || [])[1];
    const data = `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
    itens.push({
      chave: `${slug(nome)}-${data}`, nome, cidade, estado: uf, data, distancias: distancias(tdDist),
      fonte: 'Corridas BR', fonte_url: `https://www.corridasbr.com.br/${uf}/mostracorrida.asp?escolha=${m[4]}`
    });
  }
  return itens;
}

// Página de detalhe: local da largada, organizador e link "Mais informações" (geralmente a inscrição)
function lerDetalhe(html) {
  const semScript = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
  const txt = limpar(semScript);
  const pega = (rot) => { const r = txt.match(new RegExp(rot + '\\s*:\\s*(.+?)\\s+(?:Dist|Organizador|Mais Informa|Compartilhar|Cidade|Data|Hor[aá]rio|Largada|Publicidade)', 'i')); return r ? r[1].trim() : null; };
  const local = pega('Largada');
  const org = pega('Organizador');
  // o "Clique Aqui" costuma ser um botão com o endereço no onclick (window.open / location), não um link comum
  // na prática o botão chama a função paraonde(), que fica num <script> da página com o endereço dentro
  const fn = (html.match(/function\s+paraonde\s*\(\s*\)\s*\{([\s\S]{0,800}?)\}/i) || [])[1] || '';
  const trecho = fn || (semScript.match(/Mais Informa[\s\S]{0,600}/i) || [''])[0];
  const mais = trecho.match(/(https?:\/\/[^'"\s)<>]+)/i) ? [null, trecho.match(/(https?:\/\/[^'"\s)<>]+)/i)[1]] : null;
  return {
    local_largada: local && local.length < 200 ? local : null,
    organizador: org && org.length < 120 ? org : null,
    link_inscricao: mais && !/corridasbr/i.test(mais[1]) ? mais[1] : null
  };
}

async function coletar(estados, gravar) {
  const token = process.env.ROBO_TOKEN;
  if (!token) throw new Error('ROBO_TOKEN não configurado');
  const relatorio = [];
  let detalhesUsados = 0;
  for (const uf of estados) {
    try {
      const pg = await baixar(`https://www.corridasbr.com.br/${uf}/Calendario.asp`);
      if (!pg.ok) { relatorio.push({ uf, erro: `calendário respondeu ${pg.status}` }); continue; }
      const itens = lerCalendario(pg.texto, uf);
      const novas = new Set(await rpc('robo_novos', { p_token: token, p_itens: itens.map(({ chave, nome, cidade, data }) => ({ chave, nome, cidade, data })) }));
      const lote = itens.filter((x) => novas.has(x.chave));
      for (const it of lote) {
        if (detalhesUsados >= MAX_DETALHES) { it.observacao = 'Detalhes não lidos nesta rodada (limite diário).'; continue; }
        try { Object.assign(it, lerDetalhe((await baixar(it.fonte_url)).texto)); } catch { it.observacao = 'Não consegui abrir a página da prova.'; }
        detalhesUsados += 1;
        await dormir(150); // educado com o site
      }
      const inseridas = gravar && lote.length ? await rpc('robo_inserir_pendentes', { p_token: token, p_itens: lote }) : 0;
      relatorio.push({ uf, no_calendario: itens.length, novas: lote.length, gravadas: inseridas, exemplo: lote.slice(0, 3) });
    } catch (e) { relatorio.push({ uf, erro: e.message }); }
  }
  return relatorio;
}

module.exports = async (req, res) => {
  // só roda pelo agendamento da Vercel (que envia a chave do cron)
  const segredo = process.env.CRON_SECRET;
  const enviada = (req.headers.authorization || '').replace(/^Bearer /, '') || String(req.query.chave || '');
  if (!segredo || enviada !== segredo) return res.status(401).json({ erro: 'não autorizado' });
  const estados = String(process.env.ESTADOS || 'SP').toUpperCase().split(/[,\s]+/).filter((x) => /^[A-Z]{2}$/.test(x));
  try {
    const relatorio = await coletar(estados, req.query.simular !== '1');
    res.status(200).json({ quando: new Date().toISOString(), relatorio });
  } catch (e) { res.status(500).json({ erro: e.message }); }
};
module.exports.lerCalendario = lerCalendario;
module.exports.lerDetalhe = lerDetalhe;
