// sitemap.xml para o Google: página inicial + todas as corridas publicadas
const SUPABASE_URL = 'https://ssfsxdmzbubvygctdjgf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_s2yoUApfYl_ZvSUkqYYrVw_uXwKsybM';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

module.exports = async (req, res) => {
  // endereço oficial do site (o mesmo em qualquer endereço da Vercel); troque SITE_URL ao usar domínio próprio
  const base = (process.env.SITE_URL || 'https://mapmove.com.br').replace(/\/$/, '');
  let lista = [];
  try {
    for (let de = 0; de < 20000; de += 1000) {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/corridas?select=slug,data,atualizado_em&status=eq.publicado&order=data.desc`, {
        headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${SUPABASE_KEY}`, range: `${de}-${de + 999}` }, signal: AbortSignal.timeout(8000) });
      if (!r.ok) break;
      const j = await r.json();
      lista = lista.concat(j);
      if (j.length < 1000) break;
    }
  } catch { /* entrega o que tiver */ }
  const hoje = new Date().toISOString().slice(0, 10);
  const urls = [`<url><loc>${base}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>`]
    .concat(lista.map((c) => `<url><loc>${esc(`${base}/corrida/${encodeURIComponent(c.slug)}`)}</loc>${c.atualizado_em ? `<lastmod>${String(c.atualizado_em).slice(0, 10)}</lastmod>` : ''}<priority>${c.data >= hoje ? '0.8' : '0.4'}</priority></url>`));
  res.setHeader('content-type', 'application/xml; charset=utf-8');
  res.setHeader('cache-control', 'public, s-maxage=3600');
  res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`);
};
