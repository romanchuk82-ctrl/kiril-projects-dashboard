import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeTelegram, mergeNakordoniWebRows, mergeNakordoniLiveSnapshot } from '../api/aggregate.js';

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


test('Nakordoni freshness merge promotes newer public-page data', () => {
  const api = [{
    id: 'api-grushiv', ppid: 'id_10', name: 'Грушів - Будоміж', country: 'Польща', countryCode: 'PL',
    direction: 'UA_EU', waitMin: 15, queueCars: 0, ageMin: 55,
    updatedAt: '2026-09-27T05:23:00.000Z', stale: false, confidence: 'medium',
    sources: [{ source: 'nakordoni', label: 'Nakordoni', value: 15, updatedAt: '2026-09-27T05:23:00.000Z', ageMin: 55 }]
  }];
  const web = [{
    id: 'web-grushiv', ppid: 'id_10', name: 'Грушів - Будоміж', country: 'Польща', countryCode: 'PL',
    direction: 'UA_EU', waitMin: 5, queueCars: 0, ageMin: 4,
    updatedAt: '2026-09-27T06:14:00.000Z', stale: false, confidence: 'medium',
    sources: [{ source: 'nakordoni', label: 'Nakordoni · web fallback', value: 5, updatedAt: '2026-09-27T06:14:00.000Z', ageMin: 4 }]
  }];
  const merged = mergeNakordoniWebRows(api, web);
  assert.equal(merged.added, 1);
  assert.equal(merged.rows[0].waitMin, 5);
  assert.equal(merged.rows[0].updatedAt, '2026-09-27T06:14:00.000Z');
  assert.equal(merged.rows[0].id, 'api-grushiv');
  assert.equal(merged.rows[0].sources.length, 2);
});

test('Nakordoni freshness merge keeps newer API data but still exposes web source', () => {
  const api = [{
    id: 'api-grushiv', name: 'Грушів - Будоміж', country: 'Польща', countryCode: 'PL',
    direction: 'UA_EU', waitMin: 7, queueCars: 1, ageMin: 2,
    updatedAt: '2026-09-27T06:16:00.000Z', stale: false,
    sources: [{ source: 'nakordoni', label: 'Nakordoni', value: 7, updatedAt: '2026-09-27T06:16:00.000Z', ageMin: 2 }]
  }];
  const web = [{
    id: 'web-grushiv', name: 'Грушів - Будоміж', country: 'Польща', countryCode: 'PL',
    direction: 'UA_EU', waitMin: 15, queueCars: 0, ageMin: 55,
    updatedAt: '2026-09-27T05:23:00.000Z', stale: false,
    sources: [{ source: 'nakordoni', label: 'Nakordoni · web fallback', value: 15, updatedAt: '2026-09-27T05:23:00.000Z', ageMin: 55 }]
  }];
  const merged = mergeNakordoniWebRows(api, web);
  assert.equal(merged.added, 0);
  assert.equal(merged.rows[0].waitMin, 7);
  assert.equal(merged.rows[0].sources.length, 2);
});


test('Nakordoni Live Queue snapshot replaces an older border snapshot', () => {
  const base = {
    id: 'api-grushiv', ppid: 'id_10', name: 'Грушів - Будоміж', country: 'Польща', countryCode: 'PL', direction: 'UA_EU',
    waitMin: 15, queueCars: 0, ageMin: 55, updatedAt: '2026-09-27T05:23:00.000Z', stale: false, confidence: 'medium',
    sourceUrl: 'https://nakordoni.eu/uk/id/id_10',
    sources: [{ source: 'nakordoni', label: 'Nakordoni', value: 15, ageMin: 55, updatedAt: '2026-09-27T05:23:00.000Z' }]
  };
  const snapshot = { waitMin: 5, queueCars: 0, ageMin: 8, updatedAt: '2026-09-27T06:10:00.000Z', waitStatus: null };
  const merged = mergeNakordoniLiveSnapshot(base, snapshot);
  assert.equal(merged.updated, true);
  assert.equal(merged.row.waitMin, 5);
  assert.equal(merged.row.ageMin, 8);
  assert.equal(merged.row.sources[0].label, 'дані nakordoni.eu'); // Explorer attribution
  assert.equal(merged.row.sources.filter(s => s.source === 'nakordoni').length, 1);
});

test('Nakordoni Live Queue snapshot never rolls a checkpoint back', () => {
  const base = {
    id: 'api-grushiv', ppid: 'id_10', name: 'Грушів - Будоміж', country: 'Польща', countryCode: 'PL', direction: 'UA_EU',
    waitMin: 5, queueCars: 0, ageMin: 8, updatedAt: '2026-09-27T06:10:00.000Z', stale: false,
    sources: [{ source: 'nakordoni', label: 'Nakordoni', value: 5, ageMin: 8, updatedAt: '2026-09-27T06:10:00.000Z' }]
  };
  const snapshot = { waitMin: 15, queueCars: 0, ageMin: 55, updatedAt: '2026-09-27T05:23:00.000Z', waitStatus: null };
  const merged = mergeNakordoniLiveSnapshot(base, snapshot);
  assert.equal(merged.updated, false);
  assert.equal(merged.row.waitMin, 5);
});


test('bare negative Telegram reply supports a low base wait', async () => {
  const { mergeTelegram } = await import('../api/aggregate.js');
  const base = [{ id:'g', name:'Грушів - Будоміж', country:'Польща', countryCode:'PL', direction:'UA_EU', waitMin:15, queueCars:0, sources:[], stale:false }];
  const report = [{ checkpoint:'Грушів - Будоміж', country:'Польща', country_code:'PL', direction:'UA_EU', wait_min:null, queue_cars:null, updated_at:new Date().toISOString(), age_min:5, note:'Нема', reply_context:'Добрий ранок. Підкажіть будь ласка яка черга авто до Польщі?', source_label:'Грушів - Будоміж', source_url:'https://t.me/hryshiv/270021', source_channel:'hryshiv', channel_url:'https://t.me/hryshiv', direction_basis:'reply' }];
  const rows = mergeTelegram(base, report, 'UA_EU', []);
  assert.equal(rows[0].telegramQualitative.low, 1);
  assert.equal(rows[0].timeReliability, 'supported');
});
