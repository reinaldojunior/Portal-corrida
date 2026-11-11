// Autenticação compartilhada das rotas (arquivo com "_" não vira endpoint na Vercel)
const crypto = require('crypto');

const SUPABASE_URL = 'https://ssfsxdmzbubvygctdjgf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_s2yoUApfYl_ZvSUkqYYrVw_uXwKsybM';

const tokenDoPedido = (req) => (req.headers.authorization || '').replace(/^Bearer /, '');

// chave do agendamento: só pelo cabeçalho (na URL ela vazaria em logs), comparada em tempo constante
function ehAgendamento(req) {
  const segredo = process.env.CRON_SECRET, enviada = tokenDoPedido(req);
  if (!segredo || !enviada) return false;
  const a = Buffer.from(enviada), b = Buffer.from(segredo);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function ehAdmin(req) {
  const jwt = tokenDoPedido(req);
  if (jwt.split('.').length !== 3) return false;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/is_admin`, { method: 'POST', headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${jwt}`, 'content-type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(5000) });
    return r.ok && (await r.json()) === true;
  } catch { return false; }
}

module.exports = { ehAgendamento, ehAdmin };
