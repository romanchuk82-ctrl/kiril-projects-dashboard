import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import aggregateHandler from './api/aggregate.js';
import statusHandler from './api/status.js';
import telegramHandler from './api/telegram.js';

const __dirname = process.cwd();
const publicDir = path.join(__dirname, 'public');
const port = Number(process.env.PORT || 10000);
const RATE_WINDOW_MS = 60_000;
const rateBuckets = new Map();

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

function setSecurityHeaders(res) {
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; manifest-src 'self'; media-src 'none'; worker-src 'none'; upgrade-insecure-requests");
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
}

function clientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return (forwarded || req.socket.remoteAddress || 'unknown').slice(0, 128);
}

function rateLimit(req, res, pathname) {
  const now = Date.now();
  const limit = pathname === '/api/telegram' ? 240 : pathname === '/api/aggregate' ? 120 : pathname === '/api/status' ? 60 : 600;
  const key = `${clientIp(req)}|${pathname}`;
  let bucket = rateBuckets.get(key);
  if (!bucket || now - bucket.startedAt >= RATE_WINDOW_MS) bucket = { startedAt: now, count: 0 };
  bucket.count += 1;
  rateBuckets.set(key, bucket);
  res.setHeader('RateLimit-Limit', String(limit));
  res.setHeader('RateLimit-Remaining', String(Math.max(0, limit - bucket.count)));
  if (bucket.count <= limit) return true;
  const retry = Math.max(1, Math.ceil((RATE_WINDOW_MS - (now - bucket.startedAt)) / 1000));
  res.setHeader('Retry-After', String(retry));
  res.statusCode = 429;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify({ ok: false, error: 'rate_limited' }));
  return false;
}

setInterval(() => {
  const cutoff = Date.now() - RATE_WINDOW_MS * 2;
  for (const [key, value] of rateBuckets) if (value.startedAt < cutoff) rateBuckets.delete(key);
}, RATE_WINDOW_MS).unref();

function makeRes(nodeRes) {
  const apiRes = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    setHeader(name, value) { nodeRes.setHeader(name, value); return this; },
    json(payload) {
      nodeRes.statusCode = this.statusCode;
      nodeRes.setHeader('Content-Type', 'application/json; charset=utf-8');
      nodeRes.setHeader('Cache-Control', 'no-store');
      nodeRes.end(JSON.stringify(payload));
      return this;
    }
  };
  return apiRes;
}

async function runApi(handler, req, res, url) {
  req.query = Object.fromEntries(url.searchParams.entries());
  await handler(req, makeRes(res));
}

async function serveStatic(req, res, filePath) {
  try {
    const fullPath = path.join(publicDir, filePath);
    let data = await fs.readFile(fullPath);
    if (filePath === 'app.js') {
      try {
        const addon = await fs.readFile(path.join(publicDir, 'tgatlas-ui.js'));
        data = Buffer.concat([data, Buffer.from('\n;\n'), addon]);
      } catch {}
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', mime[path.extname(fullPath)] || 'application/octet-stream');
    res.setHeader('Cache-Control', filePath === 'index.html' || filePath === 'app.js' ? 'no-store' : 'public, max-age=300');
    if (req.method === 'HEAD') return res.end();
    res.end(data);
  } catch {
    res.statusCode = 404;
    res.setHeader('Cache-Control', 'no-store');
    res.end('Not found');
  }
}

async function startupDiag() {
  if (process.env.BORDER_STARTUP_DIAG !== '1') return;
  for (const direction of ['UA_EU','EU_UA']) {
    try {
      let payload=null,code=200;
      const req={method:'GET',query:{direction},headers:{}};
      const res={status(c){code=c;return this},json(body){payload=body;return this}};
      await aggregateHandler(req,res);
      console.log('[border-selftest]', JSON.stringify({ direction, httpStatus: code, ok: payload?.ok === true, rows: payload?.crossings?.length || 0 }));
    } catch(e) { console.log('[border-selftest]',JSON.stringify({direction,error:'selftest_failed'})); }
  }
}

const server = http.createServer({ maxHeaderSize: 8192, requestTimeout: 15_000, headersTimeout: 10_000, keepAliveTimeout: 5_000 }, async (req, res) => {
  setSecurityHeaders(res);
  try {
    if ((req.url || '').length > 2048) {
      res.statusCode = 414;
      res.setHeader('Cache-Control', 'no-store');
      return res.end('URI too long');
    }
    const url = new URL(req.url || '/', 'https://border-monitor.invalid');
    if (!rateLimit(req, res, url.pathname)) return;

    const method = req.method || 'GET';
    if (!['GET', 'HEAD'].includes(method)) {
      res.statusCode = 405;
      res.setHeader('Allow', 'GET, HEAD');
      res.setHeader('Cache-Control', 'no-store');
      return res.end('Method not allowed');
    }

    if (url.pathname === '/health') {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      if (method === 'HEAD') return res.end();
      return res.end(JSON.stringify({ ok: true, service: 'border-monitor-ua' }));
    }
    if (method === 'HEAD' && url.pathname.startsWith('/api/')) {
      res.statusCode = 405;
      res.setHeader('Allow', 'GET');
      return res.end();
    }
    if (url.pathname === '/api/telegram') return runApi(telegramHandler, req, res, url);
    if (url.pathname === '/api/aggregate') return runApi(aggregateHandler, req, res, url);
    if (url.pathname === '/api/status') return runApi(statusHandler, req, res, url);
    if (url.pathname === '/' || url.pathname === '/index.html') return serveStatic(req, res, 'index.html');
    if (url.pathname === '/app.js') return serveStatic(req, res, 'app.js');
    if (url.pathname === '/styles.css') return serveStatic(req, res, 'styles.css');
    if (url.pathname === '/manifest.webmanifest') return serveStatic(req, res, 'manifest.webmanifest');
    res.statusCode = 404;
    res.setHeader('Cache-Control', 'no-store');
    res.end('Not found');
  } catch (e) {
    const statusCode = Number(e?.statusCode) || 500;
    if (statusCode >= 500) console.error('[request-error]', String(e?.message || 'internal_error'));
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify({ ok: false, error: statusCode === 414 ? 'uri_too_long' : 'internal_error' }));
  }
});

server.listen(port, '0.0.0.0', () => { console.log(`Border Monitor UA listening on ${port}`); setTimeout(startupDiag,800); });
