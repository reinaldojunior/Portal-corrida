export default async function handler(req, res) {
  const { url } = req.query;
  if (!url || !url.startsWith('https://www.google.com/maps/d/kml')) {
    return res.status(400).json({ error: 'URL inválida' });
  }
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MapMove/1.0)' },
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return res.status(r.status).json({ error: `Google respondeu ${r.status}` });
    const text = await r.text();
    res.setHeader('Content-Type', 'application/vnd.google-earth.kml+xml; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, s-maxage=300');
    return res.status(200).send(text);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
