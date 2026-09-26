import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeTelegram } from '../api/aggregate.js';

test('Moldova checkpoint chats remain visible even without fresh messages', () => {
  const chat = {
    channel: 'palankaudobne',
    channelUrl: 'https://t.me/palankaudobne',
    label: 'Маяки-Удобне - Паланка',
    kind: 'checkpoint_chat',
    checkpoint: 'Маяки-Удобне - Паланка',
    country: 'Молдова',
    countryCode: 'MD',
    aliases: ['маяки', 'паланка'],
    status: 'connected',
    items: 0
  };
  const rows = mergeTelegram([], [], 'UA_EU', [chat]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].countryCode, 'MD');
  assert.equal(rows[0].direction, 'UA_EU');
  assert.equal(rows[0].waitMin, null);
  assert.equal(rows[0].telegramChat.url, 'https://t.me/palankaudobne');
});

test('Telegram human wait does not overwrite the authoritative waitMin', () => {
  const base = [{
    id: 'base', name: 'Грушів - Будоміж', country: 'Польща', countryCode: 'PL',
    direction: 'EU_UA', waitMin: 45, queueCars: null, sources: [], stale: false
  }];
  const report = [{
    checkpoint: 'Грушів - Будоміж', country: 'Польща', country_code: 'PL', direction: 'EU_UA',
    wait_min: 10, queue_cars: 4, updated_at: '2026-09-26T14:55:00.000Z', age_min: 5,
    note: '10 хв, 4 авто', source_label: 'Грушів - Будоміж', source_url: 'https://t.me/hryshiv/1',
    source_channel: 'hryshiv', channel_url: 'https://t.me/hryshiv', direction_basis: 'message'
  }];
  const rows = mergeTelegram(base, report, 'EU_UA', []);
  assert.equal(rows[0].waitMin, 45);
  assert.equal(rows[0].sources[0].source, 'telegram');
  assert.equal(rows[0].sources[0].value, 10);
});

test('checkpoint chats with a shared city alias stay as separate cards', () => {
  const chats = [
    {
      channel: 'solotkino', channelUrl: 'https://t.me/solotkino',
      label: 'Солотвино - Сігету Мармацієй', checkpoint: 'Солотвино - Сігету Мармацієй',
      country: 'Румунія', countryCode: 'RO', aliases: ['солотвино', 'сігету'],
      kind: 'checkpoint_chat', status: 'connected', items: 0
    },
    {
      channel: 'bilacerkvasigetumarmatiei', channelUrl: 'https://t.me/bilacerkvasigetumarmatiei',
      label: 'Біла Церква - Сігету-Мармацієй', checkpoint: 'Біла Церква - Сігету-Мармацієй',
      country: 'Румунія', countryCode: 'RO', aliases: ['біла церква', 'сігету'],
      kind: 'checkpoint_chat', status: 'connected', items: 0
    }
  ];
  const rows = mergeTelegram([], [], 'UA_EU', chats);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(row => row.telegramChat.channel).sort(), ['bilacerkvasigetumarmatiei', 'solotkino']);
});
