from pathlib import Path

p = Path('api/telegram.js')
text = p.read_text(encoding='utf-8')

text = text.replace(
    'const CONTEXT_DIRECTION_MAX_GAP_MS = 45 * 60 * 1000;\n',
    'const CONTEXT_DIRECTION_MAX_GAP_MS = 45 * 60 * 1000;\nconst CONTEXT_DIRECTION_STRONG_SIGNAL_MAX_GAP_MS = 120 * 60 * 1000;\n'
)

needle = """function signalLike(text) {\n  return /черг|очеред|кордон|границ|кпп|пункт пропуск|авто|машин|територ|зелени|червон|проїх|проех|пройш|прошл|стої|стоим|стою|чека|жду|очіку|одразу|відразу|сразу|вільн|свобод/i.test(String(text || ''));\n}\n"""
replacement = needle + """\nexport function strongQueueStatement(text) {\n  const raw = String(text || '').trim();\n  if (!raw || questionLike(raw)) return false;\n  const normalized = clean(raw);\n  return /(без черги|нема черги|немає черги|черги нема|черги немає|очереди нет|без очереди|пусто|вільно|свободно|одразу|відразу|сразу|велика черга|довга черга|черга велика|черга довга|большая очередь|длинная очередь)/u.test(normalized);\n}\n"""
if needle not in text:
    raise SystemExit('signalLike block not found')
text = text.replace(needle, replacement, 1)

old = """  const direct = directionFromPair(text, replyText);\n  let direction = direct?.direction || null;\n  let directionBasis = direct?.basis || null;\n  if (!direction && source.kind === 'checkpoint_chat' && contextDirection?.direction) {\n    direction = contextDirection.direction;\n    directionBasis = 'context';\n  }\n  if (!direction) return null;\n  const timestampMs = messageTimestampMs(message);\n  if (!Number.isFinite(timestampMs)) return null;\n"""
new = """  const direct = directionFromPair(text, replyText);\n  let direction = direct?.direction || null;\n  let directionBasis = direct?.basis || null;\n  const timestampMs = messageTimestampMs(message);\n  if (!Number.isFinite(timestampMs)) return null;\n  let effectiveContext = null;\n  if (contextDirection?.direction && Number.isFinite(Number(contextDirection?.ts))) {\n    const gapMs = timestampMs - Number(contextDirection.ts);\n    const maxGapMs = strongQueueStatement(text) ? CONTEXT_DIRECTION_STRONG_SIGNAL_MAX_GAP_MS : CONTEXT_DIRECTION_MAX_GAP_MS;\n    if (gapMs >= 0 && gapMs <= maxGapMs) effectiveContext = contextDirection;\n  }\n  if (!direction && source.kind === 'checkpoint_chat' && effectiveContext?.direction) {\n    direction = effectiveContext.direction;\n    directionBasis = 'context';\n  }\n  if (!direction) return null;\n"""
if old not in text:
    raise SystemExit('parseTelegramMessage direction block not found')
text = text.replace(old, new, 1)
text = text.replace(
    '  const queueCars = parseQueueCars(text) ?? parseContextQueueCars(text, replyText, contextDirection);\n',
    '  const queueCars = parseQueueCars(text) ?? parseContextQueueCars(text, replyText, effectiveContext);\n',
    1
)

old_fetch = """      const context = contextDirection && Number.isFinite(timestampMs) && timestampMs >= contextDirection.ts && timestampMs - contextDirection.ts <= CONTEXT_DIRECTION_MAX_GAP_MS\n        ? contextDirection\n        : null;\n      const parsed = parseTelegramMessage(message, replyMessage, source, nowMs, context);\n"""
new_fetch = """      const parsed = parseTelegramMessage(message, replyMessage, source, nowMs, contextDirection);\n"""
if old_fetch not in text:
    raise SystemExit('fetchSource context block not found')
text = text.replace(old_fetch, new_fetch, 1)

p.write_text(text, encoding='utf-8')

# Add regression tests.
t = Path('test/telegram.test.js')
tests = t.read_text(encoding='utf-8') if t.exists() else ''
if "strong directionless queue statement may reuse older checkpoint context" not in tests:
    if not tests:
        tests = "import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { parseTelegramMessage } from '../api/telegram.js';\n"
    elif "parseTelegramMessage" not in tests.split('\n', 3)[0:3].__str__():
        # Existing test file imports may differ; append a separate dynamic import in tests below.
        pass
    tests += r'''

test('strong directionless queue statement may reuse older checkpoint context', async () => {
  const { parseTelegramMessage } = await import('../api/telegram.js');
  const now = Date.parse('2026-09-27T06:50:00.000Z');
  const source = { kind:'checkpoint_chat', checkpoint:'Грушів - Будоміж', country:'Польща', countryCode:'PL', label:'Грушів - Будоміж', username:'hryshiv', channelUrl:'https://t.me/hryshiv' };
  const message = { id:270999, date:'2026-09-27T06:44:13.000Z', message:'Черги немає' };
  const context = { direction:'UA_EU', ts:Date.parse('2026-09-27T05:23:28.000Z'), queueIntent:false };
  const parsed = parseTelegramMessage(message, null, source, now, context);
  assert.ok(parsed);
  assert.equal(parsed.direction, 'UA_EU');
  assert.equal(parsed.direction_basis, 'context');
  assert.equal(parsed.note, 'Черги немає');
});

test('generic directionless message does not reuse old checkpoint context', async () => {
  const { parseTelegramMessage } = await import('../api/telegram.js');
  const now = Date.parse('2026-09-27T06:50:00.000Z');
  const source = { kind:'checkpoint_chat', checkpoint:'Грушів - Будоміж', country:'Польща', countryCode:'PL', label:'Грушів - Будоміж', username:'hryshiv', channelUrl:'https://t.me/hryshiv' };
  const message = { id:271000, date:'2026-09-27T06:44:13.000Z', message:'Тільки в кордоні' };
  const context = { direction:'UA_EU', ts:Date.parse('2026-09-27T05:23:28.000Z'), queueIntent:false };
  const parsed = parseTelegramMessage(message, null, source, now, context);
  assert.equal(parsed, null);
});
'''
    t.write_text(tests, encoding='utf-8')

print('Telegram direction-context patch applied')
