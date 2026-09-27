let cache = null;
const TTL = 60_000;

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  if (cache && Date.now() - cache.ts < TTL) return res.status(cache.code).json(cache.body);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 5_000);
  try {
    const r = await fetch('https://nakordoni.eu/api/v1/data/status', { headers: { Accept: 'application/json' }, signal: ctl.signal, cache: 'no-store' });
    const body = { ok: r.ok, upstreamStatus: r.status };
    const code = r.ok ? 200 : 502;
    cache = { ts: Date.now(), code, body };
    return res.status(code).json(body);
  } catch {
    const body = { ok: false, error: 'status_unavailable' };
    cache = { ts: Date.now(), code: 502, body };
    return res.status(502).json(body);
  } finally {
    clearTimeout(timer);
  }
}
