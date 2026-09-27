
(() => {
  const previousRender = render;

  function queueProxyMinutes(q) {
    if (q == null || !Number.isFinite(Number(q))) return null;
    q = Math.max(0, Math.round(Number(q)));
    if (q === 0) return 8;
    if (q <= 3) return 15;
    if (q <= 7) return 25;
    if (q <= 12) return 40;
    if (q <= 20) return 60;
    if (q <= 35) return 90;
    return Math.min(180, 90 + (q - 35) * 3);
  }

  function quickRankInfo(row) {
    if (!row || row.stale || row.timeReliability === 'conflict' || sourceConflict(row)) return null;

    const time = displayTimeMin(row);
    const queue = queueRankValue(row);
    const noQueue = qualitativeNoQueue(row);
    const effectiveQueue = queue != null ? queue : (noQueue ? 0 : null);
    const queueProxy = queueProxyMinutes(effectiveQueue);

    if (time == null && queueProxy == null) return null;

    // A measured/estimated wait is never made artificially faster by a small car count.
    // Queue data can only add caution to a known wait. If time is absent, queue becomes
    // the ranking proxy without inventing a displayed waiting time.
    let score = time != null ? time : queueProxy;
    if (time != null && queueProxy != null) score = Math.max(time, queueProxy * 0.8);

    const age = displayAgeMin(row);
    if (age != null && age > 30) score += Math.min(20, (age - 30) / 3);

    if (row.timeReliability === 'unconfirmed' && time != null) score += 8;
    else if (row.timeReliability === 'no_time' && time == null) score += 3;

    return { row, score, time, queue: effectiveQueue, age: age ?? 99999 };
  }

  comparisonFor = function(rows) {
    const ranked = (rows || [])
      .map(quickRankInfo)
      .filter(Boolean)
      .sort((a, b) => a.score - b.score || (a.time ?? 99999) - (b.time ?? 99999) || (a.queue ?? 99999) - (b.queue ?? 99999) || a.age - b.age)
      .map(x => x.row);

    if (!ranked.length) return { mode: 'mixed', list: [], best: null, worst: null };
    return { mode: 'mixed', list: ranked, best: ranked[0], worst: ranked.length > 1 ? ranked[ranked.length - 1] : null };
  };

  function quickMetricText(row) {
    const time = displayTimeMin(row);
    const queue = queueRankValue(row);
    if (time != null && queue != null) return `≈ ${fmtWait(time)} · ${queue} авто`;
    if (time != null) return `≈ ${fmtWait(time)}`;
    if (queue != null) return `${queue} авто · час не вказано`;
    if (qualitativeNoQueue(row)) return 'без черги · час не вказано';
    return 'даних недостатньо';
  }

  function patchQuickOrient() {
    const raw = currentRows();
    const cmp = comparisonFor(raw);
    const active = raw.filter(r => !r.stale);
    const rankedCount = cmp.list.length;
    const incomplete = rankedCount < active.length;
    const best = cmp.best;
    const worst = cmp.worst;

    const labels = document.querySelectorAll('.summary-card .summary-label');
    if (labels[0]) labels[0].textContent = incomplete ? `Найшвидші зараз (${rankedCount}/${active.length})` : 'Найшвидші зараз';
    if (labels[1]) labels[1].textContent = 'Найбільша затримка';

    if (best && $('heroCard')) {
      const hs = humanQueueState(best);
      const q = displayQueue(best);
      const limited = incomplete ? '<br>Порівнюємо лише КПП, де є свіжі вимірювані дані.' : '';
      $('heroCard').innerHTML = `<div class="hero-kicker">Швидкий орієнтир зараз</div><div class="hero-main"><div><div class="hero-name">${flag(best.countryCode)} ${esc(best.name)}</div><div class="hero-meta">${esc(best.country)} · оновлено ${fmtAge(displayAgeMin(best))}</div></div><div class="hero-wait">${displayTimeMin(best) != null ? estimateText(best) : queueRankText(best)}</div></div><div class="hero-note"><strong>${hs.icon} ${hs.label}</strong>${q != null ? ` · ${q} авто перед КПП` : ''}<br>Враховано час, кількість авто, Telegram та свіжість підключених джерел.${limited}</div>`;
    }

    if ($('topThree')) {
      $('topThree').innerHTML = cmp.list.slice(0, 3).map((r, i) => `<div class="mini-row"><span>${i + 1}. ${flag(r.countryCode)} ${esc(r.name)}</span><strong>${quickMetricText(r)}</strong></div>`).join('') || '<span class="muted">—</span>';
    }

    if ($('worstCrossing')) {
      $('worstCrossing').innerHTML = worst ? `<div class="mini-row"><span>${flag(worst.countryCode)} ${esc(worst.name)}</span><strong>${quickMetricText(worst)}</strong></div>` : '<span class="muted">—</span>';
    }
  }

  render = function() {
    previousRender();
    patchQuickOrient();
  };
})();
