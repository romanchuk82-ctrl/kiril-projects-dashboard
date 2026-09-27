from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"missing patch target: {label}")
    return text.replace(old, new, 1)


telegram_path = Path('api/telegram.js')
text = telegram_path.read_text(encoding='utf-8')

text = replace_once(
    text,
    "const REQUEST_TIMEOUT_MS = 20_000;\n",
    "const REQUEST_TIMEOUT_MS = 20_000;\nconst CONTEXT_DIRECTION_MAX_GAP_MS = 45 * 60 * 1000;\n",
    'context gap constant',
)

old_helpers = """function signalLike(text) {
  return /черг|очеред|кордон|границ|кпп|пункт пропуск|авто|машин|територ|зелени|червон|проїх|проех|пройш|прошл|стої|стоим|стою|чека|жду|очіку|одразу|відразу|сразу|вільн|свобод/i.test(String(text || ''));
}

function messageText(message) {
"""
new_helpers = """function signalLike(text) {
  return /черг|очеред|кордон|границ|кпп|пункт пропуск|авто|машин|територ|зелени|червон|проїх|проех|пройш|прошл|стої|стоим|стою|чека|жду|очіку|одразу|відразу|сразу|вільн|свобод/i.test(String(text || ''));
}

function questionLike(text) {
  const raw = String(text || '').trim();
  if (!raw) return false;
  if (/[?？]/.test(raw)) return true;
  const normalized = clean(raw);
  return /(?:^|\\s)(?:підкажіть|підкажи|підскажіть|подскажите|скажіть|скажи|скажите|хто\\s+знає|кто\\s+знает|яка|який|які|какая|какой|какие|скільки|сколько)(?:\\s|$)/u.test(normalized);
}

function directionFromPair(text, replyText) {
  const fromMessage = inferDirection(text);
  if (fromMessage) return { direction: fromMessage, basis: 'message' };
  const fromReply = replyText ? inferDirection(replyText) : null;
  if (fromReply) return { direction: fromReply, basis: 'reply' };
  return null;
}

function messageText(message) {
"""
text = replace_once(text, old_helpers, new_helpers, 'question/context helpers')

old_parse = """export function parseTelegramMessage(message, replyMessage, source, nowMs = Date.now()) {
  const text = messageText(message);
  if (!text) return null;
  const replyText = messageText(replyMessage);
  const checkpoint = source.kind === 'checkpoint_chat' ? source : findCheckpoint(`${text}\\n${replyText}`);
  if (!checkpoint) return null;
  let direction = inferDirection(text);
  let directionBasis = direction ? 'message' : null;
  if (!direction && replyText) {
    direction = inferDirection(replyText);
    if (direction) directionBasis = 'reply';
  }
  if (!direction) return null;
  const timestampMs = messageTimestampMs(message);
  if (!Number.isFinite(timestampMs)) return null;
  const ageMin = Math.max(0, Math.round((nowMs - timestampMs) / 60_000));
  if (ageMin > MAX_AGE_MIN) return null;
  const waitMin = parseWaitMin(text);
  const queueCars = parseQueueCars(text);
  if (waitMin == null && queueCars == null && !signalLike(text)) return null;
"""
new_parse = """export function parseTelegramMessage(message, replyMessage, source, nowMs = Date.now(), contextDirection = null) {
  const text = messageText(message);
  if (!text) return null;
  const replyText = messageText(replyMessage);
  const checkpoint = source.kind === 'checkpoint_chat' ? source : findCheckpoint(`${text}\\n${replyText}`);
  if (!checkpoint) return null;
  const direct = directionFromPair(text, replyText);
  let direction = direct?.direction || null;
  let directionBasis = direct?.basis || null;
  if (!direction && source.kind === 'checkpoint_chat' && contextDirection?.direction) {
    direction = contextDirection.direction;
    directionBasis = 'context';
  }
  if (!direction) return null;
  const timestampMs = messageTimestampMs(message);
  if (!Number.isFinite(timestampMs)) return null;
  const ageMin = Math.max(0, Math.round((nowMs - timestampMs) / 60_000));
  if (ageMin > MAX_AGE_MIN) return null;
  if (questionLike(text)) return null;
  const waitMin = parseWaitMin(text);
  const queueCars = parseQueueCars(text);
  if (waitMin == null && queueCars == null && !signalLike(text)) return null;
"""
text = replace_once(text, old_parse, new_parse, 'parseTelegramMessage')

old_items = """    const messages = (Array.isArray(body?.messages) ? body.messages : []).map(normalizeMessage).filter(m => Number.isInteger(m.id) && m.id > 0);
    const byId = new Map(messages.map(m => [m.id, m]));
    const nowMs = Date.now();
    const items = messages.map(message => parseTelegramMessage(message, byId.get(message.replyToMsgId), source, nowMs)).filter(Boolean);
    const timestamps = messages.map(messageTimestampMs).filter(Number.isFinite);
"""
new_items = """    const messages = (Array.isArray(body?.messages) ? body.messages : []).map(normalizeMessage).filter(m => Number.isInteger(m.id) && m.id > 0);
    const byId = new Map(messages.map(m => [m.id, m]));
    const nowMs = Date.now();
    const chronological = [...messages].sort((a, b) => messageTimestampMs(a) - messageTimestampMs(b));
    const items = [];
    let contextDirection = null;
    for (const message of chronological) {
      const replyMessage = byId.get(message.replyToMsgId);
      const timestampMs = messageTimestampMs(message);
      const direct = directionFromPair(messageText(message), messageText(replyMessage));
      if (direct?.direction && Number.isFinite(timestampMs)) contextDirection = { direction: direct.direction, ts: timestampMs };
      const context = contextDirection && Number.isFinite(timestampMs) && timestampMs >= contextDirection.ts && timestampMs - contextDirection.ts <= CONTEXT_DIRECTION_MAX_GAP_MS
        ? contextDirection
        : null;
      const parsed = parseTelegramMessage(message, replyMessage, source, nowMs, context);
      if (parsed) items.push(parsed);
    }
    const timestamps = messages.map(messageTimestampMs).filter(Number.isFinite);
"""
text = replace_once(text, old_items, new_items, 'contextual source parsing')

telegram_path.write_text(text, encoding='utf-8')

ui_path = Path('public/tgatlas-ui.js')
ui = ui_path.read_text(encoding='utf-8')
ui = replace_once(
    ui,
    "  async function loadTelegram(channel) {\n    if (!channel) return false;\n    try {\n      const response = await fetch(`/snapshot?username=${encodeURIComponent(channel)}`, { cache: 'no-store' });\n",
    "  async function loadTelegram(channel, force = false) {\n    if (!channel) return false;\n    try {\n      const refresh = force ? '&refresh=1' : '';\n      const response = await fetch(`/snapshot?username=${encodeURIComponent(channel)}${refresh}`, { cache: 'no-store' });\n",
    'forced channel refresh',
)

old_tail = """  setInterval(refreshVisibleTelegram, AUTO_REFRESH_MS);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshVisibleTelegram();
  });
  window.addEventListener('focus', refreshVisibleTelegram);
})();
"""
new_tail = """  const forcedAt = new Map();
  const crossingList = document.getElementById('crossingList');
  crossingList?.addEventListener('click', event => {
    const summary = event.target.closest?.('summary.compact-crossing-summary');
    if (!summary) return;
    const details = summary.closest('details.crossing-collapsible');
    setTimeout(async () => {
      if (!details?.open) return;
      const title = summary.querySelector('.crossing-title')?.textContent?.trim() || '';
      const row = state.rows.find(item => item?.name && title.includes(String(item.name)));
      const channel = row?.telegramChat?.channel;
      if (!channel) return;
      const key = String(channel).toLowerCase();
      const now = Date.now();
      if (now - (forcedAt.get(key) || 0) < 15_000) return;
      forcedAt.set(key, now);
      const ok = await loadTelegram(channel, true);
      if (ok) baseRender();
    }, 0);
  });

  setInterval(refreshVisibleTelegram, AUTO_REFRESH_MS);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshVisibleTelegram();
  });
  window.addEventListener('focus', refreshVisibleTelegram);
})();
"""
ui = replace_once(ui, old_tail, new_tail, 'refresh crossing on open')
ui_path.write_text(ui, encoding='utf-8')

print('patched Telegram question filtering, context inheritance and forced open refresh')
