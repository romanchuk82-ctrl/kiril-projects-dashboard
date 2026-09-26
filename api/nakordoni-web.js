const UA = {
  'User-Agent': 'Mozilla/5.0 (compatible; BorderMonitorUA/1.0; +https://border-monitor-ua.onrender.com)',
  'Accept': 'text/html,application/xhtml+xml'
};

const PL_PAGES = {
  UA_EU: [
    { id: 13, name: 'Краківець - Корчова', aliases: ['краківець','корчова','korczowa'] },
    { id: 15, name: 'Шегині - Медика', aliases: ['шегині','медика','medyka'] },
    { id: 7, name: 'Рава-Руська - Гребенне', aliases: ['рава руська','гребенне','hrebenne'] },
    { id: 2, name: 'Устилуг - Зосин', aliases: ['устилуг','зосин','zosin'] },
    { id: 4, name: 'Угринів - Долгобичув', aliases: ['угринів','долгобичув','dolhobyczow','dołhobyczów'] },
    { id: 10, name: 'Грушів - Будоміж', aliases: ['грушів','будоміж','budomierz'] },
    { id: 1, name: 'Ягодин - Дорогуськ', aliases: ['ягодин','дорогуськ','dorohusk'] },
    { id: 19, name: 'Смільниця - Кросценко', aliases: ['смільниця','кросценко','kroscienko','krościenko'] },
    { id: 344, name: 'Нижанковичі - Мальховичі', aliases: ['нижанковичі','мальховичі','malhowice'] }
  ],
  EU_UA: [
    { id: 92, name: 'Краківець - Корчова', aliases: ['краківець','корчова','korczowa'] },
    { id: 96, name: 'Шегині - Медика', aliases: ['шегині','медика','medyka'] },
    { id: 84, name: 'Рава-Руська - Гребенне', aliases: ['рава руська','гребенне','hrebenne'] },
    { id: 76, name: 'Устилуг - Зосин', aliases: ['устилуг','зосин','zosin'] },
    { id: 80, name: 'Угринів - Долгобичув', aliases: ['угринів','долгобичув','dolhobyczow','dołhobyczów'] },
    { id: 88, name: 'Грушів - Будоміж', aliases: ['грушів','будоміж','budomierz'] },
    { id: 100, name: 'Смільниця - Кросценко', aliases: ['смільниця','кросценко','kroscienko','krościenko'] },
    { id: 345, name: 'Нижанковичі - Мальховичі', aliases: ['нижанковичі','мальховичі','malhowice'] }
  ]
};

function decodeHtml(value) {
  return String(value || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function htmlText(html) {
  return decodeHtml(String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>|<\/div>|<\/li>|<\/h\d>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/[\t\r]+/g, ' ')
    .replace(/ +/g, ' ')
    .replace(/\n +/g, '\n')
    .trim();
}

function waitToMinutes(text) {
  const s = String(text || '').replace(/≈/g, '').trim();
  let m = s.match(/(\d+)\s*год(?:\s*(\d+)\s*хв)?/i);
  if (m) return Number(m[1]) * 60 + Number(m[2] || 0);
  m = s.match(/(\d+)\s*хв/i);
  return m ? Number(m[1]) : null;
}

function parseUpdated(text, direction) {
  const m = String(text || '').match(/Оновлено\s*:?\s*(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})/i);
  if (!m) return { updatedAt: null, ageMin: null };
  const [, dd, mm, yyyy, hh, min] = m;
  const offset = direction === 'UA_EU' ? '+03:00' : '+02:00';
  const iso = `${yyyy}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}T${String(hh).padStart(2,'0')}:${min}:00${offset}`;
  const ts = Date.parse(iso);
  return { updatedAt: Number.isFinite(ts) ? new Date(ts).toISOString() : null, ageMin: Number.isFinite(ts) ? Math.max(0, Math.round((Date.now() - ts) / 60000)) : null };
}

function parsePage(html, def, direction) {
  const text = htmlText(html);
  const closed = /Пункт пропуску тимчасово закрито|тимчасово не працює/i.test(text);
  const staleText = /Застарілі дані|Останні дані:/i.test(text);
  const start = Math.max(0, text.toLowerCase().indexOf('легковий автомобіль'));
  const head = text.slice(start, start + 2200);
  let waitMin = null;
  const waitMatch = head.match(/легковий автомобіль(?:\s+TaxFREE[^\n]*)?\s+(≈?\s*\d+\s*год(?:\s*\d+\s*хв)?|≈?\s*\d+\s*хв|—)\s*(?:[-+]\d+%|Очікування)/i);
  if (waitMatch && waitMatch[1] !== '—') waitMin = waitToMinutes(waitMatch[1]);
  if (waitMin == null) {
    const short = text.match(/Станом на[^.]{0,80}очікування[^—-]*[—-]\s*(≈?\s*\d+\s*год(?:\s*\d+\s*хв)?|≈?\s*\d+\s*хв)/i);
    if (short) waitMin = waitToMinutes(short[1]);
  }
  let queueCars = null;
  let qm = text.match(/У черзі\s+(\d{1,4})\s+(?:авто|автомоб)/i);
  if (!qm) qm = text.match(/НАЖИВО\s+(\d{1,4})\s+автомоб/i);
  if (!qm) qm = text.match(/Фактично\s+(?:\d{1,2}:\d{2}\s+)?(\d{1,4})\s+автомоб/i);
  if (qm) queueCars = Number(qm[1]);
  else if (/черги немає/i.test(text)) queueCars = 0;
  const { updatedAt, ageMin } = parseUpdated(text, direction);
  const stale = staleText || (ageMin != null && ageMin > 180);
  if (closed) {
    waitMin = null;
    queueCars = null;
  }
  return {
    id: `nkd-web-${def.id}-${direction}`,
    ppid: `id_${def.id}`,
    name: def.name,
    country: 'Польща',
    countryCode: 'PL',
    direction,
    queueCars,
    waitMin,
    waitStatus: closed ? 'closed' : null,
    ageMin,
    updatedAt,
    trend: 'unknown',
    trendPercent: null,
    stale,
    confidence: stale ? 'low' : 'medium',
    sourceUrl: `https://nakordoni.eu/uk/id/id_${def.id}`,
    sources: [{
      source: 'nakordoni',
      label: 'Nakordoni · web fallback',
      value: waitMin,
      updatedAt,
      ageMin,
      sourceUrl: `https://nakordoni.eu/uk/id/id_${def.id}`,
      note: closed ? 'Пункт тимчасово закрито' : queueCars != null ? `${queueCars} авто · public page fallback` : 'public page fallback'
    }]
  };
}

async function fetchPage(def, direction) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 12000);
  try {
    const url = `https://nakordoni.eu/uk/id/id_${def.id}?crossingType=4&_bm=${Date.now()}`;
    const response = await fetch(url, { headers: UA, signal: ctl.signal, cache: 'no-store', redirect: 'follow' });
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    const html = await response.text();
    const row = parsePage(html, def, direction);
    if (row.waitMin == null && row.queueCars == null && row.waitStatus !== 'closed') throw new Error('NO_LIVE_DATA');
    return { ok: true, row };
  } catch (error) {
    return { ok: false, error: String(error?.message || error), def };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchNakordoniWeb(direction = 'UA_EU') {
  const defs = PL_PAGES[direction] || PL_PAGES.UA_EU;
  const out = [];
  const failures = [];
  for (let i = 0; i < defs.length; i += 3) {
    const batch = await Promise.all(defs.slice(i, i + 3).map(def => fetchPage(def, direction)));
    for (const result of batch) {
      if (result.ok) out.push(result.row);
      else failures.push({ name: result.def?.name || 'unknown', error: result.error });
    }
  }
  return { crossings: out, failures, source: 'nakordoni_web' };
}

export { parsePage as parseNakordoniPublicPage };
