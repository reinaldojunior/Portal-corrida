export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=3600');
  res.json({ key: process.env.GOOGLE_MAPS_KEY || '' });
}
