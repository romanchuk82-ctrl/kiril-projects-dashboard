from pathlib import Path
import re

root = Path('.')

server = r'''import http from 'node:http';
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
'''
(root / 'server.source.js').write_text(server, encoding='utf-8')

status = r'''let cache = null;
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
'''
(root / 'api/status.js').write_text(status, encoding='utf-8')

# Harden aggregate: never accept API credentials from request headers and do not expose provider quota usage/camera metadata.
p = root / 'api/aggregate.js'
text = p.read_text(encoding='utf-8')
old = "const apiKey=process.env.NKD_API_KEY||s(req.headers?.['x-nkd-key']);"
if old not in text:
    raise SystemExit('aggregate api key pattern not found')
text = text.replace(old, "const apiKey=process.env.NKD_API_KEY||null;")
if "function sanitizeRows(" not in text:
    text = text.replace("function sort(rows){return[...rows].sort((a,b)=>(a.timeReliable===true?0:1)-(b.timeReliable===true?0:1)||(a.stale?1:0)-(b.stale?1:0)||(a.waitMin??999999)-(b.waitMin??999999)||(a.ageMin??9999)-(b.ageMin??9999))}", "function sort(rows){return[...rows].sort((a,b)=>(a.timeReliable===true?0:1)-(b.timeReliable===true?0:1)||(a.stale?1:0)-(b.stale?1:0)||(a.waitMin??999999)-(b.waitMin??999999)||(a.ageMin??9999)-(b.ageMin??9999))}\nfunction sanitizeRows(rows){return sort(rows).map(({camera,...rest})=>rest)}")
text = text.replace('crossings:sort(rows)', 'crossings:sanitizeRows(rows)')
text = text.replace(",cameras:'configured'", '')
text = text.replace(',usage:x.usage', '')
p.write_text(text, encoding='utf-8')

# Harden Telegram public endpoint: no forced/full probes, dedupe simultaneous upstream requests, hide operational metadata.
p = root / 'api/telegram.js'
text = p.read_text(encoding='utf-8')
if 'const sourceInflight = new Map();' not in text:
    text = text.replace('const sourceCache = new Map();', 'const sourceCache = new Map();\nconst sourceInflight = new Map();')
marker = '\nasync function fetchInBatches(sources, force = false) {'
if marker not in text:
    raise SystemExit('telegram batch marker not found')
wrapper = r'''
async function fetchSourceDeduped(source, force = false) {
  const key = String(source?.username || '').toLowerCase();
  if (!key) return fetchSource(source, force);
  const existing = sourceInflight.get(key);
  if (existing) return existing;
  const task = Promise.resolve(fetchSource(source, force)).finally(() => sourceInflight.delete(key));
  sourceInflight.set(key, task);
  return task;
}
'''
if 'async function fetchSourceDeduped' not in text:
    text = text.replace(marker, '\n' + wrapper + marker.lstrip('\n'))
text = text.replace('.map(source => fetchSource(source, force))', '.map(source => fetchSourceDeduped(source, force))')
text = text.replace('const result = await fetchSource(source, Boolean(options.force));', 'const result = await fetchSourceDeduped(source, Boolean(options.force));')
old_handler = """export default async function handler(req, res) {\n  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });\n  const username = req.query?.username ? String(req.query.username) : null;\n  const full = req.query?.full === '1';\n  if (full && process.env.BORDER_STARTUP_DIAG !== '1') return res.status(403).json({ ok: false, error: 'full_probe_disabled' });\n  const payload = await getTelegramSnapshot({ username, full, force: req.query?.refresh === '1' });\n  return res.status(payload.ok === false ? 404 : 200).json(payload);\n}"""
new_handler = r'''function publicSnapshot(payload) {
  return {
    ok: payload?.ok !== false,
    generatedAt: payload?.generatedAt || new Date().toISOString(),
    cacheMinutes: payload?.cacheMinutes ?? null,
    maxAgeMinutes: payload?.maxAgeMinutes ?? null,
    status: payload?.status || 'unknown',
    requested: payload?.requested || null,
    error: payload?.ok === false ? (payload?.error || 'not_found') : undefined,
    items: Array.isArray(payload?.items) ? payload.items : [],
    sources: Array.isArray(payload?.sources) ? payload.sources.map(({peerId,error,...rest}) => rest) : []
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  const username = req.query?.username ? String(req.query.username).slice(0, 80) : null;
  if (req.query?.full === '1') return res.status(403).json({ ok: false, error: 'full_probe_disabled' });
  const payload = await getTelegramSnapshot({ username, full: false, force: false });
  return res.status(payload.ok === false ? 404 : 200).json(publicSnapshot(payload));
}'''
if old_handler not in text:
    raise SystemExit('telegram handler pattern not found')
text = text.replace(old_handler, new_handler)
p.write_text(text, encoding='utf-8')

# Frontend: safe https-only external links and no force-refresh endpoint.
p = root / 'public/app.js'
text = p.read_text(encoding='utf-8')
old = "function sourceUrl(s){if(s?.sourceUrl)return s.sourceUrl;if(s?.source==='nakordoni')return'https://nakordoni.eu/';return null}\nfunction telegramChannelUrl(s){if(s?.channelUrl)return s.channelUrl;const u=s?.sourceUrl;if(!u)return null;const m=String(u).match(/^https:\\/\\/t\\.me\\/([^/]+)/i);return m?`https://t.me/${m[1]}`:null}"
new = "function safeExternalUrl(value){if(!value)return null;try{const u=new URL(String(value),window.location.origin);return u.protocol==='https:'?u.href:null}catch{return null}}\nfunction sourceUrl(s){if(s?.sourceUrl)return safeExternalUrl(s.sourceUrl);if(s?.source==='nakordoni')return'https://nakordoni.eu/';return null}\nfunction telegramChannelUrl(s){if(s?.channelUrl)return safeExternalUrl(s.channelUrl);const u=safeExternalUrl(s?.sourceUrl);if(!u)return null;const m=String(u).match(/^https:\\/\\/t\\.me\\/([^/]+)/i);return m?`https://t.me/${m[1]}`:null}"
if old not in text:
    raise SystemExit('app URL helper pattern not found')
text = text.replace(old, new)
text = text.replace("const target=chat?.url||null;", "const target=safeExternalUrl(chat?.url)||null;")
text = text.replace("const latest=tg[0],target=latest.sourceUrl||chat?.url||null,signal=telegramQualitativeSignal(latest)", "const latest=tg[0],target=safeExternalUrl(latest.sourceUrl)||safeExternalUrl(chat?.url)||null,signal=telegramQualitativeSignal(latest)")

shell = r'''

// Static shell behavior kept in this external module so a strict CSP can block inline scripts.
(() => {
  const infoBtn=document.getElementById('siteInfoBtn');
  const dialog=document.getElementById('siteInfoDialog');
  const closeBtn=document.getElementById('siteInfoClose');
  const doneBtn=document.getElementById('siteInfoDone');
  const openInfo=()=>{if(typeof dialog?.showModal==='function')dialog.showModal();else dialog?.setAttribute('open','')};
  const closeInfo=()=>{if(typeof dialog?.close==='function')dialog.close();else dialog?.removeAttribute('open')};
  infoBtn?.addEventListener('click',openInfo);
  closeBtn?.addEventListener('click',closeInfo);
  doneBtn?.addEventListener('click',closeInfo);
  dialog?.addEventListener('click',e=>{if(e.target===dialog)closeInfo()});

  const list=document.getElementById('crossingList');
  const openCrossings=new Set();
  if(!list)return;
  function compactCard(card){
    const head=card.querySelector(':scope > .crossing-head');
    const title=head?.querySelector('.crossing-title');
    const wait=head?.querySelector('.wait-pill');
    const human=head?.querySelector('.human-status');
    const sub=head?.querySelector('.crossing-sub');
    if(!head||!title||!wait)return;
    const key=title.textContent.trim();
    const tone=['tone-green','tone-yellow','tone-orange','tone-red','tone-gray'].find(c=>human?.classList.contains(c))||'tone-gray';
    const details=document.createElement('details');
    details.className=`${card.className} crossing-collapsible`;
    if(openCrossings.has(key))details.open=true;
    const summary=document.createElement('summary');
    summary.className='compact-crossing-summary';
    summary.innerHTML=`<div class="compact-crossing-main"><div class="compact-crossing-copy"><div class="crossing-title">${esc(title.textContent)}</div><div class="compact-human-status ${tone}">${esc(human?.textContent||'⚪️ Стан черги уточнюється')}</div></div><div class="compact-crossing-right"><div class="wait-pill">${esc(wait.textContent)}</div><span class="compact-chevron" aria-hidden="true">⌄</span></div></div>`;
    const body=document.createElement('div');
    body.className='compact-crossing-detail';
    if(sub)body.append(sub.cloneNode(true));
    [...card.children].forEach(child=>{if(child!==head)body.append(child)});
    details.append(summary,body);
    details.addEventListener('toggle',()=>{if(details.open)openCrossings.add(key);else openCrossings.delete(key)});
    card.replaceWith(details);
  }
  function compactAll(){list.querySelectorAll(':scope > article.crossing-card').forEach(compactCard)}
  new MutationObserver(compactAll).observe(list,{childList:true});
  compactAll();
})();
'''
if 'Static shell behavior kept in this external module' not in text:
    text += shell
p.write_text(text, encoding='utf-8')

p = root / 'public/tgatlas-ui.js'
text = p.read_text(encoding='utf-8')
text = text.replace("async function loadTelegram(channel, force = false) {", "async function loadTelegram(channel) {")
text = text.replace("      const refresh = force ? '&refresh=1' : '';\n      const response = await fetch(`/snapshot?username=${encodeURIComponent(channel)}${refresh}`, { cache: 'no-store' });", "      const response = await fetch(`/api/telegram?username=${encodeURIComponent(channel)}`, { cache: 'no-store' });")
text = text.replace('const ok = await loadTelegram(channel, true);', 'const ok = await loadTelegram(channel);')
p.write_text(text, encoding='utf-8')

# Move inline style/script out of index so strict CSP is meaningful.
p = root / 'public/index.html'
html = p.read_text(encoding='utf-8')
style_match = re.search(r'\n  <style>.*?</style>', html, flags=re.S)
if not style_match:
    raise SystemExit('index inline style not found')
style_body = re.sub(r'^\n  <style>\n?|\n?  </style>$', '', style_match.group(0), flags=re.S)
html = html[:style_match.start()] + html[style_match.end():]
script_matches = list(re.finditer(r'\n  <script>(.*?)</script>', html, flags=re.S))
if not script_matches:
    raise SystemExit('index inline script not found')
# Shell script has already been appended to app.js.
for m in reversed(script_matches):
    html = html[:m.start()] + html[m.end():]
html = html.replace('/styles.css?v=20260927-firstvisit', '/styles.css?v=20260927-secure1')
html = html.replace('/app.js?v=20260927-firstvisit', '/app.js?v=20260927-secure1')
p.write_text(html, encoding='utf-8')

p = root / 'public/styles.css'
css = p.read_text(encoding='utf-8')
if '/* strict-CSP compact shell */' not in css:
    css += '\n\n/* strict-CSP compact shell */\n' + style_body.strip() + '\n'
p.write_text(css, encoding='utf-8')

# Pin supported LTS runtime instead of floating to newest Node major.
p = root / 'package.json'
text = p.read_text(encoding='utf-8').replace('"node": ">=20"', '"node": "24.x"')
p.write_text(text, encoding='utf-8')

p = root / '.github/workflows/bundle-border-monitor-v2.yml'
text = p.read_text(encoding='utf-8').replace("node-version: '20'", "node-version: '24'").replace('--target=node20', '--target=node24')
p.write_text(text, encoding='utf-8')

# Add regression tests for the public attack surface.
security_test = r'''import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('public page has no inline script or style under strict CSP', () => {
  const html = fs.readFileSync('public/index.html','utf8');
  assert.doesNotMatch(html, /<script(?:\s[^>]*)?>\s*(?!<)/i);
  assert.doesNotMatch(html, /<style(?:\s[^>]*)?>/i);
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i);
});

test('public APIs do not accept caller credentials or force upstream refreshes', () => {
  const aggregate = fs.readFileSync('api/aggregate.js','utf8');
  const telegram = fs.readFileSync('api/telegram.js','utf8');
  const ui = fs.readFileSync('public/tgatlas-ui.js','utf8');
  assert.doesNotMatch(aggregate, /x-nkd-key/i);
  assert.match(telegram, /full_probe_disabled/);
  assert.match(telegram, /force:\s*false/);
  assert.doesNotMatch(ui, /refresh=1|\/snapshot\?/);
});

test('server has baseline browser and transport hardening', () => {
  const server = fs.readFileSync('server.source.js','utf8');
  for (const marker of ['Content-Security-Policy','Strict-Transport-Security','X-Frame-Options','Permissions-Policy','rate_limited','maxHeaderSize']) assert.match(server, new RegExp(marker));
});

test('frontend filters untrusted external URL schemes', () => {
  const app = fs.readFileSync('public/app.js','utf8');
  assert.match(app, /safeExternalUrl/);
  assert.match(app, /u\.protocol==='https:'/);
});
'''
(root / 'test/security.test.js').write_text(security_test, encoding='utf-8')

# Ongoing CI security checks.
security_workflow = r'''name: Security audit

on:
  push:
    branches: [border-monitor]
    paths:
      - 'api/**'
      - 'public/**'
      - 'server.source.js'
      - 'package.json'
      - 'package-lock.json'
      - 'test/**'
      - '.github/workflows/security-audit.yml'
  pull_request:
    branches: [border-monitor]
  schedule:
    - cron: '17 4 * * 1'

permissions:
  contents: read

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '24'
          cache: npm
      - run: npm ci --ignore-scripts
      - run: npm test
      - run: npm audit --audit-level=high
      - name: Verify production source hygiene
        shell: bash
        run: |
          set -euo pipefail
          ! grep -RInE --exclude='server.bundle.cjs' --exclude='package-lock.json' '-----BEGIN (RSA|OPENSSH|EC) PRIVATE KEY-----|sk-[A-Za-z0-9_-]{20,}' api public scripts server.source.js
          ! grep -RInE '<script>[[:space:]]*[^<]|<style[ >]| on[a-z]+=' public/index.html
          ! grep -RInE 'refresh=1|/snapshot\?' public
'''
(root / '.github/workflows/security-audit.yml').write_text(security_workflow, encoding='utf-8')

(root / '.github/dependabot.yml').write_text(r'''version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
      day: monday
    open-pull-requests-limit: 5
  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly
      day: monday
    open-pull-requests-limit: 5
''', encoding='utf-8')

# README: remove obsolete public setup-route wording and document hardening.
p = root / 'README.md'
readme = p.read_text(encoding='utf-8')
readme = readme.replace('- офіційні джерела, Nakordoni та камери формують основні показники;', '- офіційні джерела, Nakordoni, Kordon.info/ДПСУ та Telegram формують основні показники;')
readme = readme.replace('Одноразовий вхід виконується через `/telegram/setup`: власник сканує QR-код або підтверджує в офіційному Telegram. Номер телефону та код входу сайт не запитує. Якщо Telegram вимагає 2FA, пароль існує тільки в пам\'яті процесу під час цього входу. Після отримання StringSession її потрібно перенести в `TELEGRAM_SESSION`, а `TELEGRAM_SETUP_TOKEN` очистити. Сесія не повинна потрапляти в Git, логи чи відповіді API за межами захищеного одноразового flow.', 'Production не публікує маршрути налаштування Telegram. Секрети не повинні потрапляти в Git, логи або відповіді API.')
if '### Безпека production' not in readme:
    readme += '''\n### Безпека production\n\n- тільки read-only GET API;\n- суворий CSP без inline JavaScript/CSS;\n- HSTS, anti-frame, referrer/permissions policy;\n- rate limiting та обмеження розміру URL/headers;\n- публічний Telegram API не дозволяє force/full refresh;\n- caller-supplied API keys і секрети не приймаються;\n- щотижневий dependency/security audit і Dependabot.\n'''
p.write_text(readme, encoding='utf-8')

print('security hardening applied')
