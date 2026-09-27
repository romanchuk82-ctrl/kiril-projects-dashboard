import test from 'node:test';
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
