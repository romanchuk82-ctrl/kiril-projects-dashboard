const UA = {
  'User-Agent': 'Mozilla/5.0 (compatible; BorderMonitorUA/1.0; +https://border-monitor-ua.onrender.com)',
  'Accept': 'text/html,application/xhtml+xml'
};

const TTL_MS = 5 * 60 * 1000;
const MAX_AGE_MIN = 180;
let cache = { ts: 0, payload: null };

const CHANNELS = [
  { username: 'ukrainianattheborder', label: 'Українці на кордоні' },
  { username: 'zahidwtf_official', label: 'ZAHIDWTF 24/7' },
  { username: 'uzhgorod_21', label: '21 Ужгород' },
  { username: 'UADrivers', label: 'Водії України' }
];

const CHECKPOINTS = [
  { checkpoint: 'Шегині - Медика', country: 'Польща', countryCode: 'PL', aliases: ['шегині','медика','medyka'] },
  { checkpoint: 'Краківець - Корчова', country: 'Польща', countryCode: 'PL', aliases: ['краківець','краковець','корчова','korczowa'] },
  { checkpoint: 'Грушів - Будомєж', country: 'Польща', countryCode: 'PL', aliases: ['грушів','будомєж','budomierz'] },
  { checkpoint: 'Рава-Руська - Гребенне', country: 'Польща', countryCode: 'PL', aliases: ['рава руська','рава-руська','гребенне','hrebenne'] },
  { checkpoint: 'Устилуг - Зосин', country: 'Польща', countryCode: 'PL', aliases: ['устилуг','зосин','zosin'] },
  { checkpoint: 'Угринів - Долгобичув', country: 'Польща', countryCode: 'PL', aliases: ['угринів','долгобичув','dolhobyczow','dołhobyczów'] },
  { checkpoint: 'Смільниця - Кросценко', country: 'Польща', countryCode: 'PL', aliases: ['смільниця','кросценко','kroscienko','krościenko'] },
  { checkpoint: 'Нижанковичі - Мальховичі', country: 'Польща', countryCode: 'PL', aliases: ['нижankовичі','нижankovychi','нижankовичи','мальховичі','malhowice'] },
  { checkpoint: 'Ужгород - Вишнє Немецьке', country: 'Словаччина', countryCode: 'SK', aliases: ['ужгород','вишнє немецьке','вишнє нємецьке','vysne nemecke','vyšné nemecké'] },
  { checkpoint: 'Малий Березний - Убля', country: 'Словаччина', countryCode: 'SK', aliases: ['малий березний','убля','ubla','ubľa'] },
  { checkpoint: 'Чоп - Захонь', country: 'Угорщина', countryCode: 'HU', aliases: ['чоп','тиса','захонь','zahony','záhony'] },
  { checkpoint: 'Косино - Барабаш', country: 'Угорщина', countryCode: 'HU', aliases: ['косино','барабаш','barabas','barabás','koson'] },
  { checkpoint: 'Астей - Берегшурань', country: 'Угорщина', countryCode: 'HU', aliases: ['астей','берегшурань','beregsurany','beregsurány'] },
  { checkpoint: 'Дзвінкове - Лонья', country: 'Угорщина', countryCode: 'HU', aliases: ['дзвінкове','лонья','lonya','lónya','dzvinkove'] },
  { checkpoint: 'Велика Паладь - Надьгодош', country: 'Угорщина', countryCode: 'HU', aliases: ['велика паладь','надьгодош','nagyhodos','nagyhódos','nagypalad','nagypalád'] },
  { checkpoint: 'Вилок - Тисабеч', country: 'Угорщина', countryCode: 'HU', aliases: ['вилок','тисабеч','tiszabecs','vilok'] },
  { checkpoint: 'Порубне - Сірет', country: 'Румунія', countryCode: 'RO', aliases: ['порубне','сірет','сирет','siret'] },
  { checkpoint: 'Солотвино - Сігету-Мармацієй', country: 'Румунія', countryCode: 'RO', aliases: ['солотвино','сігету','сигету','sighetu'] },
  { checkpoint: 'Дякове - Халмеу', country: 'Румунія', countryCode: 'RO', aliases: ['дякове','халмеу','halmeu'] },
  { checkpoint: 'Красноїльськ - Вікову-де-Сус', country: 'Румунія', countryCode: 'RO', aliases: ['красноїльськ','красноільськ','вікову','vicovu'] }
];

function decode(v) {
  return String(v || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function textFromHtml(html) {
  return decode(String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>|<\/div>|<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function clean(v) {
  return String(v || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[–—-]/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function findCheckpoint(text) {
  const key = clean(text);
  let best = null;
  for (const cp of CHECKPOINTS) {
    for (const alias of cp.aliases) {
      const a = clean(alias);
      if (a && key.includes(a) && (!best || a.length > best.aliasLen)) best = { ...cp, aliasLen: a.length };
    }
  }
  if (!best) return null;
  delete best.aliasLen;
  return best;
}

function inferDirection(text) {
  const t = clean(text);
  const uaEu = [
    /виїзд з україни/,
    /виїзд україна/,
    /з україни/,
    /до польщі|до словаччини|до угорщини|до румунії/,
    /у бік польщі|у бік словаччини|у бік угорщини|у бік румунії/
  ];
  const euUa = [
    /в їзд в україну/,
    /в їзд до україни/,
    /вїзд в україну/,
    /в україну/,
    /до україни/,
    /з польщі|зі словаччини|з угорщини|з румунії/
  ];
  const a = uaEu.some(r => r.test(t));
  const b = euUa.some(r => r.test(t));
  if (a === b) return null;
  return a ? 'UA_EU' : 'EU_UA';
}

function parseWaitMin(text) {
  const t = String(text || '').toLowerCase();
  let m = t.match(/(\d{1,2})\s*(?:год(?:ина|ини|ин)?|h)\s*(?:(\d{1,2})\s*(?:хв(?:илин[аи]?|илини)?|min))?/i);
  if (m) return Number(m[1]) * 60 + Number(m[2] || 0);
  m = t.match(/(?:очікуван\w*|чекал\w*|стоял\w*|пройшл\w*|перетнул\w*|черга\w*)[^\n]{0,40}?(\d{1,3})\s*(?:хв(?:илин[аи]?|илини)?|min)\b/i);
  if (m) return Number(m[1]);
  m = t.match(/(?:очікуван\w*|чекал\w*|стоял\w*|пройшл\w*|перетнул\w*|черга\w*)[^\n]{0,30}?(\d{1,2})[:.](\d{2})\b/i);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  return null;
}

function parseQueueCars(text) {
  const m = String(text || '').match(/\b(\d{1,4})\s*(?:авто|автомобіл\w*|машин\w*|т\/?з|тз)\b/i);
  return m ? Number(m[1]) : null;
}

function parseTelegramHtml(html, source) {
  const chunks = String(html || '').split(/tgme_widget_message_wrap/gi).slice(1);
  const out = [];
  for (const chunk of chunks) {
    const post = (chunk.match(/data-post="([^"]+)"/i) || [])[1];
    const dt = (chunk.match(/<time[^>]+datetime="([^"]+)"/i) || [])[1];
    const body = (chunk.match(/tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/i) || [])[1];
    if (!post || !dt || !body) continue;
    const text = textFromHtml(body);
    const cp = findCheckpoint(text);
    const direction = inferDirection(text);
    if (!cp || !direction) continue;
    const ts = Date.parse(dt);
    if (!Number.isFinite(ts)) continue;
    const ageMin = Math.max(0, Math.round((Date.now() - ts) / 60000));
    if (ageMin > MAX_AGE_MIN) continue;
    const waitMin = parseWaitMin(text);
    const queueCars = parseQueueCars(text);
    if (waitMin == null && queueCars == null && !/черг|кордон|кпп|пункт пропуск/i.test(text)) continue;
    const excerpt = text.replace(/\s+/g, ' ').slice(0, 240);
    out.push({
      checkpoint: cp.checkpoint,
      country: cp.country,
      country_code: cp.countryCode,
      direction,
      wait_min: waitMin,
      queue_cars: queueCars,
      updated_at: new Date(ts).toISOString(),
      age_min: ageMin,
      note: `${source.label}: ${excerpt}`,
      source_url: `https://t.me/${post}`,
      source_channel: source.username,
      kind: 'human_report'
    });
  }
  return out;
}

async function fetchChannel(source) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 12000);
  try {
    const r = await fetch(`https://t.me/s/${encodeURIComponent(source.username)}`, {
      headers: UA,
      signal: ctl.signal,
      redirect: 'follow',
      cache: 'no-store'
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const html = await r.text();
    return { source, items: parseTelegramHtml(html, source), status: 'connected' };
  } catch (e) {
    return { source, items: [], status: 'error', error: String(e?.message || e) };
  } finally {
    clearTimeout(timer);
  }
}

function dedupe(items) {
  const seen = new Set();
  return items
    .sort((a, b) => (a.age_min ?? 9999) - (b.age_min ?? 9999))
    .filter(x => {
      const k = [x.source_channel, x.checkpoint, x.direction, x.updated_at, x.wait_min, x.queue_cars].join('|');
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}

export async function getTelegramSnapshot() {
  if (cache.payload && Date.now() - cache.ts < TTL_MS) return { ...cache.payload, fromCache: true };
  const results = await Promise.all(CHANNELS.map(fetchChannel));
  const items = dedupe(results.flatMap(x => x.items));
  const payload = {
    ok: true,
    generatedAt: new Date().toISOString(),
    cacheMinutes: 5,
    maxAgeMinutes: MAX_AGE_MIN,
    items,
    sources: results.map(x => ({
      channel: x.source.username,
      label: x.source.label,
      status: x.status,
      items: x.items.length,
      error: x.error || null
    }))
  };
  cache = { ts: Date.now(), payload };
  return { ...payload, fromCache: false };
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
