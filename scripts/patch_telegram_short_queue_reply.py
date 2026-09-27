from pathlib import Path

# Patch Telegram parser based on the live Hryshiv message pattern:
# question: "... яка черга авто до Польщі?" -> reply: "Нема".
tg = Path('api/telegram.js')
text = tg.read_text(encoding='utf-8')

old_ad = """function advertisementLike(text) {\n  const raw = String(text || '');\n  const promo = /реклам|донат|аеропорт|аэропорт|катовіц|katowice|індивідуаль|индивидуаль|трансфер|таксі|такси|перевез|підвез|подвез/i.test(raw);\n  const phone = /(?:\\+?\\d[\\s()\\-.]*){9,}/.test(raw);\n  return promo && phone;\n}\n"""
new_ad = """function advertisementLike(text) {\n  const raw = String(text || '');\n  const promo = /реклам|донат|аеропорт|аэропорт|катовіц|katowice|індивідуаль|индивидуаль|трансфер|таксі|такси|перевез|підвез|подвез/i.test(raw);\n  const phone = /(?:\\+?\\d[\\s()\\-.]*){9,}/.test(raw);\n  const explicitAd = /рекламне повідомлення|реклама в чатах|розміщення реклами|для замовлення.{0,60}реклам/i.test(raw);\n  return promo && (phone || explicitAd);\n}\n\nexport function shortQueueReplyLike(text, replyText) {\n  if (!queueQuestionLike(replyText)) return false;\n  const normalized = clean(text);\n  return /^(?:нема|немає|нет|ні|нікого|пусто|нуль|0|без черги|черги нема|черги немає|очереди нет|без очереди)$/u.test(normalized);\n}\n"""
if old_ad not in text:
    raise SystemExit('advertisementLike block not found')
text = text.replace(old_ad, new_ad, 1)

old_filter = """  const waitMin = parseWaitMin(text);\n  const queueCars = parseQueueCars(text) ?? parseContextQueueCars(text, replyText, effectiveContext);\n  if (advertisementLike(text) && waitMin == null && queueCars == null) return null;\n  if (waitMin == null && queueCars == null && !signalLike(text)) return null;\n"""
new_filter = """  const waitMin = parseWaitMin(text);\n  const queueCars = parseQueueCars(text) ?? parseContextQueueCars(text, replyText, effectiveContext);\n  const shortQueueReply = shortQueueReplyLike(text, replyText);\n  if (advertisementLike(text) && waitMin == null && queueCars == null) return null;\n  if (waitMin == null && queueCars == null && !signalLike(text) && !shortQueueReply) return null;\n"""
if old_filter not in text:
    raise SystemExit('parse filter block not found')
text = text.replace(old_filter, new_filter, 1)

# Remove temporary raw-message diagnostic exposure now that the exact issue is known.
text = text.replace(
"""      newestMessageAt: timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : null,\n      peerId: peer.id,\n      recentMessages: [...messages].sort((a,b)=>messageTimestampMs(b)-messageTimestampMs(a)).slice(0,20).map(m=>({id:m.id,date:Number.isFinite(messageTimestampMs(m))?new Date(messageTimestampMs(m)).toISOString():null,text:messageText(m),replyToMsgId:m.replyToMsgId||null}))\n""",
"""      newestMessageAt: timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : null,\n      peerId: peer.id\n""",
1)
text = text.replace(
"""    sources: allResults.map(result => sourceMeta(result, configured ? 'available' : 'missing_credentials')),\n    ...(requested && requested !== 'full' ? { recentMessages: byUser.get(String(requested).toLowerCase())?.recentMessages || [] } : {}),\n    quota: quotaState.remaining == null ? null : quotaState\n""",
"""    sources: allResults.map(result => sourceMeta(result, configured ? 'available' : 'missing_credentials')),\n    quota: quotaState.remaining == null ? null : quotaState\n""",
1)

tg.write_text(text, encoding='utf-8')

agg = Path('api/aggregate.js')
a = agg.read_text(encoding='utf-8')
old_qual = """  const text=keyName(raw);\n  const low=/(без черги|нема черги|немає черги|черги нема|черги немає|пусто|вільно|вільний|одразу|відразу|сразу|без очікування)/.test(text);\n  const high=/(велика черга|довга черга|черга велика|черга довга|стоимо|стоїмо|чекаємо|ждемо|затор)/.test(text);\n"""
new_qual = """  const text=keyName(raw);\n  const reply=keyName(src?.replyContext||'');\n  const shortNegative=/^(нема|немає|нет|ні|нікого|пусто|нуль|0)$/.test(text)&&/(черг|очеред|авто|машин)/.test(reply);\n  const low=shortNegative||/(без черги|нема черги|немає черги|черги нема|черги немає|пусто|вільно|вільний|одразу|відразу|сразу|без очікування)/.test(text);\n  const high=/(велика черга|довга черга|черга велика|черга довга|стоимо|стоїмо|чекаємо|ждемо|затор)/.test(text);\n"""
if old_qual not in a:
    raise SystemExit('telegramQualitativeSignal block not found')
a = a.replace(old_qual, new_qual, 1)
agg.write_text(a, encoding='utf-8')

# Regression tests with the exact live Hryshiv pattern and an ad guard.
t = Path('test/telegram.test.js')
tests = t.read_text(encoding='utf-8')
if "parses bare 'Нема' reply to a queue question" not in tests:
    tests += r'''

test("parses bare 'Нема' reply to a queue question", async () => {
  const { parseTelegramMessage } = await import('../api/telegram.js');
  const now = Date.parse('2026-09-27T06:00:00.000Z');
  const source = { kind:'checkpoint_chat', checkpoint:'Грушів - Будоміж', country:'Польща', countryCode:'PL', label:'Грушів - Будоміж', username:'hryshiv', channelUrl:'https://t.me/hryshiv' };
  const question = { id:270020, date:'2026-09-27T05:39:03.000Z', message:'Добрий ранок. Підкажіть будь ласка яка черга авто до Польщі?' };
  const answer = { id:270021, date:'2026-09-27T05:47:22.000Z', message:'Нема', replyToMsgId:270020 };
  const parsed = parseTelegramMessage(answer, question, source, now, null);
  assert.ok(parsed);
  assert.equal(parsed.direction, 'UA_EU');
  assert.equal(parsed.direction_basis, 'reply');
  assert.equal(parsed.note, 'Нема');
  assert.match(parsed.reply_context, /черга авто до Польщі/);
});

test('does not treat explicit advertising post as a queue report', async () => {
  const { parseTelegramMessage } = await import('../api/telegram.js');
  const now = Date.parse('2026-09-27T07:01:00.000Z');
  const source = { kind:'checkpoint_chat', checkpoint:'Грушів - Будоміж', country:'Польща', countryCode:'PL', label:'Грушів - Будоміж', username:'hryshiv', channelUrl:'https://t.me/hryshiv' };
  const ad = { id:270024, date:'2026-09-27T07:00:02.000Z', message:'Рекламне повідомлення за донат на ЗСУ. РЕКЛАМА в чатах Українці на Кордоні. Розміщення реклами здійснюється за донат.' };
  const context = { direction:'EU_UA', ts:Date.parse('2026-09-27T06:58:58.000Z'), queueIntent:true };
  assert.equal(parseTelegramMessage(ad, null, source, now, context), null);
});
'''
    t.write_text(tests, encoding='utf-8')

# Aggregate regression: a bare negative answer with queue-question context is qualitative low.
at = Path('test/aggregate.test.js')
ats = at.read_text(encoding='utf-8')
if "bare negative Telegram reply supports a low base wait" not in ats:
    ats += r'''

test('bare negative Telegram reply supports a low base wait', async () => {
  const { mergeTelegram } = await import('../api/aggregate.js');
  const base = [{ id:'g', name:'Грушів - Будоміж', country:'Польща', countryCode:'PL', direction:'UA_EU', waitMin:15, queueCars:0, sources:[], stale:false }];
  const report = [{ checkpoint:'Грушів - Будоміж', country:'Польща', country_code:'PL', direction:'UA_EU', wait_min:null, queue_cars:null, updated_at:new Date().toISOString(), age_min:5, note:'Нема', reply_context:'Добрий ранок. Підкажіть будь ласка яка черга авто до Польщі?', source_label:'Грушів - Будоміж', source_url:'https://t.me/hryshiv/270021', source_channel:'hryshiv', channel_url:'https://t.me/hryshiv', direction_basis:'reply' }];
  const rows = mergeTelegram(base, report, 'UA_EU', []);
  assert.equal(rows[0].telegramQualitative.low, 1);
  assert.equal(rows[0].timeReliability, 'supported');
});
'''
    at.write_text(ats, encoding='utf-8')

print('Telegram short queue reply patch applied')
