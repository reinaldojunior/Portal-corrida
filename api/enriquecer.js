// Robô de enriquecimento (sem IA): para as provas pendentes com link de inscrição,
// lê a página da inscrição e guarda a imagem de divulgação (como SUGESTÃO, não publicada) e o local.
const { analisar } = require('./extrair.js');

const SUPABASE_URL = 'https://ssfsxdmzbubvygctdjgf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_s2yoUApfYl_ZvSUkqYYrVw_uXwKsybM';
const LIMITE = 30, PARALELO = 5, PRAZO_MS = 38000;

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
    const fila = (await rpc('robo_para_enriquecer', { p_token: token, p_limite: LIMITE })) || [];
    const feitos = [];
    let i = 0, n = 0;
    const comPrazo = (p, ms) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error('demorou')), ms))]);
    const salvar = async (lote) => { if (lote.length) n += (await rpc('robo_enriquecer', { p_token: token, p_itens: lote })) || 0; };
    const trabalhador = async () => {
      while (i < fila.length && Date.now() - inicio < PRAZO_MS) {
        const f = fila[i++];
        let item = { chave: f.chave };
        try {
          const d = await comPrazo(analisar(f.link_inscricao), 12000);
          item = { chave: f.chave, imagem: d.imagem || null, lat: d.lat ?? null, lng: d.lng ?? null, local: d.local || null };
        } catch { /* marca como tentado mesmo sem achar nada (ou se a página travou) */ }
        feitos.push(item);
        await salvar([item]); // salva na hora: se a rodada cair, o que já foi feito fica gravado
      }
    };
    await Promise.all(Array.from({ length: PARALELO }, trabalhador));
    // publica sozinho as completas (data futura, link, distâncias, imagem e pino)
    let publicadas = 0;
    try { publicadas = await rpc('robo_publicar_completas', { p_token: token }); } catch { /* segue */ }
    res.status(200).json({ na_fila: fila.length, processadas: n, publicadas, com_imagem: feitos.filter((x) => x.imagem).length, com_local: feitos.filter((x) => x.lat != null).length });
  } catch (e) { res.status(500).json({ erro: e.message }); }
};
