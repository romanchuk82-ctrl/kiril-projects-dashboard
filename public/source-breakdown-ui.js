
(() => {
  function sourceQueueCars(src) {
    const direct = src?.queueCars != null ? Number(src.queueCars) : NaN;
    if (Number.isFinite(direct) && direct >= 0) return Math.round(direct);
    const raw = String(src?.note || '');
    const m = raw.match(/(?:^|[^\d])(\d{1,4})\s*(?:авто|автомоб|машин)/iu);
    return m ? Number(m[1]) : null;
  }

  function sourceGroup(src) {
    const key = String(src?.source || '').toLowerCase();
    const label = String(src?.label || '').toLowerCase();
    if (key === 'telegram') return 'telegram';
    if (key === 'nakordoni' || label.includes('nakordoni')) return 'nakordoni';
    if (key.includes('kordon') || key.includes('dpsu') || label.includes('kordon') || label.includes('дпсу')) return 'kordon';
    if (key.startsWith('official_') || label.includes('official') || label.includes('офіці')) return 'official';
    return 'other';
  }

  function sourceMetrics(src) {
    const bits = [];
    const wait = src?.value != null ? Number(src.value) : NaN;
    const queue = sourceQueueCars(src);
    if (Number.isFinite(queue) && queue >= 0) bits.push(`🚗 ${Math.round(queue)} авто`);
    if (Number.isFinite(wait) && wait >= 0) bits.push(`⏱ ${src?.estimateType === 'upper_bound' ? '≤ ' : ''}${fmtWait(wait)}`);
    return bits.join(' · ');
  }

  function sourceRow(src, main, extra = '') {
    const url = sourceUrl(src);
    const metrics = sourceMetrics(src);
    const note = src?.note && !/^\s*\d+\s*(?:авто|автомоб|машин)/iu.test(String(src.note)) ? String(src.note) : '';
    return `<div class="prov-row ${main === src ? 'primary' : ''}">
      <div>
        <span class="prov-source">${main === src ? 'Основне · ' : ''}${esc(src?.label || src?.source || 'Джерело')}</span>
        ${note ? `<div class="prov-note">${esc(note)}</div>` : ''}
        ${extra ? `<div class="prov-note">${esc(extra)}</div>` : ''}
      </div>
      <div class="prov-right">
        <strong>${metrics || 'без числових даних'}</strong>
        ${src?.ageMin != null ? `<span>${fmtAge(Number(src.ageMin))}</span>` : ''}
        ${url ? `<a href="${esc(url)}" target="_blank" rel="noopener">джерело ↗</a>` : ''}
      </div>
    </div>`;
  }

  function syntheticNakordoni(row) {
    const url = String(row?.sourceUrl || '');
    const hasNkdIdentity = Boolean(row?.ppid) || url.includes('nakordoni.eu');
    if (!hasNkdIdentity) return null;
    const valueRaw = row?.baseWaitMin != null ? Number(row.baseWaitMin) : Number(row?.waitMin);
    const value = Number.isFinite(valueRaw) && valueRaw >= 0 ? valueRaw : null;
    const queueIsOtherSource = String(row?.queueSource || '').toLowerCase().includes('kordon');
    const queueRaw = !queueIsOtherSource && row?.queueCars != null ? Number(row.queueCars) : NaN;
    const queueCars = Number.isFinite(queueRaw) && queueRaw >= 0 ? Math.round(queueRaw) : null;
    if (value == null && queueCars == null) return null;
    return {
      source: 'nakordoni',
      label: 'Nakordoni',
      value,
      queueCars,
      ageMin: row?.waitAgeMin ?? row?.ageMin ?? null,
      updatedAt: row?.waitUpdatedAt || row?.updatedAt || null,
      sourceUrl: url.includes('nakordoni.eu') ? url : (row?.ppid ? `https://nakordoni.eu/uk/id/${row.ppid}` : 'https://nakordoni.eu/'),
      note: 'значення з агрегованої відповіді'
    };
  }

  provenance = function(row) {
    const all = Array.isArray(row?.sources) ? row.sources : [];
    const main = mainSource(row);
    const groups = { nakordoni: [], kordon: [], official: [], telegram: [], other: [] };
    for (const src of all) groups[sourceGroup(src)].push(src);

    if (!groups.nakordoni.length) {
      const fallback = syntheticNakordoni(row);
      if (fallback) groups.nakordoni.push(fallback);
    }

    for (const key of Object.keys(groups)) {
      groups[key].sort((a, b) => (Number(a?.ageMin ?? 999999) - Number(b?.ageMin ?? 999999)));
    }

    let summary;
    if (row?.waitMin != null) {
      if (row.timeReliability === 'confirmed' && row.baseWaitMin != null && row.telegramWaitMin != null) {
        summary = `Фінальна оцінка <strong>${fmtWait(row.waitMin)}</strong>: базове джерело ${fmtWait(row.baseWaitMin)} + свіжий Telegram ${fmtWait(row.telegramWaitMin)}.`;
      } else if (row.timeReliability === 'supported') {
        summary = `Показаний час <strong>${fmtWait(row.waitMin)}</strong> взято з базового джерела, а ситуацію додатково підтверджено Telegram.`;
      } else if (main) {
        summary = `Показаний час <strong>${fmtWait(row.waitMin)}</strong> взято з <strong>${esc(main.label || main.source)}</strong>.`;
      } else {
        summary = `Показаний орієнтир <strong>${fmtWait(row.waitMin)}</strong>.`;
      }
    } else if (row?.telegramWaitMin != null) {
      summary = `Незалежного числового часу немає. Telegram повідомляє фактичний час <strong>${fmtWait(row.telegramWaitMin)}</strong>.`;
    } else if (displayQueue(row) != null || qualitativeNoQueue(row)) {
      summary = 'Числового часу поки немає, але нижче видно фактичні дані джерел, які щось повернули для цього КПП.';
    } else {
      summary = 'Для цього КПП поки немає надійного числового часу. Нижче показані лише джерела, які реально повернули дані.';
    }

    const rows = [];
    if (groups.nakordoni.length) rows.push(...groups.nakordoni.map(src => sourceRow(src, main)));
    if (groups.kordon.length) rows.push(...groups.kordon.map(src => sourceRow(src, main)));
    if (groups.official.length) rows.push(...groups.official.map(src => sourceRow(src, main)));

    if (groups.telegram.length) {
      const latest = groups.telegram[0];
      const more = groups.telegram.length > 1 ? `Ще ${groups.telegram.length - 1} свіжих повідомлень нижче.` : 'Детальне повідомлення показано нижче.';
      rows.push(sourceRow(latest, null, more));
    }

    if (groups.other.length) rows.push(...groups.other.map(src => sourceRow(src, main)));

    const trust = row?.waitMin != null ? ` <span class="${row.timeReliable ? '' : 'warn-text'}">${esc(timeTrustText(row))}</span>` : '';
    const conflict = sourceConflict(row) || row?.timeReliability === 'conflict' ? ' <span class="warn-text">⚠️ Джерела відрізняються.</span>' : '';
    const list = rows.length ? rows.join('') : '<div class="prov-empty">Жодне підключене джерело зараз не дало окремого значення для цього КПП.</div>';

    return `<div class="provenance"><div class="prov-title">Що показують різні джерела</div><div class="prov-summary">${summary}${trust}${conflict}</div><div class="prov-list">${list}</div></div>`;
  };
})();