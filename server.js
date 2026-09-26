import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import aggregateHandler from './api/aggregate.js';
import statusHandler from './api/status.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, 'public');
const port = Number(process.env.PORT || 10000);

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

function makeRes(nodeRes) {
  const apiRes = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
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

async function serveStatic(res, filePath) {
  try {
    const fullPath = path.join(publicDir, filePath);
    const data = await fs.readFile(fullPath);
    res.statusCode = 200;
    res.setHeader('Content-Type', mime[path.extname(fullPath)] || 'application/octet-stream');
    res.setHeader('Cache-Control', filePath === 'index.html' ? 'no-cache' : 'public, max-age=300');
    res.end(data);
  } catch {
    res.statusCode = 404;
    res.end('Not found');
  }
}

async function runSafeStartupDiagnostic() {
  try {
    let payload = null;
    const fakeReq = { method: 'GET', query: { direction: 'UA_EU' } };
    const fakeRes = {
      code: 200,
      status(c) { this.code = c; return this; },
      json(body) { payload = body; return this; }
    };
    await aggregateHandler(fakeReq, fakeRes);
    const safe = {
      httpStatus: fakeRes.code,
      sourceStatus: payload?.sourceStatus || null,
      crossingCount: Array.isArray(payload?.crossings) ? payload.crossings.length : null,
      failures: Array.isArray(payload?.failures) ? payload.failures : []
    };
    console.log('[border-diagnostic]', JSON.stringify(safe));
  } catch (e) {
    console.log('[border-diagnostic]', JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
  }
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (url.pathname === '/health') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.end(JSON.stringify({ ok: true, service: 'border-monitor-ua' }));
    }
    if (url.pathname === '/api/aggregate') return runApi(aggregateHandler, req, res, url);
    if (url.pathname === '/api/status') return runApi(statusHandler, req, res, url);
    if (url.pathname === '/' || url.pathname === '/index.html') return serveStatic(res, 'index.html');
    if (url.pathname === '/app.js') return serveStatic(res, 'app.js');
    if (url.pathname === '/styles.css') return serveStatic(res, 'styles.css');
    if (url.pathname === '/manifest.webmanifest') return serveStatic(res, 'manifest.webmanifest');
    res.statusCode = 404;
    res.end('Not found');
  } catch (e) {
    console.error(e);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: false, error: 'internal_error' }));
  }
}).listen(port, '0.0.0.0', () => {
  console.log(`Border Monitor UA listening on ${port}`);
  setTimeout(runSafeStartupDiagnostic, 500);
});
