export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=3600');
  res.json({ token: process.env.MAPBOX_TOKEN || '' });
}
