// Robô de enriquecimento (sem IA): para as provas pendentes com link de inscrição,
// lê a página da inscrição e guarda a imagem de divulgação (como SUGESTÃO, não publicada) e o local.
const { analisar } = require('./extrair.js');

const SUPABASE_URL = 'https://ssfsxdmzbubvygctdjgf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_s2yoUApfYl_ZvSUkqYYrVw_uXwKsybM';
const LIMITE = 24, PARALELO = 4, PRAZO_MS = 50000;

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
    let i = 0;
    const trabalhador = async () => {
      while (i < fila.length && Date.now() - inicio < PRAZO_MS) {
        const f = fila[i++];
        try {
          const d = await analisar(f.link_inscricao);
          feitos.push({ chave: f.chave, imagem: d.imagem || null, lat: d.lat ?? null, lng: d.lng ?? null, local: d.local || null });
        } catch { feitos.push({ chave: f.chave }); } // marca como tentado mesmo sem achar nada
      }
    };
    await Promise.all(Array.from({ length: PARALELO }, trabalhador));
    const n = feitos.length ? await rpc('robo_enriquecer', { p_token: token, p_itens: feitos }) : 0;
    res.status(200).json({ na_fila: fila.length, processadas: n, com_imagem: feitos.filter((x) => x.imagem).length, com_local: feitos.filter((x) => x.lat != null).length });
  } catch (e) { res.status(500).json({ erro: e.message }); }
};
