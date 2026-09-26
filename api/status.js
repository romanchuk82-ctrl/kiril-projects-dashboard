export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  try {
    const r = await fetch('https://nakordoni.eu/api/v1/data/status', { headers: { Accept: 'application/json' } });
    const body = await r.json().catch(() => null);
    return res.status(r.ok ? 200 : 502).json({ ok: r.ok, upstream: body });
  } catch (e) {
    return res.status(502).json({ ok: false, error: e instanceof Error ? e.message : 'status_failed' });
  }
}
