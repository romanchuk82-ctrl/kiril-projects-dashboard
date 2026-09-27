import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';

// Keep the proven production bundle untouched. This wrapper only exposes the
// isolated History page/API; every other request is delegated unchanged.
const originalCreateServer = http.createServer.bind(http);
const publicDir = path.join(process.cwd(), 'public');
const historyRoutes = new Map([
  ['/history', 'history.html'],
  ['/history/', 'history.html'],
  ['/history.html', 'history.html'],
  ['/history.js', 'history.js'],
  ['/history.css', 'history.css'],
  ['/section-nav.css', 'section-nav.css']
]);
const historyBuckets = new Map();
const HISTORY_WINDOW_MS = 60_000;
const HISTORY_LIMIT = 120;
const SUPABASE_URL = 'https://pybwmnueyxlzmjorqxvl.supabase.co';

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8'
};

function setHistorySecurityHeaders(res) {
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; upgrade-insecure-requests");
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
}

function historyRateAllowed(req, res) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const ip = (forwarded || req.socket.remoteAddress || 'unknown').slice(0, 128);
  const now = Date.now();
  let bucket = historyBuckets.get(ip);
  if (!bucket || now - bucket.startedAt >= HISTORY_WINDOW_MS) bucket = { startedAt: now, count: 0 };
  bucket.count += 1;
  historyBuckets.set(ip, bucket);
  if (bucket.count <= HISTORY_LIMIT) return true;
  res.statusCode = 429;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify({ ok: false, error: 'rate_limited' }));
  return false;
}

setInterval(() => {
  const cutoff = Date.now() - HISTORY_WINDOW_MS * 2;
  for (const [key, value] of historyBuckets) if (value.startedAt < cutoff) historyBuckets.delete(key);
}, HISTORY_WINDOW_MS).unref();

async function serveHistory(req, res, fileName) {
  try {
    const data = await fs.readFile(path.join(publicDir, fileName));
    setHistorySecurityHeaders(res);
    res.statusCode = 200;
    res.setHeader('Content-Type', mime[path.extname(fileName)] || 'application/octet-stream');
    res.setHeader('Cache-Control', fileName.endsWith('.css') ? 'public, max-age=300' : 'no-store');
    if ((req.method || 'GET') === 'HEAD') return res.end();
    return res.end(data);
  } catch {
    res.statusCode = 404;
    res.setHeader('Cache-Control', 'no-store');
    return res.end('Not found');
  }
}

function clampDays(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(1, Math.min(730, Math.round(n))) : 30;
}

async function serveHistoryApi(req, res, url) {
  setHistorySecurityHeaders(res);
  res.setHeader('Cache-Control', 'no-store');
  if ((req.method || 'GET') !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET');
    return res.end(JSON.stringify({ ok: false, error: 'method_not_allowed' }));
  }
  if (!historyRateAllowed(req, res)) return;

  const key = process.env.HISTORY_SUPABASE_KEY || '';
  if (!key) {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({ ok: false, error: 'history_not_configured' }));
  }

  const mode = url.pathname.slice('/history-api/'.length);
  let rpcName;
  let payload = {};
  if (mode === 'catalog') {
    rpcName = 'border_history_catalog';
  } else if (mode === 'series' || mode === 'insights') {
    const crossing = String(url.searchParams.get('crossing') || '').trim();
    if (!crossing || crossing.length > 220) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.end(JSON.stringify({ ok: false, error: 'invalid_crossing' }));
    }
    const direction = url.searchParams.get('direction') === 'EU_UA' ? 'EU_UA' : 'UA_EU';
    payload = {
      p_crossing_key: crossing,
      p_direction: direction,
      p_days: clampDays(url.searchParams.get('days'))
    };
    rpcName = mode === 'series' ? 'border_history_series' : 'border_history_insights';
  } else {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({ ok: false, error: 'not_found' }));
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const upstream = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${rpcName}`, {
      method: 'POST',
      headers: { apikey: key, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
      signal: controller.signal
    });
    const text = await upstream.text();
    res.statusCode = upstream.ok ? 200 : 502;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (!upstream.ok) return res.end(JSON.stringify({ ok: false, error: 'history_upstream_error' }));
    let data;
    try { data = JSON.parse(text); } catch { data = null; }
    return res.end(JSON.stringify({ ok: true, data }));
  } catch {
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({ ok: false, error: 'history_unavailable' }));
  } finally {
    clearTimeout(timer);
  }
}

http.createServer = function patchedCreateServer(options, listener) {
  if (typeof options === 'function') {
    listener = options;
    options = undefined;
  }
  const wrappedListener = async (req, res) => {
    try {
      const url = new URL(req.url || '/', 'https://border-monitor.invalid');
      const fileName = historyRoutes.get(url.pathname);
      if (fileName && ['GET', 'HEAD'].includes(req.method || 'GET')) return serveHistory(req, res, fileName);
      if (url.pathname.startsWith('/history-api/')) return serveHistoryApi(req, res, url);
    } catch {}
    return listener(req, res);
  };
  return options === undefined ? originalCreateServer(wrappedListener) : originalCreateServer(options, wrappedListener);
};

await import('./server.bundle.cjs');
