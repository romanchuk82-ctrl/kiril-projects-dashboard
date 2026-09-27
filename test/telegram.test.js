import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHAT_SOURCES,
  dedupeAndLimit,
  inferDirection,
  parseQueueCars,
  parseTelegramMessage,
  parseWaitMin
} from '../api/telegram.js';

const now = Date.parse('2026-09-26T15:00:00.000Z');
const message = (id, text, ageMin = 5, replyToMsgId = undefined) => ({
  id,
  rawText: text,
  date: Math.floor((now - ageMin * 60_000) / 1000),
  replyToMsgId
});

test('checkpoint registry contains 29 chats and the correct hryshiv mapping', () => {
  assert.equal(CHAT_SOURCES.length, 29);
  const hryshiv = CHAT_SOURCES.find(source => source.username === 'hryshiv');
  assert.equal(hryshiv?.checkpoint, 'Грушів - Будоміж');
  assert.equal(hryshiv?.countryCode, 'PL');
  assert.equal(hryshiv?.channelUrl, 'https://t.me/hryshiv');
});

test('reply question supplies direction for the hryshiv example without inventing wait time', () => {
  const source = CHAT_SOURCES.find(item => item.username === 'hryshiv');
  const result = parseTelegramMessage(
    message(4312, 'Сразу на территорию. 4 авто', 3, 4309),
    message(4309, 'яка черга в Україну?', 4),
    source,
    now
  );
  assert.equal(result.checkpoint, 'Грушів - Будоміж');
  assert.equal(result.direction, 'EU_UA');
  assert.equal(result.direction_basis, 'reply');
  assert.equal(result.queue_cars, 4);
  assert.equal(result.wait_min, null);
  assert.equal(result.reply_context, 'яка черга в Україну?');
  assert.equal(result.source_url, 'https://t.me/hryshiv/4312');
});

test('recognizes Ukrainian and Russian directions, queues and durations', () => {
  assert.equal(inferDirection('з України в сторону Польши'), 'UA_EU');
  assert.equal(inferDirection('їдемо з Польщі в Україну'), 'EU_UA');
  assert.equal(parseQueueCars('зараз 4 машини'), 4);
  assert.equal(parseQueueCars('черга 12 автомобілів'), 12);
  assert.equal(parseWaitMin('стояли 2 часа 15 минут'), 135);
  assert.equal(parseWaitMin('20 хв'), 20);
  assert.equal(parseWaitMin('пів години'), 30);
});

test('keeps qualitative no-queue reports numeric-free', () => {
  const source = CHAT_SOURCES.find(item => item.username === 'hryshiv');
  const result = parseTelegramMessage(
    message(99, 'Без черги, одразу на територію', 8),
    message(98, 'Як зараз на Україну?', 9),
    source,
    now
  );
  assert.equal(result.direction, 'EU_UA');
  assert.equal(result.wait_min, null);
  assert.equal(result.queue_cars, null);
});

test('ignores reports older than three hours', () => {
  const source = CHAT_SOURCES.find(item => item.username === 'hryshiv');
  const result = parseTelegramMessage(
    message(77, '4 авто в Україну', 181),
    null,
    source,
    now
  );
  assert.equal(result, null);
});

test('deduplicates message ids and limits each checkpoint direction to three reports', () => {
  const base = index => ({
    checkpoint: 'Грушів - Будоміж', direction: 'EU_UA', source_channel: 'hryshiv',
    message_id: 100 + index, source_url: `https://t.me/hryshiv/${100 + index}`,
    updated_at: new Date(now - index * 60_000).toISOString()
  });
  const result = dedupeAndLimit([base(0), base(0), base(1), base(2), base(3)]);
  assert.equal(result.length, 3);
  assert.deepEqual(result.map(item => item.message_id), [100, 101, 102]);
});


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
