import crypto from 'node:crypto';
import QRCode from 'qrcode';
import { Logger, TelegramClient } from 'teleproto';
import { StringSession } from 'teleproto/sessions/index.js';

const FLOW_TTL_MS = 10 * 60 * 1000;

function emptyFlow() {
  return {
    stage: 'idle', client: null, controller: null, task: null,
    qrUrl: null, qrImage: null, qrExpiresAt: null,
    passwordHint: null, passwordWaiter: null,
    session: null, error: null, startedAt: 0
  };
}

let flow = emptyFlow();

function safeErrorCode(error) {
  const value = String(error?.errorMessage || error?.code || error?.name || 'telegram_auth_error').toUpperCase();
  return value.replace(/[^A-Z0-9_-]/g, '_').replace(/_+/g, '_').slice(0, 72) || 'TELEGRAM_AUTH_ERROR';
}

function constantTimeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

function authorized(req) {
  const expected = String(process.env.TELEGRAM_SETUP_TOKEN || '');
  const provided = String(req.headers?.['x-setup-token'] || '');
  return constantTimeEqual(expected, provided);
}

function configuration() {
  const apiId = Number(process.env.TELEGRAM_API_ID);
  const apiHash = String(process.env.TELEGRAM_API_HASH || '').trim();
  return {
    apiId,
    apiHash,
    credentialsConfigured: Number.isSafeInteger(apiId) && apiId > 0 && Boolean(apiHash),
    sessionConfigured: Boolean(String(process.env.TELEGRAM_SESSION || '').trim())
  };
}

function publicStatus() {
  const config = configuration();
  return {
    ok: true,
    credentialsConfigured: config.credentialsConfigured,
    sessionConfigured: config.sessionConfigured,
    stage: config.sessionConfigured ? 'already_configured' : flow.stage,
    qrUrl: flow.stage === 'waiting_for_scan' ? flow.qrUrl : null,
    qrImage: flow.stage === 'waiting_for_scan' ? flow.qrImage : null,
    qrExpiresAt: flow.stage === 'waiting_for_scan' ? flow.qrExpiresAt : null,
    passwordRequired: flow.stage === 'password_required',
    passwordHint: flow.stage === 'password_required' ? flow.passwordHint : null,
    sessionReady: flow.stage === 'done' && Boolean(flow.session),
    error: flow.error,
    startedAt: flow.startedAt || null
  };
}

async function stopFlow() {
  flow.controller?.abort();
  if (flow.passwordWaiter) flow.passwordWaiter.reject(Object.assign(new Error('QR login expired'), { code: 'AUTH_EXPIRED' }));
  try { await flow.client?.disconnect(); } catch {}
  flow = emptyFlow();
}

function expired() {
  return flow.startedAt > 0 && Date.now() - flow.startedAt > FLOW_TTL_MS;
}

function waitForPassword(signal) {
  return new Promise((resolve, reject) => {
    const abort = () => reject(Object.assign(new Error('QR login aborted'), { name: 'AbortError' }));
    signal.addEventListener('abort', abort, { once: true });
    flow.passwordWaiter = {
      resolve: value => {
        signal.removeEventListener('abort', abort);
        flow.passwordWaiter = null;
        resolve(value);
      },
      reject: error => {
        signal.removeEventListener('abort', abort);
        flow.passwordWaiter = null;
        reject(error);
      }
    };
  });
}

function makeClient(apiId, apiHash) {
  return new TelegramClient(new StringSession(''), apiId, apiHash, {
    connectionRetries: 3,
    requestRetries: 2,
    timeout: 12,
    autoReconnect: true,
    floodSleepThreshold: 8,
    baseLogger: new Logger('none'),
    deviceModel: 'Border Monitor UA',
    systemVersion: `Node ${process.versions.node}`,
    appVersion: '1.0',
    langCode: 'uk',
    systemLangCode: 'uk-UA'
  });
}

async function startFlow() {
  const config = configuration();
  if (config.sessionConfigured) return publicStatus();
  if (!config.credentialsConfigured) throw Object.assign(new Error('Telegram API credentials are not configured'), { code: 'MISSING_TELEGRAM_CREDENTIALS' });
  if (expired()) await stopFlow();
  if (flow.task && ['connecting', 'waiting_for_scan', 'password_required', 'checking_password'].includes(flow.stage)) return publicStatus();
  if (flow.stage === 'done' && flow.session) return publicStatus();

  await stopFlow();
  const controller = new AbortController();
  const client = makeClient(config.apiId, config.apiHash);
  flow = { ...emptyFlow(), stage: 'connecting', client, controller, startedAt: Date.now() };

  flow.task = (async () => {
    await client.connect();
    await client.signInUserWithQrCode(
      { apiId: config.apiId, apiHash: config.apiHash },
      {
        abortSignal: controller.signal,
        qrCode: async ({ token, expires }) => {
          const qrUrl = `tg://login?token=${token.toString('base64url')}`;
          const qrImage = await QRCode.toDataURL(qrUrl, {
            errorCorrectionLevel: 'M', margin: 2, width: 320,
            color: { dark: '#0B2A4AFF', light: '#FFFFFFFF' }
          });
          flow.qrUrl = qrUrl;
          flow.qrImage = qrImage;
          flow.qrExpiresAt = new Date(Number(expires) * 1000).toISOString();
          if (flow.stage !== 'password_required') flow.stage = 'waiting_for_scan';
          flow.error = null;
        },
        password: async hint => {
          flow.stage = 'password_required';
          flow.passwordHint = String(hint || '').slice(0, 120) || null;
          flow.error = null;
          return waitForPassword(controller.signal);
        },
        onError: async error => {
          flow.error = safeErrorCode(error);
          return false;
        }
      }
    );
    const session = client.session.save();
    if (!session) throw Object.assign(new Error('Telegram session was empty'), { code: 'EMPTY_TELEGRAM_SESSION' });
    flow.session = session;
    flow.stage = 'done';
    flow.qrUrl = null;
    flow.qrImage = null;
    flow.qrExpiresAt = null;
    flow.passwordHint = null;
    flow.error = null;
    console.log('[telegram-auth]', JSON.stringify({ status: 'authorized', sessionReady: true }));
  })().catch(error => {
    if (error?.name === 'AbortError') return;
    flow.stage = 'error';
    flow.error = safeErrorCode(error);
    flow.qrUrl = null;
    flow.qrImage = null;
    flow.qrExpiresAt = null;
    console.log('[telegram-auth]', JSON.stringify({ status: 'error', code: flow.error }));
  }).finally(async () => {
    try { await client.disconnect(); } catch {}
    flow.client = null;
    flow.controller = null;
    flow.passwordWaiter = null;
  });

  const deadline = Date.now() + 12_000;
  while (flow.stage === 'connecting' && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 150));
  return publicStatus();
}

function submitPassword(password) {
  if (flow.stage !== 'password_required' || !flow.passwordWaiter) throw Object.assign(new Error('Telegram is not waiting for a 2FA password'), { code: 'PASSWORD_NOT_REQUESTED' });
  const value = String(password || '');
  if (!value || value.length > 256) throw Object.assign(new Error('Invalid password value'), { code: 'INVALID_PASSWORD_VALUE' });
  const waiter = flow.passwordWaiter;
  flow.passwordWaiter = null;
  flow.stage = 'checking_password';
  flow.passwordHint = null;
  flow.error = null;
  waiter.resolve(value);
}

export default async function handler(req, res) {
  res.setHeader?.('Cache-Control', 'no-store');
  res.setHeader?.('Referrer-Policy', 'no-referrer');
  if (!authorized(req)) return res.status(403).json({ ok: false, error: 'forbidden' });
  if (expired()) await stopFlow();
  const pathname = new URL(req.url || '/', 'http://localhost').pathname;
  const action = pathname.split('/').filter(Boolean).pop();
  if (action === 'status' && req.method === 'GET') return res.status(200).json(publicStatus());
  if (action === 'start' && req.method === 'POST') {
    try { return res.status(200).json(await startFlow()); }
    catch (error) { return res.status(400).json({ ok: false, error: safeErrorCode(error) }); }
  }
  if (action === 'password' && req.method === 'POST') {
    try {
      submitPassword(req.body?.password);
      return res.status(200).json(publicStatus());
    } catch (error) {
      return res.status(409).json({ ok: false, error: safeErrorCode(error), ...publicStatus() });
    }
  }
  if (action === 'export' && req.method === 'POST') {
    if (configuration().sessionConfigured) return res.status(409).json({ ok: false, error: 'already_configured' });
    if (flow.stage !== 'done' || !flow.session) return res.status(409).json({ ok: false, error: 'session_not_ready', stage: flow.stage });
    return res.status(200).json({ ok: true, session: flow.session });
  }
  return res.status(404).json({ ok: false, error: 'not_found' });
}
