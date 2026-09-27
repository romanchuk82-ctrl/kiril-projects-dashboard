from pathlib import Path

p = Path('api/telegram.js')
s = p.read_text()

old = """function questionLike(text) {
  const raw = String(text || '').trim();
  if (!raw) return false;
  if (/[?？]/.test(raw)) return true;
  const normalized = clean(raw);
  return /(?:^|\\s)(?:підкажіть|підкажи|підскажіть|подскажите|скажіть|скажи|скажите|хто\\s+знає|кто\\s+знает|яка|який|які|какая|какой|какие|скільки|сколько)(?:\\s|$)/u.test(normalized);
}

function directionFromPair(text, replyText) {
"""
new = """function questionLike(text) {
  const raw = String(text || '').trim();
  if (!raw) return false;
  if (/[?？]/.test(raw)) return true;
  const normalized = clean(raw);
  return /(?:^|\\s)(?:підкажіть|підкажи|підскажіть|подскажите|скажіть|скажи|скажите|хто\\s+знає|кто\\s+знает|яка|який|які|какая|какой|какие|скільки|сколько)(?:\\s|$)/u.test(normalized);
}

function queueQuestionLike(text) {
  if (!questionLike(text)) return false;
  return /черг|очеред|авто|машин|скільки|сколько/i.test(String(text || ''));
}

function advertisementLike(text) {
  const raw = String(text || '');
  const promo = /реклам|донат|аеропорт|аэропорт|катовіц|katowice|індивідуаль|индивидуаль|трансфер|таксі|такси|перевез|підвез|подвез/i.test(raw);
  const phone = /(?:\\+?\\d[\\s()\-.]*){9,}/.test(raw);
  return promo && phone;
}

function parseContextQueueCars(text, replyText, contextDirection) {
  const queueContext = queueQuestionLike(replyText) || Boolean(contextDirection?.queueIntent);
  if (!queueContext) return null;
  const raw = String(text || '').trim().toLowerCase();
  let match = raw.match(/^(?:десь|приблизно|прибл\\.?|около|примерно|біля|до|~)?\\s*(\\d{1,3})\\s*[-–—]\\s*(\\d{1,3})\\s*(?:шт\\.?|авто|машин[\\p{L}]*)?$/iu);
  if (match) return Math.max(Number(match[1]), Number(match[2]));
  match = raw.match(/^(?:десь|приблизно|прибл\\.?|около|примерно|біля|до|~)?\\s*(\\d{1,3})\\s*(?:шт\\.?|авто|машин[\\p{L}]*)?$/iu);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value <= 500 ? value : null;
}

function directionFromPair(text, replyText) {
"""
if old not in s:
    raise SystemExit('questionLike anchor not found')
s = s.replace(old, new, 1)

old = """  if (ageMin > MAX_AGE_MIN) return null;
  if (questionLike(text)) return null;
  const waitMin = parseWaitMin(text);
  const queueCars = parseQueueCars(text);
  if (waitMin == null && queueCars == null && !signalLike(text)) return null;
"""
new = """  if (ageMin > MAX_AGE_MIN) return null;
  if (questionLike(text)) return null;
  const waitMin = parseWaitMin(text);
  const queueCars = parseQueueCars(text) ?? parseContextQueueCars(text, replyText, contextDirection);
  if (advertisementLike(text) && waitMin == null && queueCars == null) return null;
  if (waitMin == null && queueCars == null && !signalLike(text)) return null;
"""
if old not in s:
    raise SystemExit('parse anchor not found')
s = s.replace(old, new, 1)

old = """      const direct = directionFromPair(messageText(message), messageText(replyMessage));
      if (direct?.direction && Number.isFinite(timestampMs)) contextDirection = { direction: direct.direction, ts: timestampMs };
      const context = contextDirection && Number.isFinite(timestampMs) && timestampMs >= contextDirection.ts && timestampMs - contextDirection.ts <= CONTEXT_DIRECTION_MAX_GAP_MS
"""
new = """      const text = messageText(message);
      const replyText = messageText(replyMessage);
      const direct = directionFromPair(text, replyText);
      if (direct?.direction && Number.isFinite(timestampMs)) {
        contextDirection = { direction: direct.direction, ts: timestampMs, queueIntent: queueQuestionLike(text) || queueQuestionLike(replyText) };
      } else if (contextDirection && queueQuestionLike(text) && Number.isFinite(timestampMs)) {
        contextDirection = { ...contextDirection, ts: timestampMs, queueIntent: true };
      }
      const context = contextDirection && Number.isFinite(timestampMs) && timestampMs >= contextDirection.ts && timestampMs - contextDirection.ts <= CONTEXT_DIRECTION_MAX_GAP_MS
"""
if old not in s:
    raise SystemExit('context anchor not found')
s = s.replace(old, new, 1)
p.write_text(s)

p = Path('public/app.js')
s = p.read_text()
old = ".sort((a,b)=>(a.ageMin??9999)-(b.ageMin??9999)),chat=r.telegramChat||null;"
new = ".sort((a,b)=>{const ta=Date.parse(a.updatedAt||''),tb=Date.parse(b.updatedAt||'');if(Number.isFinite(ta)&&Number.isFinite(tb)&&ta!==tb)return tb-ta;return(a.ageMin??9999)-(b.ageMin??9999)}),chat=r.telegramChat||null;"
if old not in s:
    raise SystemExit('telegramBlock sort anchor not found')
s = s.replace(old, new, 1)
p.write_text(s)
