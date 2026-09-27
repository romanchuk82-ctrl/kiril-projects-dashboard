import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';

// Keep the proven production bundle untouched. This wrapper only exposes the
// isolated History static files; every other request is delegated unchanged.
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

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8'
};

function setHistorySecurityHeaders(res) {
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self' https://pybwmnueyxlzmjorqxvl.supabase.co; img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; upgrade-insecure-requests");
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
}

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

http.createServer = function patchedCreateServer(options, listener) {
  if (typeof options === 'function') {
    listener = options;
    options = undefined;
  }
  const wrappedListener = async (req, res) => {
    try {
      const url = new URL(req.url || '/', 'https://border-monitor.invalid');
      const fileName = historyRoutes.get(url.pathname);
      if (fileName && ['GET', 'HEAD'].includes(req.method || 'GET')) {
        return serveHistory(req, res, fileName);
      }
    } catch {}
    return listener(req, res);
  };
  return options === undefined
    ? originalCreateServer(wrappedListener)
    : originalCreateServer(options, wrappedListener);
};

await import('./server.bundle.cjs');
