// Robô de coleta (sem IA): lê o calendário do Corridas BR por estado e grava as provas novas na fila de pendentes.
const UA = 'Mozilla/5.0 (compatible; PaceClubBot/1.0; +https://paceclub-mu.vercel.app)';

async function baixar(url) {
  const r = await fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'pt-BR' } });
  const buf = Buffer.from(await r.arrayBuffer());
  const tipo = (r.headers.get('content-type') || '').toLowerCase();
  let texto = buf.toString('utf8');
  if (/iso-8859-1|latin1|windows-1252/.test(tipo) || (!/utf-8/.test(tipo) && texto.includes('�'))) texto = new TextDecoder('windows-1252').decode(buf);
  return { ok: r.ok, status: r.status, texto, tipo };
}

module.exports = async (req, res) => {
  const uf = String(req.query.uf || 'SP').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2);
  if (req.query.debug === '2') {
    const pg = await baixar(`https://www.corridasbr.com.br/${uf}/mostracorrida.asp?escolha=${encodeURIComponent(req.query.id || '63953')}`);
    const i = Math.max(0, pg.texto.search(/Adora|Data|Local|Inscri/i) - 200);
    return res.status(200).json({ status: pg.status, trecho: pg.texto.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\s+/g, ' ').slice(i, i + 7000) });
  }
  if (req.query.debug === '1') {
    const pg = await baixar(`https://www.corridasbr.com.br/${uf}/Calendario.asp`);
    const i = Math.max(0, pg.texto.search(/Indaiatuba|Campinas|Salto/i) - 3000);
    return res.status(200).json({ status: pg.status, tipo: pg.tipo, tamanho: pg.texto.length, trecho: pg.texto.slice(i, i + 6000) });
  }
  res.status(400).json({ erro: 'em construção' });
};
