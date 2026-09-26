const SOURCE_URL = 'https://kordon.info/';
const TTL_MS = 2 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 12_000;

let cache = null;

const CROSSINGS = [
  { name: 'Шегині - Медика', aliases: ['шегині - медика', 'шегині — медика'] },
  { name: 'Краківець - Корчова', aliases: ['краківець - корчова', 'краковець - корчова'] },
  { name: 'Ягодин - Дорогуськ', aliases: ['ягодин - дорогуськ', 'ягодин — дорогуськ'] },
  { name: 'Грушів - Будоміж', aliases: ['грушів - будомєж', 'грушів - будоміж', 'грушів — будомєж'] },
  { name: 'Устилуг - Зосин', aliases: ['устилуг - зосін', 'устилуг - зосин', 'устилуг — зосін'] },
  { name: 'Рава-Руська - Гребенне', aliases: ['рава-руська - гребенне', 'рава руська - гребенне'] },
  { name: 'Угринів - Долгобичув', aliases: ['угринів - долгобичув'] },
  { name: 'Смільниця - Кросценко', aliases: ['смільниця - кросценко'] },
  { name: 'Нижанковичі - Мальховичі', aliases: ['нижанковичі - мальховичі'] }
];

function decode(value) {
  return String(value || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&ndash;|&mdash;/gi, '—')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function stripHtml(value) {
  return decode(String(value || '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function clean(value) {
  return decode(String(value || '')).toLowerCase().replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
}

function canonicalName(value) {
  const key = clean(value);
  for (const crossing of CROSSINGS) {
    if (crossing.aliases.some(alias => key.includes(clean(alias)))) return crossing.name;
  }
  return null;
}

function parseUpstreamTime(text, nowMs = Date.now()) {
  const m = String(text || '').match(/останн(?:є|е)\s+оновлення\s+о\s+(\d{1,2}):(\d{2})/iu);
  if (!m) return { updatedAt: new Date(nowMs).toISOString(), ageMin: 0, upstreamClock: null };
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  const now = new Date(nowMs);
  let ts = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hh, mm, 0, 0);
  if (ts > nowMs + 5 * 60_000) ts -= 24 * 60 * 60_000;
  const ageMin = Math.max(0, Math.round((nowMs - ts) / 60_000));
  return { updatedAt: new Date(ts).toISOString(), ageMin, upstreamClock: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}` };
}

function parseCards(html) {
  const items = [];
  const starts = [...String(html || '').matchAll(/<div\s+class=["'][^"']*\bkbq-single\b[^"']*["'][^>]*>/gi)].map(m => m.index);
  for (let i = 0; i < starts.length; i += 1) {
    const chunk = String(html || '').slice(starts[i], starts[i + 1] ?? Math.min(String(html || '').length, starts[i] + 5000));
    const nameMatch = chunk.match(/kbq-single-point["'][^>]*>([^<]+)</i);
    const countMatch = chunk.match(/kbq-single-count["'][^>]*>\s*(\d{1,4})\s*</i);
    if (!nameMatch || !countMatch) continue;
    const name = canonicalName(nameMatch[1]);
    if (!name) continue;
    items.push({ name, queueCars: Number(countMatch[1]), evidence: 'card' });
  }
  return items;
}

function parseSummary(html) {
  const text = stripHtml(html);
  const items = [];
  const summary = text.match(/За актуальними даними, найбільші черги[\s\S]{0,650}?Інформація про кількість/iu)?.[0] || '';
  const re = /([^;:.]{3,80}?)\s+[—-]\s*(\d{1,4})\s+авто/giu;
  for (const match of summary.matchAll(re)) {
    const name = canonicalName(match[1]);
    if (!name) continue;
    items.push({ name, queueCars: Number(match[2]), evidence: 'summary' });
  }
  return { items, text };
}

export function parseKordonPage(html, nowMs = Date.now()) {
  const cards = parseCards(html);
  const summary = parseSummary(html);
  const { updatedAt, ageMin, upstreamClock } = parseUpstreamTime(summary.text, nowMs);
  const byName = new Map();
  for (const item of [...summary.items, ...cards]) {
    const prior = byName.get(item.name);
    if (!prior || item.evidence === 'card') byName.set(item.name, item);
  }
  const items = [...byName.values()].map(item => ({
    ...item,
    country: 'Польща',
    countryCode: 'PL',
    direction: 'UA_EU',
    updatedAt,
    ageMin,
    stale: ageMin > 180,
    sourceUrl: SOURCE_URL,
    upstreamClock
  }));
  return { items, updatedAt, ageMin, upstreamClock };
}

async function fetchFresh() {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const url = `${SOURCE_URL}?_bm=${Date.now()}`;
    const response = await fetch(url, {
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; BorderMonitorUA/1.0; +https://border-monitor-ua.onrender.com)',
        accept: 'text/html,application/xhtml+xml'
      },
      cache: 'no-store',
      redirect: 'follow',
      signal: ctl.signal
    });
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    const html = await response.text();
    const parsed = parseKordonPage(html);
    if (!parsed.items.length) throw new Error('NO_QUEUE_CARDS');
    return {
      status: 'connected',
      source: 'kordon_info',
      sourceUrl: SOURCE_URL,
      attribution: 'Kordon.info · за даними ДПСУ',
      ...parsed
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchKordonLive(direction = 'UA_EU') {
  if (direction !== 'UA_EU') return { status: 'not_applicable', source: 'kordon_info', sourceUrl: SOURCE_URL, items: [] };
  if (cache && Date.now() - cache.ts < TTL_MS) return cache.value;
  try {
    const value = await fetchFresh();
    cache = { ts: Date.now(), value };
    return value;
  } catch (error) {
    if (cache?.value?.items?.length) return { ...cache.value, status: 'stale_cache', error: String(error?.message || error) };
    return { status: 'error', source: 'kordon_info', sourceUrl: SOURCE_URL, items: [], error: String(error?.message || error) };
  }
}

export default fetchKordonLive;
