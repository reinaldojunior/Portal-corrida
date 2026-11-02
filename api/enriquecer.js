// Robô de enriquecimento (sem IA): para as provas pendentes com link de inscrição,
// lê a página da inscrição e guarda a imagem de divulgação (como SUGESTÃO, não publicada) e o local.
const { analisar, conferirPino } = require('./extrair.js');

const SUPABASE_URL = 'https://ssfsxdmzbubvygctdjgf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_s2yoUApfYl_ZvSUkqYYrVw_uXwKsybM';
const LIMITE = 50, PARALELO = 5, PRAZO_MS = 34000;

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

module.exports = async (req, res) => {
  const segredo = process.env.CRON_SECRET;
  const enviada = (req.headers.authorization || '').replace(/^Bearer /, '') || String(req.query.chave || '');
  if (!segredo || enviada !== segredo) return res.status(401).json({ erro: 'não autorizado' });
  const token = process.env.ROBO_TOKEN;
  const inicio = Date.now();
  try {
    // ?so=pinos pula a leitura das páginas e usa o tempo todo para conferir pinos (e pôr o centro da cidade)
    const soPinos = req.query.so === 'pinos';
    // ?site=ticketsports processa só as provas daquele site (com menos acessos ao mesmo tempo)
    const site = String(req.query.site || '').toLowerCase().replace(/[^a-z0-9.-]/g, '').slice(0, 40);
    const fila = soPinos ? [] : (await (site
      ? rpc('robo_para_enriquecer_site', { p_token: token, p_limite: LIMITE, p_site: site })
      : rpc('robo_para_enriquecer', { p_token: token, p_limite: LIMITE }))) || [];
    const paralelo = site ? 2 : PARALELO;
    const feitos = [];
    let i = 0, n = 0, falhas = 0;
    const comPrazo = (p, ms) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error('demorou')), ms))]);
    const salvar = async (lote) => { if (lote.length) n += (await rpc('robo_enriquecer', { p_token: token, p_itens: lote })) || 0; };
    const trabalhador = async () => {
      while (i < fila.length && Date.now() - inicio < PRAZO_MS) {
        const f = fila[i++];
        let item;
        try {
          const d = await comPrazo(analisar(f.link_inscricao), 12000);
          item = { chave: f.chave, imagem: d.imagem || null, lat: d.lat ?? null, lng: d.lng ?? null, local: d.local || null };
        } catch {
          // página não abriu ou demorou: conta a tentativa e tenta de novo na próxima rodada (até 3 vezes)
          try { await rpc('robo_falha_enriquecer', { p_token: token, p_chaves: [f.chave] }); } catch { /* segue */ }
          falhas += 1;
          continue;
        }
        feitos.push(item);
        await salvar([item]); // salva na hora: se a rodada cair, o que já foi feito fica gravado
      }
    };
    await Promise.all(Array.from({ length: paralelo }, trabalhador));
    // confere os pinos (os recém-achados e os antigos): longe da cidade => centro da cidade
    let conferidos = 0, corrigidos = 0;
    try {
      const lista = (await rpc('robo_pinos_para_conferir', { p_token: token, p_limite: soPinos ? 120 : 40 })) || [];
      const res = [];
      for (const p of lista) {
        if (Date.now() - inicio > 52000) break;
        const r = await conferirPino(p.lat, p.lng, p.cidade, p.estado || 'SP');
        if (r.ok === null) continue; // não achou a cidade: tenta de novo outro dia
        res.push({ tipo: p.tipo, id: p.id, lat: r.ok ? null : r.lat, lng: r.ok ? null : r.lng });
        if (r.ok === false) corrigidos += 1;
      }
      if (res.length) conferidos = await rpc('robo_corrigir_pinos', { p_token: token, p_itens: res });
    } catch { /* segue */ }
    // publica sozinho as completas (data futura, link, distâncias, imagem e pino)
    let publicadas = 0;
    try { publicadas = await rpc('robo_publicar_completas', { p_token: token }); } catch { /* segue */ }
    res.status(200).json({ na_fila: fila.length, processadas: n, falhas, publicadas, conferidos, corrigidos, com_imagem: feitos.filter((x) => x.imagem).length, com_local: feitos.filter((x) => x.lat != null).length });
  } catch (e) { res.status(500).json({ erro: e.message }); }
};
