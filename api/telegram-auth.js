import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';

let flow = {
  stage: 'idle',
  client: null,
  input: null,
  session: null,
  error: null,
  startedAt: 0,
  task: null
};

function authorized(req) {
  const expected = process.env.TELEGRAM_SETUP_TOKEN;
  if (!expected) return false;
  const fromQuery = req.query?.token;
  const fromHeader = req.headers?.['x-setup-token'];
  return fromQuery === expected || fromHeader === expected;
}

function publicStatus() {
  return {
    ok: true,
    configured: Boolean(process.env.TELEGRAM_API_ID && process.env.TELEGRAM_API_HASH),
    sessionConfigured: Boolean(process.env.TELEGRAM_SESSION),
    stage: flow.stage,
    error: flow.error,
    startedAt: flow.startedAt || null
  };
}

function waitInput(stage) {
  return new Promise((resolve, reject) => {
    flow.stage = stage;
    flow.input = { stage, resolve, reject };
  });
}

async function waitForPrompt(timeoutMs = 12000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (['code', 'password', 'done', 'error'].includes(flow.stage)) return;
    await new Promise(r => setTimeout(r, 250));
  }
}

async function startFlow(phone) {
  const apiId = Number(process.env.TELEGRAM_API_ID);
  const apiHash = String(process.env.TELEGRAM_API_HASH || '');
  if (!Number.isFinite(apiId) || !apiHash) throw new Error('Telegram API credentials are not configured');
  if (!/^\+\d{8,15}$/.test(phone)) throw new Error('Номер введи у міжнародному форматі, наприклад +380...');

  if (flow.client) {
    try { await flow.client.disconnect(); } catch {}
  }

  flow = {
    stage: 'connecting',
    client: new TelegramClient(new StringSession(''), apiId, apiHash, { connectionRetries: 5 }),
    input: null,
    session: null,
    error: null,
    startedAt: Date.now(),
    task: null
  };

  flow.task = flow.client.start({
    phoneNumber: async () => phone,
    phoneCode: async () => waitInput('code'),
    password: async () => waitInput('password'),
    onError: (err) => {
      const msg = String(err?.message || err || 'Telegram auth error');
      flow.error = msg;
      console.error('[telegram-auth]', msg);
    }
  }).then(() => {
    flow.session = flow.client.session.save();
    flow.stage = 'done';
    flow.input = null;
    flow.error = null;
    console.log('[telegram-auth] authorized, session ready for secure export');
  }).catch(err => {
    flow.stage = 'error';
    flow.error = String(err?.message || err || 'Telegram auth failed');
    flow.input = null;
    console.error('[telegram-auth] failed:', flow.error);
  });

  await waitForPrompt();
}

function submitInput(stage, value) {
  if (!flow.input || flow.input.stage !== stage) throw new Error(`Зараз очікується інший крок: ${flow.stage}`);
  const resolve = flow.input.resolve;
  flow.input = null;
  flow.stage = 'processing';
  flow.error = null;
  resolve(String(value || '').trim());
}

export default async function handler(req, res) {
  if (!authorized(req)) return res.status(403).json({ ok: false, error: 'forbidden' });

  const pathname = new URL(req.url || '/', 'http://localhost').pathname;
  const action = pathname.split('/').filter(Boolean).pop();

  if (action === 'status' && req.method === 'GET') return res.status(200).json(publicStatus());

  if (process.env.TELEGRAM_SESSION && action !== 'export') {
    return res.status(200).json({ ok: true, sessionConfigured: true, stage: 'already_configured' });
  }

  if (action === 'start' && req.method === 'POST') {
    try {
      await startFlow(String(req.body?.phone || '').trim());
      return res.status(200).json(publicStatus());
    } catch (e) {
      return res.status(400).json({ ok: false, error: String(e?.message || e) });
    }
  }

  if (action === 'code' && req.method === 'POST') {
    try {
      submitInput('code', req.body?.code);
      await waitForPrompt();
      return res.status(200).json(publicStatus());
    } catch (e) {
      return res.status(400).json({ ok: false, error: String(e?.message || e) });
    }
  }

  if (action === 'password' && req.method === 'POST') {
    try {
      submitInput('password', req.body?.password);
      await waitForPrompt();
      return res.status(200).json(publicStatus());
    } catch (e) {
      return res.status(400).json({ ok: false, error: String(e?.message || e) });
    }
  }

  if (action === 'export' && req.method === 'GET') {
    if (!flow.session) return res.status(409).json({ ok: false, error: 'session_not_ready', stage: flow.stage });
    return res.status(200).json({ ok: true, session: flow.session });
  }

  return res.status(404).json({ ok: false, error: 'not_found' });
}
