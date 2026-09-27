const SOURCE_TTL_MS = 3 * 60 * 1000;
const MAX_AGE_MIN = 180;
const MESSAGE_LIMIT = 60;
const MAX_REPORTS_PER_DIRECTION = 3;
const CONCURRENCY = 1;
const REQUEST_TIMEOUT_MS = 20_000;
const CONTEXT_DIRECTION_MAX_GAP_MS = 45 * 60 * 1000;
const CONTEXT_DIRECTION_STRONG_SIGNAL_MAX_GAP_MS = 120 * 60 * 1000;

const peerCache = new Map();
const sourceCache = new Map();
const sourceInflight = new Map();
let fullRefreshPromise = null;
let quotaState = { remaining: null, observedAt: null };

export const CHAT_SOURCES = [
  { username: 'Krakivets', peerId: 1561698401, label: 'Краківець - Корчова', checkpoint: 'Краківець - Корчова', country: 'Польща', countryCode: 'PL', aliases: ['краківець', 'краковець', 'корчова', 'korczowa'] },
  { username: 'shegunimeduka', peerId: 1749456888, label: 'Шегині - Медика', checkpoint: 'Шегині - Медика', country: 'Польща', countryCode: 'PL', aliases: ['шегині', 'медика', 'medyka'] },
  { username: 'rawahrebenne', peerId: 1684314020, label: 'Рава-Руська - Гребенне', checkpoint: 'Рава-Руська - Гребенне', country: 'Польща', countryCode: 'PL', aliases: ['рава руська', 'рава-руська', 'гребенне', 'hrebenne'] },
  { username: 'ustylug', peerId: 1664739209, label: 'Устилуг - Зосин', checkpoint: 'Устилуг - Зосин', country: 'Польща', countryCode: 'PL', aliases: ['устилуг', 'зосин', 'zosin'] },
  { username: 'ugryniv', peerId: 1782023696, label: 'Угринів - Долгобичув', checkpoint: 'Угринів - Долгобичув', country: 'Польща', countryCode: 'PL', aliases: ['угринів', 'долгобичув', 'dolhobyczow', 'dołhobyczów'] },
  { username: 'hryshiv', peerId: 1713079377, label: 'Грушів - Будоміж', checkpoint: 'Грушів - Будоміж', country: 'Польща', countryCode: 'PL', aliases: ['грушів', 'будоміж', 'будомєж', 'budomierz'] },
  { username: 'yagodyn', peerId: 1681870274, label: 'Ягодин - Дорогуск', checkpoint: 'Ягодин - Дорогуск', country: 'Польща', countryCode: 'PL', aliases: ['ягодин', 'дорогуск', 'dorohusk'] },
  { username: 'smilnutsa', peerId: 1669374249, label: 'Смільниця - Кросценко', checkpoint: 'Смільниця - Кросценко', country: 'Польща', countryCode: 'PL', aliases: ['смільниця', 'кросценко', 'kroscienko', 'krościenko'] },
  { username: 'nyzhankovychi', peerId: 2377629189, label: 'Нижанковичі - Мальховичі', checkpoint: 'Нижанковичі - Мальховичі', country: 'Польща', countryCode: 'PL', aliases: ['nyzhankovychi', 'нижанковичі', 'мальховичі', 'malhowice'] },
  { username: 'maluibereznui', peerId: 1784524649, label: 'Малий Березний - Убля', checkpoint: 'Малий Березний - Убля', country: 'Словаччина', countryCode: 'SK', aliases: ['малий березний', 'убля', 'ubla', 'ubľa'] },
  { username: 'uzhorodqueue', peerId: 1767036280, label: 'Ужгород - Вишнє Нємецьке', checkpoint: 'Ужгород - Вишнє Нємецьке', country: 'Словаччина', countryCode: 'SK', aliases: ['ужгород', 'вишнє немецьке', 'вишнє нємецьке', 'vysne nemecke', 'vyšné nemecké'] },
  { username: 'MaliSelmentsi', peerId: 1596646776, label: 'Малі Селменці - Вельке Слеменце', checkpoint: 'Малі Селменці - Вельке Слеменце', country: 'Словаччина', countryCode: 'SK', aliases: ['малі селменці', 'вельке слеменце', 'velke slemence', 'veľké slemence'] },
  { username: 'parubne', peerId: 1873120038, label: 'Порубне - Сірет', checkpoint: 'Порубне - Сірет', country: 'Румунія', countryCode: 'RO', aliases: ['порубне', 'сірет', 'сирет', 'siret'] },
  { username: 'solotkino', peerId: 1739833078, label: 'Солотвино - Сігету Мармацієй', checkpoint: 'Солотвино - Сігету Мармацієй', country: 'Румунія', countryCode: 'RO', aliases: ['солотвино', 'сігету', 'сигету', 'sighetu'] },
  { username: 'diakove', peerId: 1741931504, label: 'Дякове - Халмеу', checkpoint: 'Дякове - Халмеу', country: 'Румунія', countryCode: 'RO', aliases: ['дякове', 'халмеу', 'halmeu'] },
  { username: 'diakivchi', peerId: 1830834577, label: 'Дяківці - Раковець', checkpoint: 'Дяківці - Раковець', country: 'Румунія', countryCode: 'RO', aliases: ['дяківці', 'раковець', 'racovat', 'racovăț'] },
  { username: 'krasnoyilsk', peerId: 1539991687, label: 'Красноїльськ - Вікову де Сус', checkpoint: 'Красноїльськ - Вікову де Сус', country: 'Румунія', countryCode: 'RO', aliases: ['красноїльськ', 'красноільськ', 'вікову', 'vicovu'] },
  { username: 'bilacerkvasigetumarmatiei', peerId: 4361955950, label: 'Біла Церква - Сігету-Мармацієй', checkpoint: 'Біла Церква - Сігету-Мармацієй', country: 'Румунія', countryCode: 'RO', aliases: ['біла церква', 'сігету', 'сигету', 'sighetu'] },
  { username: 'lugankabereg', peerId: 1656001875, label: 'Лужанка - Берегшурань', checkpoint: 'Лужанка - Берегшурань', country: 'Угорщина', countryCode: 'HU', aliases: ['лужанка', 'берегшурань', 'beregsurany', 'beregsurány', 'астей'] },
  { username: 'chopzahon', peerId: 1481395430, label: 'Чоп (Тиса) - Захонь', checkpoint: 'Чоп (Тиса) - Захонь', country: 'Угорщина', countryCode: 'HU', aliases: ['чоп', 'тиса', 'захонь', 'zahony', 'záhony'] },
  { username: 'viloktisabech', peerId: 1770808982, label: 'Вилок - Тісабеч', checkpoint: 'Вилок - Тісабеч', country: 'Угорщина', countryCode: 'HU', aliases: ['вилок', 'тісабеч', 'тисабеч', 'tiszabecs', 'vilok'] },
  { username: 'dzvinkovelonya', peerId: 1661124024, label: 'Дзвінкове - Лонья', checkpoint: 'Дзвінкове - Лонья', country: 'Угорщина', countryCode: 'HU', aliases: ['дзвінкове', 'лонья', 'lonya', 'lónya', 'dzvinkove'] },
  { username: 'kosunopunkt', peerId: 1532406932, label: 'Косино - Барабаш', checkpoint: 'Косино - Барабаш', country: 'Угорщина', countryCode: 'HU', aliases: ['косино', 'барабаш', 'barabas', 'barabás', 'koson'] },
  { username: 'Mohylivcheckpoint', peerId: 1765698625, label: 'Могилів-Подільський - Отачь', checkpoint: 'Могилів-Подільський - Отачь', country: 'Молдова', countryCode: 'MD', aliases: ['могилів подільський', 'могилев подольский', 'отач', 'отачь', 'otaci'] },
  { username: 'palankaudobne', peerId: 2247255178, label: 'Маяки-Удобне - Паланка', checkpoint: 'Маяки-Удобне - Паланка', country: 'Молдова', countryCode: 'MD', aliases: ['маяки', 'удобне', 'паланка', 'palanca'] },
  { username: 'Rossoshany', peerId: 1639876515, label: 'Россошани - Бричани', checkpoint: 'Россошани - Бричани', country: 'Молдова', countryCode: 'MD', aliases: ['россошани', 'росошани', 'бричани', 'briceni'] },
  { username: 'Mamalyhacheckpoint', peerId: 1741076173, label: 'Мамалига - Крива', checkpoint: 'Мамалига - Крива', country: 'Молдова', countryCode: 'MD', aliases: ['мамалига', 'крива', 'crivă', 'criva'] },
  { username: 'sokiryany', peerId: 1553828806, label: 'Сокиряни - Окниця', checkpoint: 'Сокиряни - Окниця', country: 'Молдова', countryCode: 'MD', aliases: ['сокиряни', 'окниця', 'ocnița', 'ocnita'] },
  { username: 'Bronnitsacheckpoint', peerId: 1415316943, label: 'Бронниця - Унгурь', checkpoint: 'Бронниця - Унгурь', country: 'Молдова', countryCode: 'MD', aliases: ['бронниця', 'унгурь', 'unguri'] }
].map(x => ({ ...x, kind: 'checkpoint_chat', channelUrl: `https://t.me/${x.username}` }));

export const GENERAL_SOURCES = [
  { username: 'ukrainianattheborder', peerId: 1745721987, label: 'Українці на кордоні', kind: 'general', channelUrl: 'https://t.me/ukrainianattheborder' },
  { username: 'zahidwtf_official', peerId: 1410990532, label: 'ZAHIDWTF 24/7', kind: 'general', channelUrl: 'https://t.me/zahidwtf_official' },
  { username: 'uzhgorod_21', peerId: 1687563086, label: '21 Ужгород', kind: 'general', channelUrl: 'https://t.me/uzhgorod_21' },
  { username: 'UADrivers', peerId: 1368206617, label: 'Водії України', kind: 'general', channelUrl: 'https://t.me/UADrivers' }
];

const SOURCES = [...CHAT_SOURCES, ...GENERAL_SOURCES];
const CHECKPOINTS = CHAT_SOURCES.map(({ checkpoint, country, countryCode, aliases }) => ({ checkpoint, country, countryCode, aliases }));

export function clean(value) {
  return String(value || '').toLowerCase().replace(/[–—-]/g, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
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
  const clocks = [...value.matchAll(/(?:^|[^\d])([01]?\d|2[0-3])[:.]([0-5]\d)(?=$|[^\d])/g)].map(m => Number(m[1]) * 60 + Number(m[2]));
  const hasStart = /(під.?їх|приїх|прибул|стал|заїх|подъех|приех|прибыл|встал)/i.test(value);
  const hasEnd = /(пройш|проїх|перетнул|виїх|закінчил|прошл|проех|пересек|выех)/i.test(value);
  if (clocks.length >= 2 && hasStart && hasEnd) {
    let elapsed = clocks[clocks.length - 1] - clocks[0];
    if (elapsed < 0) elapsed += 24 * 60;
    if (elapsed > 0 && elapsed <= 12 * 60) return elapsed;
  }
  return null;
}

export function parseQueueCars(text) {
  const match = String(text || '').match(/(?:^|[^\p{L}\p{N}])(\d{1,4})\s*(?:авто|автомобіл[\p{L}]*|машин[\p{L}]*|т\/?з)(?=$|[^\p{L}\p{N}])/iu);
  return match ? Number(match[1]) : null;
}

function signalLike(text) {
  return /черг|очеред|кордон|границ|кпп|пункт пропуск|авто|машин|територ|зелени|червон|проїх|проех|пройш|прошл|стої|стоим|стою|чека|жду|очіку|одразу|відразу|сразу|вільн|свобод/i.test(String(text || ''));
}

export function strongQueueStatement(text) {
  const raw = String(text || '').trim();
  if (!raw || questionLike(raw)) return false;
  const normalized = clean(raw);
  return /(без черги|нема черги|немає черги|черги нема|черги немає|очереди нет|без очереди|пусто|вільно|свободно|одразу|відразу|сразу|велика черга|довга черга|черга велика|черга довга|большая очередь|длинная очередь)/u.test(normalized);
}

function questionLike(text) {
  const raw = String(text || '').trim();
  if (!raw) return false;
  if (/[?？]/.test(raw)) return true;
  const normalized = clean(raw);
  return /(?:^|\s)(?:підкажіть|підкажи|підскажіть|подскажите|скажіть|скажи|скажите|хто\s+знає|кто\s+знает|яка|який|які|какая|какой|какие|скільки|сколько)(?:\s|$)/u.test(normalized);
}

function queueQuestionLike(text) {
  if (!questionLike(text)) return false;
  return /черг|очеред|авто|машин|скільки|сколько/i.test(String(text || ''));
}

function advertisementLike(text) {
  const raw = String(text || '');
  const promo = /реклам|донат|аеропорт|аэропорт|катовіц|katowice|індивідуаль|индивидуаль|трансфер|таксі|такси|перевез|підвез|подвез/i.test(raw);
  const phone = /(?:\+?\d[\s()\-.]*){9,}/.test(raw);
  const explicitAd = /рекламне повідомлення|реклама в чатах|розміщення реклами|для замовлення.{0,60}реклам/i.test(raw);
  return promo && (phone || explicitAd);
}

export function shortQueueReplyLike(text, replyText) {
  if (!queueQuestionLike(replyText)) return false;
  const normalized = clean(text);
  return /^(?:нема|немає|нет|ні|нікого|пусто|нуль|0|без черги|черги нема|черги немає|очереди нет|без очереди)$/u.test(normalized);
}

function parseContextQueueCars(text, replyText, contextDirection) {
  const queueContext = queueQuestionLike(replyText) || Boolean(contextDirection?.queueIntent);
  if (!queueContext) return null;
  const raw = String(text || '').trim().toLowerCase();
  let match = raw.match(/^(?:десь|приблизно|прибл\.?|около|примерно|біля|до|~)?\s*(\d{1,3})\s*[-–—]\s*(\d{1,3})\s*(?:шт\.?|авто|машин[\p{L}]*)?$/iu);
  if (match) return Math.max(Number(match[1]), Number(match[2]));
  match = raw.match(/^(?:десь|приблизно|прибл\.?|около|примерно|біля|до|~)?\s*(\d{1,3})\s*(?:шт\.?|авто|машин[\p{L}]*)?$/iu);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value <= 500 ? value : null;
}

function directionFromPair(text, replyText) {
  const fromMessage = inferDirection(text);
  if (fromMessage) return { direction: fromMessage, basis: 'message' };
  const fromReply = replyText ? inferDirection(replyText) : null;
  if (fromReply) return { direction: fromReply, basis: 'reply' };
  return null;
}

function messageText(message) {
  return String(message?.rawText || message?.message || message?.text || message?.caption || message?.richText || '').replace(/\s+/g, ' ').trim();
}

function messageTimestampMs(message) {
  if (message?.date instanceof Date) return message.date.getTime();
  const numeric = Number(message?.date);
  if (Number.isFinite(numeric)) return numeric > 10_000_000_000 ? numeric : numeric * 1000;
  const parsed = Date.parse(String(message?.date || ''));
  return Number.isFinite(parsed) ? parsed : NaN;
}

export function parseTelegramMessage(message, replyMessage, source, nowMs = Date.now(), contextDirection = null) {
  const text = messageText(message);
  if (!text) return null;
  const replyText = messageText(replyMessage);
  const checkpoint = source.kind === 'checkpoint_chat' ? source : findCheckpoint(`${text}\n${replyText}`);
  if (!checkpoint) return null;
  const direct = directionFromPair(text, replyText);
  let direction = direct?.direction || null;
  let directionBasis = direct?.basis || null;
  const timestampMs = messageTimestampMs(message);
  if (!Number.isFinite(timestampMs)) return null;
  let effectiveContext = null;
  if (contextDirection?.direction && Number.isFinite(Number(contextDirection?.ts))) {
    const gapMs = timestampMs - Number(contextDirection.ts);
    const maxGapMs = strongQueueStatement(text) ? CONTEXT_DIRECTION_STRONG_SIGNAL_MAX_GAP_MS : CONTEXT_DIRECTION_MAX_GAP_MS;
    if (gapMs >= 0 && gapMs <= maxGapMs) effectiveContext = contextDirection;
  }
  if (!direction && source.kind === 'checkpoint_chat' && effectiveContext?.direction) {
    direction = effectiveContext.direction;
    directionBasis = 'context';
  }
  if (!direction) return null;
  const ageMin = Math.max(0, Math.round((nowMs - timestampMs) / 60_000));
  if (ageMin > MAX_AGE_MIN) return null;
  if (questionLike(text)) return null;
  const waitMin = parseWaitMin(text);
  const queueCars = parseQueueCars(text) ?? parseContextQueueCars(text, replyText, effectiveContext);
  const shortQueueReply = shortQueueReplyLike(text, replyText);
  if (advertisementLike(text) && waitMin == null && queueCars == null) return null;
  if (waitMin == null && queueCars == null && !signalLike(text) && !shortQueueReply) return null;
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
    transport: 'tgatlas',
    kind: 'human_report'
  };
}

function safeErrorCode(error) {
  const value = String(error?.code || error?.name || error?.message || 'tgatlas_error').toUpperCase();
  return value.replace(/[^A-Z0-9_-]/g, '_').replace(/_+/g, '_').slice(0, 72) || 'TGATLAS_ERROR';
}

function config() {
  const key = String(process.env.TGATLAS_RAPIDAPI_KEY || '').trim();
  const host = String(process.env.TGATLAS_RAPIDAPI_HOST || 'telegram155.p.rapidapi.com').trim();
  return { key, host, configured: Boolean(key) };
}

async function apiGet(pathname, params = {}) {
  const { key, host, configured } = config();
  if (!configured) throw Object.assign(new Error('TGATLAS_NOT_CONFIGURED'), { code: 'TGATLAS_NOT_CONFIGURED' });
  if (quotaState.remaining != null && quotaState.remaining < 25) throw Object.assign(new Error('TGATLAS_QUOTA_LOW'), { code: 'TGATLAS_QUOTA_LOW' });
  const url = new URL(`https://${host}${pathname}`);
  for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, String(v));
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        headers: { 'x-rapidapi-key': key, 'x-rapidapi-host': host, accept: 'application/json' },
        cache: 'no-store', signal: ctl.signal
      });
      let requestRemaining = null;
      for (const name of ['x-ratelimit-requests-remaining', 'x-ratelimit-rapid-free-plans-hard-limit-remaining', 'x-ratelimit-rapid-free-plans-remaining']) {
        const value = Number(response.headers.get(name));
        if (Number.isFinite(value)) { requestRemaining = value; break; }
      }
      const metric = prefix => {
        const value = name => { const n = Number(response.headers.get(name)); return Number.isFinite(n) ? n : null; };
        return { limit: value(`x-ratelimit-${prefix}-limit`), remaining: value(`x-ratelimit-${prefix}-remaining`), reset: value(`x-ratelimit-${prefix}-reset`) };
      };
      quotaState = {
        remaining: requestRemaining,
        observedAt: new Date().toISOString(),
        requests: metric('requests'),
        lookups: metric('lookups'),
        phone: metric('phone')
      };
      const body = await response.json().catch(() => null);
      if (response.status === 429 && attempt < 4) {
        const retryHeader = Number(response.headers.get('retry-after'));
        const waitMs = Number.isFinite(retryHeader) && retryHeader > 0 ? retryHeader * 1000 : Math.min(12_000, 1800 * (attempt + 1));
        await new Promise(resolve => setTimeout(resolve, waitMs));
        continue;
      }
      if (!response.ok || body?.error) {
        const code = body?.code || `HTTP_${response.status}`;
        throw Object.assign(new Error(code), { code });
      }
      return body || {};
    } finally {
      clearTimeout(timer);
    }
  }
  throw Object.assign(new Error('HTTP_429'), { code: 'HTTP_429' });
}

function sourceByUsername(username) {
  const key = String(username || '').replace(/^@/, '').toLowerCase();
  return SOURCES.find(source => source.username.toLowerCase() === key) || null;
}

async function resolvePeer(source) {
  const cacheKey = source.username.toLowerCase();
  const cached = peerCache.get(cacheKey);
  if (cached) return cached;
  const staticId = Number(source.peerId);
  if (Number.isSafeInteger(staticId) && staticId > 0) {
    const value = { id: staticId, title: source.label, static: true };
    peerCache.set(cacheKey, value);
    return value;
  }
  const body = await apiGet(`/v1/usernames/${encodeURIComponent(source.username)}`);
  const candidates = [...(Array.isArray(body?.chats) ? body.chats : []), ...(Array.isArray(body?.users) ? body.users : [])];
  const wanted = source.username.toLowerCase();
  const peer = candidates.find(item => String(item?.username || '').toLowerCase() === wanted || (item?.usernames || []).some(u => String(u?.username || '').toLowerCase() === wanted)) || candidates[0];
  const id = Number(peer?.id);
  if (!Number.isSafeInteger(id) || id <= 0) throw Object.assign(new Error('TGATLAS_PEER_NOT_FOUND'), { code: 'TGATLAS_PEER_NOT_FOUND' });
  const value = { id, title: peer?.title || peer?.first_name || source.label };
  peerCache.set(source.username.toLowerCase(), value);
  return value;
}

function normalizeMessage(message) {
  const replyToMsgId = Number(message?.replyToMsgId ?? message?.reply_to_msg_id ?? message?.reply_to?.reply_to_msg_id ?? message?.reply_to?.msg_id ?? 0) || null;
  return {
    ...message,
    id: Number(message?.id),
    date: message?.date,
    message: messageText(message),
    replyToMsgId
  };
}

async function fetchSource(source, force = false) {
  const key = source.username.toLowerCase();
  const cached = sourceCache.get(key);
  if (!force && cached && Date.now() - cached.ts < SOURCE_TTL_MS) return cached.result;
  try {
    let peer = await resolvePeer(source);
    let body;
    try {
      body = await apiGet(`/v1/peers/${peer.id}/history`, { limit: MESSAGE_LIMIT });
    } catch (error) {
      if (error?.code !== 'RESOURCE_UNAVAILABLE') throw error;
      peerCache.delete(key);
      await new Promise(resolve => setTimeout(resolve, 900));
      peer = await resolvePeer(source);
      await new Promise(resolve => setTimeout(resolve, 600));
      body = await apiGet(`/v1/peers/${peer.id}/history`, { limit: MESSAGE_LIMIT });
    }
    const messages = (Array.isArray(body?.messages) ? body.messages : []).map(normalizeMessage).filter(m => Number.isInteger(m.id) && m.id > 0);
    const byId = new Map(messages.map(m => [m.id, m]));
    const nowMs = Date.now();
    const chronological = [...messages].sort((a, b) => messageTimestampMs(a) - messageTimestampMs(b));
    const items = [];
    let contextDirection = null;
    for (const message of chronological) {
      const replyMessage = byId.get(message.replyToMsgId);
      const timestampMs = messageTimestampMs(message);
      const text = messageText(message);
      const replyText = messageText(replyMessage);
      const direct = directionFromPair(text, replyText);
      if (direct?.direction && Number.isFinite(timestampMs)) {
        contextDirection = { direction: direct.direction, ts: timestampMs, queueIntent: queueQuestionLike(text) || queueQuestionLike(replyText) };
      } else if (contextDirection && queueQuestionLike(text) && Number.isFinite(timestampMs)) {
        contextDirection = { ...contextDirection, ts: timestampMs, queueIntent: true };
      }
      const parsed = parseTelegramMessage(message, replyMessage, source, nowMs, contextDirection);
      if (parsed) items.push(parsed);
    }
    const timestamps = messages.map(messageTimestampMs).filter(Number.isFinite);
    const result = {
      source, items, status: 'connected', messagesScanned: messages.length,
      newestMessageAt: timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : null,
      peerId: peer.id
    };
    sourceCache.set(key, { ts: Date.now(), result });
    return result;
  } catch (error) {
    const result = { source, items: [], status: 'error', messagesScanned: 0, newestMessageAt: null, error: safeErrorCode(error) };
    sourceCache.set(key, { ts: Date.now(), result });
    return result;
  }
}


async function fetchSourceDeduped(source, force = false) {
  const key = String(source?.username || '').toLowerCase();
  if (!key) return fetchSource(source, force);
  const existing = sourceInflight.get(key);
  if (existing) return existing;
  const task = Promise.resolve(fetchSource(source, force)).finally(() => sourceInflight.delete(key));
  sourceInflight.set(key, task);
  return task;
}
async function fetchInBatches(sources, force = false) {
  const output = [];
  for (let index = 0; index < sources.length; index += CONCURRENCY) {
    const batch = await Promise.all(sources.slice(index, index + CONCURRENCY).map(source => fetchSourceDeduped(source, force)));
    output.push(...batch);
    if (index + CONCURRENCY < sources.length) await new Promise(resolve => setTimeout(resolve, 700));
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

function currentItem(item, nowMs = Date.now()) {
  const ms = Date.parse(item.updated_at);
  if (!Number.isFinite(ms)) return null;
  const age = Math.max(0, Math.round((nowMs - ms) / 60_000));
  if (age > MAX_AGE_MIN) return null;
  return { ...item, age_min: age };
}

function sourceMeta(result, fallbackStatus = 'available') {
  const source = result.source;
  const freshItems = (result.items || []).map(item => currentItem(item)).filter(Boolean);
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
    items: freshItems.length,
    messagesScanned: result.messagesScanned || 0,
    newestMessageAt: result.newestMessageAt || null,
    peerId: result.peerId || null,
    error: result.error || null
  };
}

function buildPayload(results = [], requested = null) {
  const { configured } = config();
  const byUser = new Map(results.map(result => [result.source.username.toLowerCase(), result]));
  for (const source of SOURCES) {
    const cached = sourceCache.get(source.username.toLowerCase());
    if (!byUser.has(source.username.toLowerCase()) && cached) byUser.set(source.username.toLowerCase(), cached.result);
  }
  const allResults = SOURCES.map(source => byUser.get(source.username.toLowerCase()) || { source, status: configured ? 'available' : 'missing_credentials', items: [] });
  const items = dedupeAndLimit(allResults.flatMap(result => (result.items || []).map(item => currentItem(item)).filter(Boolean)));
  const connected = allResults.filter(result => result.status === 'connected').length;
  const errors = allResults.filter(result => result.status === 'error').length;
  const status = !configured ? 'missing_credentials' : connected === SOURCES.length ? 'connected' : connected > 0 ? 'partial' : errors ? 'error' : 'available';
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    cacheMinutes: SOURCE_TTL_MS / 60_000,
    maxAgeMinutes: MAX_AGE_MIN,
    mode: 'tgatlas',
    status,
    credentialsConfigured: configured,
    sessionConfigured: false,
    authorized: configured,
    requested,
    items,
    sources: allResults.map(result => sourceMeta(result, configured ? 'available' : 'missing_credentials')),
    quota: quotaState.remaining == null ? null : quotaState
  };
}

export async function getTelegramSnapshot(options = {}) {
  const username = options?.username ? String(options.username).replace(/^@/, '') : null;
  if (username) {
    const source = sourceByUsername(username);
    if (!source) return { ...buildPayload(), ok: false, error: 'unknown_source' };
    const result = await fetchSourceDeduped(source, Boolean(options.force));
    return buildPayload([result], source.username);
  }
  if (options?.full) {
    if (!fullRefreshPromise) fullRefreshPromise = fetchInBatches(SOURCES, true).finally(() => { fullRefreshPromise = null; });
    const results = await fullRefreshPromise;
    return buildPayload(results, 'full');
  }
  return buildPayload();
}

export function clearTelegramCache() {
  sourceCache.clear();
}

function publicSnapshot(payload) {
  return {
    ok: payload?.ok !== false,
    generatedAt: payload?.generatedAt || new Date().toISOString(),
    cacheMinutes: payload?.cacheMinutes ?? null,
    maxAgeMinutes: payload?.maxAgeMinutes ?? null,
    status: payload?.status || 'unknown',
    requested: payload?.requested || null,
    error: payload?.ok === false ? (payload?.error || 'not_found') : undefined,
    items: Array.isArray(payload?.items) ? payload.items : [],
    sources: Array.isArray(payload?.sources) ? payload.sources.map(({peerId,error,...rest}) => rest) : []
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  const username = req.query?.username ? String(req.query.username).slice(0, 80) : null;
  if (req.query?.full === '1') return res.status(403).json({ ok: false, error: 'full_probe_disabled' });
  const payload = await getTelegramSnapshot({ username, full: false, force: false });
  return res.status(payload.ok === false ? 404 : 200).json(publicSnapshot(payload));
}
