import http from 'node:http';
import crypto from 'node:crypto';

// Thin production wrapper around the existing bundled server.
// It preserves the Border Monitor request handler unchanged and only exposes
// one server-to-server route for the isolated ISU Telegram bridge.
const originalCreateServer = http.createServer.bind(http);

function constantTimeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(payload));
}

function internalCredentialHandler(req, res) {
  let pathname = '';
  try {
    pathname = new URL(req.url || '/', 'https://internal.invalid').pathname;
  } catch {
    return false;
  }

  if (pathname !== '/internal/isu-telegram-credentials') return false;

  const expectedToken = String(process.env.ISU_BRIDGE_SHARED_TOKEN || '').trim();
  if (!expectedToken) {
    sendJson(res, 404, { ok: false, error: 'not_found' });
    return true;
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
    return true;
  }

  const authorization = String(req.headers?.authorization || '');
  if (!constantTimeEqual(authorization, `Bearer ${expectedToken}`)) {
    sendJson(res, 401, { ok: false, error: 'unauthorized' });
    return true;
  }

  const apiId = Number(process.env.TELEGRAM_API_ID);
  const apiHash = String(process.env.TELEGRAM_API_HASH || '').trim();
  const session = String(process.env.TELEGRAM_SESSION || '').trim();
  if (!Number.isSafeInteger(apiId) || apiId <= 0 || !apiHash || !session) {
    sendJson(res, 503, { ok: false, error: 'telegram_credentials_unavailable' });
    return true;
  }

  sendJson(res, 200, { ok: true, apiId, apiHash, session });
  return true;
}

http.createServer = function patchedCreateServer(options, requestListener) {
  let serverOptions = options;
  let listener = requestListener;
  if (typeof options === 'function') {
    listener = options;
    serverOptions = undefined;
  }
  if (typeof listener !== 'function') {
    return serverOptions === undefined
      ? originalCreateServer()
      : originalCreateServer(serverOptions);
  }

  const wrappedListener = (req, res) => {
    try {
      if (internalCredentialHandler(req, res)) return;
    } catch {
      sendJson(res, 500, { ok: false, error: 'internal_error' });
      return;
    }
    return listener(req, res);
  };

  return serverOptions === undefined
    ? originalCreateServer(wrappedListener)
    : originalCreateServer(serverOptions, wrappedListener);
};

await import('./server.bundle.cjs');
