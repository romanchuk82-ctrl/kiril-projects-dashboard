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
