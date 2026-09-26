import crypto from 'node:crypto';
import { Logger, TelegramClient } from 'teleproto';
import { StringSession } from 'teleproto/sessions/index.js';

const TTL_MS = 4 * 60 * 1000;
const MAX_AGE_MIN = 180;
const MESSAGE_LIMIT = 60;
const MAX_REPORTS_PER_DIRECTION = 3;
const CONCURRENCY = 4;
const CONNECTION_TIMEOUT_MS = 25_000;

let cache = { ts: 0, payload: null };
let refreshPromise = null;
let clientState = {
  fingerprint: null,
  client: null,
  connectPromise: null,
  authorized: false,
  error: null
};

export const CHAT_SOURCES = [
  // Poland
  { username: 'Krakivets', label: 'Краківець - Корчова', checkpoint: 'Краківець - Корчова', country: 'Польща', countryCode: 'PL', aliases: ['краківець', 'краковець', 'корчова', 'korczowa'] },
  { username: 'shegunimeduka', label: 'Шегині - Медика', checkpoint: 'Шегині - Медика', country: 'Польща', countryCode: 'PL', aliases: ['шегині', 'медика', 'medyka'] },
  { username: 'rawahrebenne', label: 'Рава-Руська - Гребенне', checkpoint: 'Рава-Руська - Гребенне', country: 'Польща', countryCode: 'PL', aliases: ['рава руська', 'рава-руська', 'гребенне', 'hrebenne'] },
  { username: 'ustylug', label: 'Устилуг - Зосин', checkpoint: 'Устилуг - Зосин', country: 'Польща', countryCode: 'PL', aliases: ['устилуг', 'зосин', 'zosin'] },
  { username: 'ugryniv', label: 'Угринів - Долгобичув', checkpoint: 'Угринів - Долгобичув', country: 'Польща', countryCode: 'PL', aliases: ['угринів', 'долгобичув', 'dolhobyczow', 'dołhobyczów'] },
  { username: 'hryshiv', label: 'Грушів - Будоміж', checkpoint: 'Грушів - Будоміж', country: 'Польща', countryCode: 'PL', aliases: ['грушів', 'будоміж', 'будомєж', 'budomierz'] },
  { username: 'yagodyn', label: 'Ягодин - Дорогуск', checkpoint: 'Ягодин - Дорогуск', country: 'Польща', countryCode: 'PL', aliases: ['ягодин', 'дорогуск', 'dorohusk'] },
  { username: 'smilnutsa', label: 'Смільниця - Кросценко', checkpoint: 'Смільниця - Кросценко', country: 'Польща', countryCode: 'PL', aliases: ['смільниця', 'кросценко', 'kroscienko', 'krościenko'] },
  { username: 'nyzhankovychi', label: 'Нижанковичі - Мальховичі', checkpoint: 'Нижанковичі - Мальховичі', country: 'Польща', countryCode: 'PL', aliases: ['nyzhankovychi', 'нижанковичі', 'мальховичі', 'malhowice'] },
  // Slovakia
  { username: 'maluibereznui', label: 'Малий Березний - Убля', checkpoint: 'Малий Березний - Убля', country: 'Словаччина', countryCode: 'SK', aliases: ['малий березний', 'убля', 'ubla', 'ubľa'] },
  { username: 'uzhorodqueue', label: 'Ужгород - Вишнє Нємецьке', checkpoint: 'Ужгород - Вишнє Нємецьке', country: 'Словаччина', countryCode: 'SK', aliases: ['ужгород', 'вишнє немецьке', 'вишнє нємецьке', 'vysne nemecke', 'vyšné nemecké'] },
  { username: 'MaliSelmentsi', label: 'Малі Селменці - Вельке Слеменце', checkpoint: 'Малі Селменці - Вельке Слеменце', country: 'Словаччина', countryCode: 'SK', aliases: ['малі селменці', 'вельке слеменце', 'velke slemence', 'veľké slemence'] },
  // Romania
  { username: 'parubne', label: 'Порубне - Сірет', checkpoint: 'Порубне - Сірет', country: 'Румунія', countryCode: 'RO', aliases: ['порубне', 'сірет', 'сирет', 'siret'] },
  { username: 'solotkino', label: 'Солотвино - Сігету Мармацієй', checkpoint: 'Солотвино - Сігету Мармацієй', country: 'Румунія', countryCode: 'RO', aliases: ['солотвино', 'сігету', 'сигету', 'sighetu'] },
  { username: 'diakove', label: 'Дякове - Халмеу', checkpoint: 'Дякове - Халмеу', country: 'Румунія', countryCode: 'RO', aliases: ['дякове', 'халмеу', 'halmeu'] },
  { username: 'diakivchi', label: 'Дяківці - Раковець', checkpoint: 'Дяківці - Раковець', country: 'Румунія', countryCode: 'RO', aliases: ['дяківці', 'раковець', 'racovat', 'racovăț'] },
  { username: 'krasnoyilsk', label: 'Красноїльськ - Вікову де Сус', checkpoint: 'Красноїльськ - Вікову де Сус', country: 'Румунія', countryCode: 'RO', aliases: ['красноїльськ', 'красноільськ', 'вікову', 'vicovu'] },
  { username: 'bilacerkvasigetumarmatiei', label: 'Біла Церква - Сігету-Мармацієй', checkpoint: 'Біла Церква - Сігету-Мармацієй', country: 'Румунія', countryCode: 'RO', aliases: ['біла церква', 'сігету', 'сигету', 'sighetu'] },
  // Hungary
  { username: 'lugankabereg', label: 'Лужанка - Берегшурань', checkpoint: 'Лужанка - Берегшурань', country: 'Угорщина', countryCode: 'HU', aliases: ['лужанка', 'берегшурань', 'beregsurany', 'beregsurány', 'астей'] },
  { username: 'chopzahon', label: 'Чоп (Тиса) - Захонь', checkpoint: 'Чоп (Тиса) - Захонь', country: 'Угорщина', countryCode: 'HU', aliases: ['чоп', 'тиса', 'захонь', 'zahony', 'záhony'] },
  { username: 'viloktisabech', label: 'Вилок - Тісабеч', checkpoint: 'Вилок - Тісабеч', country: 'Угорщина', countryCode: 'HU', aliases: ['вилок', 'тісабеч', 'тисабеч', 'tiszabecs', 'vilok'] },
  { username: 'dzvinkovelonya', label: 'Дзвінкове - Лонья', checkpoint: 'Дзвінкове - Лонья', country: 'Угорщина', countryCode: 'HU', aliases: ['дзвінкове', 'лонья', 'lonya', 'lónya', 'dzvinkove'] },
  { username: 'kosunopunkt', label: 'Косино - Барабаш', checkpoint: 'Косино - Барабаш', country: 'Угорщина', countryCode: 'HU', aliases: ['косино', 'барабаш', 'barabas', 'barabás', 'koson'] },
  // Moldova
  { username: 'Mohylivcheckpoint', label: 'Могилів-Подільський - Отачь', checkpoint: 'Могилів-Подільський - Отачь', country: 'Молдова', countryCode: 'MD', aliases: ['могилів подільський', 'могилев подольский', 'отач', 'отачь', 'otaci'] },
  { username: 'palankaudobne', label: 'Маяки-Удобне - Паланка', checkpoint: 'Маяки-Удобне - Паланка', country: 'Молдова', countryCode: 'MD', aliases: ['маяки', 'удобне', 'паланка', 'palanca'] },
  { username: 'Rossoshany', label: 'Россошани - Бричани', checkpoint: 'Россошани - Бричани', country: 'Молдова', countryCode: 'MD', aliases: ['россошани', 'росошани', 'бричани', 'briceni'] },
  { username: 'Mamalyhacheckpoint', label: 'Мамалига - Крива', checkpoint: 'Мамалига - Крива', country: 'Молдова', countryCode: 'MD', aliases: ['мамалига', 'крива', 'crivă', 'criva'] },
  { username: 'sokiryany', label: 'Сокиряни - Окниця', checkpoint: 'Сокиряни - Окниця', country: 'Молдова', countryCode: 'MD', aliases: ['сокиряни', 'окниця', 'ocnița', 'ocnita'] },
  { username: 'Bronnitsacheckpoint', label: 'Бронниця - Унгурь', checkpoint: 'Бронниця - Унгурь', country: 'Молдова', countryCode: 'MD', aliases: ['бронниця', 'унгурь', 'unguri'] }
].map(x => ({ ...x, kind: 'checkpoint_chat', channelUrl: `https://t.me/${x.username}` }));

export const GENERAL_SOURCES = [
  { username: 'ukrainianattheborder', label: 'Українці на кордоні', kind: 'general', channelUrl: 'https://t.me/ukrainianattheborder' },
  { username: 'zahidwtf_official', label: 'ZAHIDWTF 24/7', kind: 'general', channelUrl: 'https://t.me/zahidwtf_official' },
  { username: 'uzhgorod_21', label: '21 Ужгород', kind: 'general', channelUrl: 'https://t.me/uzhgorod_21' },
  { username: 'UADrivers', label: 'Водії України', kind: 'general', channelUrl: 'https://t.me/UADrivers' }
];

const SOURCES = [...CHAT_SOURCES, ...GENERAL_SOURCES];
const CHECKPOINTS = CHAT_SOURCES.map(({ checkpoint, country, countryCode, aliases }) => ({ checkpoint, country, countryCode, aliases }));

export function clean(value) {
  return String(value || '').toLowerCase()
    .replace(/[–—-]/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function findCheckpoint(text) {
  const key = clean(text);
  let best = null;
  for (const cp of CHECKPOINTS) {
    for (const alias of cp.aliases || []) {
      const normalized = clean(alias);
      if (normalized && key.includes(normalized) && (!best || normalized.length > best.aliasLen)) best = { ...cp, aliasLen: normalized.length };
    }
  }
  if (!best) return null;
  delete best.aliasLen;
  return best;
}

export function inferDirection(text) {
  const normalized = clean(text);
  if (!normalized) return null;
  const uaEu = [
    /виїзд з україни/, /виїзд із україни/, /з україни/, /из украины/, /выезд из украины/,
    /до польщі|до словаччини|до угорщини|до румунії|до молдови/,
    /на польщу|на словаччину|на угорщину|на румунію|на молдову/,
    /в польщу|в словаччину|в угорщину|в румунію|в молдову/,
    /в польшу|в словакию|в венгрию|в румынию|в молдову/,
    /у бік польщі|у бік словаччини|у бік угорщини|у бік румунії|у бік молдови/,
    /в сторону польши|в сторону словакии|в сторону венгрии|в сторону румынии|в сторону молдовы/
  ];
  const euUa = [
    /в їзд в україну/, /в їзд до україни/, /вїзд в україну/, /в їзд на україну/,
    /в україну/, /до україни/, /на україну/, /в украину/, /на украину/, /въезд в украину/,
    /з польщі|зі словаччини|з угорщини|з румунії|з молдови/,
    /из польши|из словакии|из венгрии|из румынии|из молдовы/
  ];
  const outbound = uaEu.some(regex => regex.test(normalized));
  const inbound = euUa.some(regex => regex.test(normalized));
  if (outbound === inbound) return null;
  return outbound ? 'UA_EU' : 'EU_UA';
}

export function parseWaitMin(text) {
  const value = String(text || '').toLowerCase();
  if (/(?:^|[^\p{L}])(?:пів\s*години|полчаса)(?=$|[^\p{L}])/iu.test(value)) return 30;
  let match = value.match(/(\d{1,2})\s*(?:год(?:ина|ини|ин)?|час(?:а|ов)?|h)\s*(?:(\d{1,2})\s*(?:хв(?:илин[аи]?|илини)?|мин(?:ут[ыа]?)?|min))?/i);
  if (match) return Number(match[1]) * 60 + Number(match[2] || 0);
  match = value.match(/(?:^|[^\d])(\d{1,3})\s*(?:хв(?:илин(?:а|и)?|илини)?|мин(?:ут(?:а|ы)?|ути)?|min)(?=$|[^\p{L}\p{N}])/iu);
  if (match) return Number(match[1]);
  match = value.match(/(?:очікуван\w*|чекал\w*|стоял\w*|пройшл\w*|проход\w*|перетнул\w*|черга\w*|очеред\w*)[^\n]{0,35}?(\d{1,2})[:.](\d{2})\b/i);
  if (match) return Number(match[1]) * 60 + Number(match[2]);
  return null;
}

export function parseQueueCars(text) {
  const match = String(text || '').match(/(?:^|[^\p{L}\p{N}])(\d{1,4})\s*(?:авто|автомобіл[\p{L}]*|машин[\p{L}]*|т\/?з)(?=$|[^\p{L}\p{N}])/iu);
  return match ? Number(match[1]) : null;
}

function signalLike(text) {
  return /черг|очеред|кордон|границ|кпп|пункт пропуск|авто|машин|територ|зелени|червон|проїх|проех|пройш|прошл|стої|стоим|стою|чека|жду|очіку|одразу|відразу|сразу|вільн|свобод/i.test(String(text || ''));
}

function messageText(message) {
  return String(message?.rawText || message?.message || message?.richText || '').replace(/\s+/g, ' ').trim();
}

function messageTimestampMs(message) {
  if (message?.date instanceof Date) return message.date.getTime();
  const seconds = Number(message?.date);
  return Number.isFinite(seconds) ? seconds * 1000 : NaN;
}

export function parseTelegramMessage(message, replyMessage, source, nowMs = Date.now()) {
  const text = messageText(message);
  if (!text) return null;
  const replyText = messageText(replyMessage);
  const checkpoint = source.kind === 'checkpoint_chat' ? source : findCheckpoint(`${text}\n${replyText}`);
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
  const id = Number(message?.id);
  if (!Number.isInteger(id) || id <= 0) return null;
  return {
    checkpoint: checkpoint.checkpoint,
    country: checkpoint.country,
    country_code: checkpoint.countryCode,
    direction,
    wait_min: waitMin,
    queue_cars: queueCars,
    updated_at: new Date(timestampMs).toISOString(),
    age_min: ageMin,
    note: text.slice(0, 260),
    reply_context: replyText ? replyText.slice(0, 180) : null,
    direction_basis: directionBasis,
    source_label: source.label,
    source_url: `https://t.me/${source.username}/${id}`,
    source_channel: source.username,
    channel_url: source.channelUrl || `https://t.me/${source.username}`,
    source_kind: source.kind,
    message_id: id,
    transport: 'mtproto',
    kind: 'human_report'
  };
}

function safeErrorCode(error) {
  const value = String(error?.errorMessage || error?.code || error?.name || 'telegram_error').toUpperCase();
  return value.replace(/[^A-Z0-9_-]/g, '_').replace(/_+/g, '_').slice(0, 72) || 'TELEGRAM_ERROR';
}

function credentials() {
  const apiId = Number(process.env.TELEGRAM_API_ID);
  const apiHash = String(process.env.TELEGRAM_API_HASH || '').trim();
  const session = String(process.env.TELEGRAM_SESSION || '').trim();
  return {
    apiId,
    apiHash,
    session,
    credentialsConfigured: Number.isSafeInteger(apiId) && apiId > 0 && Boolean(apiHash),
    sessionConfigured: Boolean(session)
  };
}

function fingerprintFor({ apiId, apiHash, session }) {
  return crypto.createHash('sha256').update(`${apiId}:${apiHash}:${session}`).digest('hex');
}

async function disconnectClient(client) {
  if (!client) return;
  try { await client.disconnect(); } catch {}
}

async function withTimeout(promise, timeoutMs, code) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error(code), { code })), timeoutMs); })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function makeClient(session, apiId, apiHash) {
  return new TelegramClient(new StringSession(session), apiId, apiHash, {
    connectionRetries: 3,
    reconnectRetries: 3,
    requestRetries: 2,
    retryDelay: 1_000,
    timeout: 12,
    autoReconnect: true,
    floodSleepThreshold: 8,
    baseLogger: new Logger('none'),
    deviceModel: 'Border Monitor UA',
    systemVersion: `Node ${process.versions.node}`,
    appVersion: '1.0',
    langCode: 'uk',
    systemLangCode: 'uk-UA'
  });
}

async function getAuthorizedClient() {
  const config = credentials();
  if (!config.credentialsConfigured) return { client: null, status: 'missing_credentials', ...config };
  if (!config.sessionConfigured) return { client: null, status: 'not_configured', ...config };
  const fingerprint = fingerprintFor(config);
  if (clientState.fingerprint !== fingerprint) {
    await disconnectClient(clientState.client);
    clientState = { fingerprint, client: null, connectPromise: null, authorized: false, error: null };
  }
  if (clientState.client && clientState.authorized && clientState.client.connected) return { client: clientState.client, status: 'connected', ...config };
  if (!clientState.connectPromise) {
    clientState.connectPromise = (async () => {
      const client = makeClient(config.session, config.apiId, config.apiHash);
      try {
        await withTimeout(client.connect(), CONNECTION_TIMEOUT_MS, 'TELEGRAM_CONNECT_TIMEOUT');
        const authorized = await withTimeout(client.checkAuthorization(), CONNECTION_TIMEOUT_MS, 'TELEGRAM_AUTH_TIMEOUT');
        if (!authorized) throw Object.assign(new Error('Telegram session is not authorized'), { code: 'SESSION_UNAUTHORIZED' });
        clientState.client = client;
        clientState.authorized = true;
        clientState.error = null;
        return client;
      } catch (error) {
        clientState.authorized = false;
        clientState.error = safeErrorCode(error);
        await disconnectClient(client);
        throw error;
      } finally {
        clientState.connectPromise = null;
      }
    })();
  }
  try {
    const client = await clientState.connectPromise;
    return { client, status: 'connected', ...config };
  } catch (error) {
    return { client: null, status: 'error', error: safeErrorCode(error), ...config };
  }
}

async function fetchSource(client, source, nowMs) {
  try {
    const entity = await client.getEntity(source.username);
    const messages = await client.getMessages(entity, { limit: MESSAGE_LIMIT });
    const recent = [...messages].filter(message => {
      const timestampMs = messageTimestampMs(message);
      return Number.isFinite(timestampMs) && timestampMs <= nowMs + 60_000 && nowMs - timestampMs <= (MAX_AGE_MIN + 5) * 60_000;
    });
    const byId = new Map(recent.map(message => [Number(message.id), message]));
    const missingReplyIds = [...new Set(recent.map(message => Number(message.replyToMsgId)).filter(id => Number.isInteger(id) && id > 0 && !byId.has(id)))].slice(0, 40);
    if (missingReplyIds.length) {
      const replies = await client.getMessages(entity, { ids: missingReplyIds });
      for (const reply of replies) if (reply?.id) byId.set(Number(reply.id), reply);
    }
    const items = recent.map(message => parseTelegramMessage(message, byId.get(Number(message.replyToMsgId)), source, nowMs)).filter(Boolean);
    return {
      source,
      items,
      status: 'connected',
      messagesScanned: recent.length,
      newestMessageAt: recent.length ? new Date(messageTimestampMs(recent[0])).toISOString() : null
    };
  } catch (error) {
    return { source, items: [], status: 'error', messagesScanned: 0, newestMessageAt: null, error: safeErrorCode(error) };
  }
}

async function fetchInBatches(client, sources, nowMs) {
  const output = [];
  for (let index = 0; index < sources.length; index += CONCURRENCY) {
    const batch = await Promise.all(sources.slice(index, index + CONCURRENCY).map(source => fetchSource(client, source, nowMs)));
    output.push(...batch);
  }
  return output;
}

export function dedupeAndLimit(items) {
  const seen = new Set();
  const perDirection = new Map();
  return [...items].sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at)).filter(item => {
    const uniqueKey = `${item.source_channel}|${item.message_id || item.source_url}`;
    if (seen.has(uniqueKey)) return false;
    seen.add(uniqueKey);
    const groupKey = `${item.checkpoint}|${item.direction}`;
    const count = perDirection.get(groupKey) || 0;
    if (count >= MAX_REPORTS_PER_DIRECTION) return false;
    perDirection.set(groupKey, count + 1);
    return true;
  });
}

function sourceMeta(result, fallbackStatus) {
  const source = result.source;
  return {
    channel: source.username,
    channelUrl: source.channelUrl || `https://t.me/${source.username}`,
    label: source.label,
    kind: source.kind,
    checkpoint: source.checkpoint || null,
    country: source.country || null,
    countryCode: source.countryCode || null,
    aliases: source.aliases || [],
    status: result.status || fallbackStatus,
    items: result.items?.length || 0,
    messagesScanned: result.messagesScanned || 0,
    newestMessageAt: result.newestMessageAt || null,
    error: result.error || null
  };
}

async function refresh() {
  const nowMs = Date.now();
  const connection = await getAuthorizedClient();
  if (!connection.client) {
    const payload = {
      ok: true,
      generatedAt: new Date(nowMs).toISOString(),
      cacheMinutes: TTL_MS / 60_000,
      maxAgeMinutes: MAX_AGE_MIN,
      mode: 'mtproto',
      status: connection.status,
      credentialsConfigured: connection.credentialsConfigured,
      sessionConfigured: connection.sessionConfigured,
      authorized: false,
      items: [],
      sources: SOURCES.map(source => sourceMeta({ source, status: connection.status, error: connection.error || null }, connection.status))
    };
    cache = { ts: nowMs, payload };
    console.log('[telegram-mtproto]', JSON.stringify({ status: payload.status, sources: SOURCES.length, connected: 0, items: 0, checkpointChats: CHAT_SOURCES.length }));
    return payload;
  }
  const results = await fetchInBatches(connection.client, SOURCES, nowMs);
  const items = dedupeAndLimit(results.flatMap(result => result.items));
  const connected = results.filter(result => result.status === 'connected').length;
  const status = connected === SOURCES.length ? 'connected' : connected > 0 ? 'partial' : 'error';
  const payload = {
    ok: true,
    generatedAt: new Date(nowMs).toISOString(),
    cacheMinutes: TTL_MS / 60_000,
    maxAgeMinutes: MAX_AGE_MIN,
    mode: 'mtproto',
    status,
    credentialsConfigured: true,
    sessionConfigured: true,
    authorized: true,
    items,
    sources: results.map(result => sourceMeta(result, 'error'))
  };
  cache = { ts: nowMs, payload };
  console.log('[telegram-mtproto]', JSON.stringify({ status, sources: SOURCES.length, connected, items: items.length, checkpointChats: CHAT_SOURCES.length }));
  return payload;
}

export async function getTelegramSnapshot() {
  if (cache.payload && Date.now() - cache.ts < TTL_MS) return { ...cache.payload, fromCache: true };
  if (!refreshPromise) refreshPromise = refresh().finally(() => { refreshPromise = null; });
  const payload = await refreshPromise;
  return { ...payload, fromCache: false };
}

export function clearTelegramCache() {
  cache = { ts: 0, payload: null };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  const expected = process.env.TELEGRAM_READER_TOKEN;
  if (expected) {
    const auth = String(req.headers?.authorization || '');
    if (auth !== `Bearer ${expected}`) return res.status(401).json({ ok: false, error: 'unauthorized' });
  }
  const payload = await getTelegramSnapshot();
  return res.status(200).json(payload);
}
