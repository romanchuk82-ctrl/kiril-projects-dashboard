
(() => {
  const baseTelegramStatusLabel = telegramStatusLabel;
  const baseRender = render;
  const baseHumanQueueState = humanQueueState;
  const baseHumanConflictNote = humanConflictNote;
  const baseComparisonFor = comparisonFor;
  const baseEstimateText = estimateText;
  const baseRecomputeTimeTrust = recomputeTimeTrust;
  const AUTO_REFRESH_MS = 60_000;
  const BATCH_SIZE = 4;
  let refreshRunning = false;
  let lastViewKey = '';

  function queueConflictSummary(row) {
    const baseQueueRaw = row?.queueCars != null ? Number(row.queueCars) : NaN;
    if (!Number.isFinite(baseQueueRaw) || baseQueueRaw < 0) return null;
    const baseQueue = Math.round(baseQueueRaw);
    const fresh = (row.sources || [])
      .filter(src => src?.source === 'telegram' && src.ageMin != null && Number(src.ageMin) >= 0 && Number(src.ageMin) <= TG_TRUST_MAX_AGE)
      .sort((a, b) => Number(a.ageMin) - Number(b.ageMin));

    const observations = fresh.map(src => ({
      src,
      q: telegramQueueCount(src),
      signal: telegramQualitativeSignal(src)
    })).filter(x => x.q != null || x.signal);
    const latest = observations[0];
    if (!latest) return null;

    const tgQueue = latest.q != null ? Math.max(0, Math.round(Number(latest.q))) : null;
    const tgSignal = latest.signal || null;
    const baseLow = baseQueue <= 3;
    const baseHigh = baseQueue >= 10;
    const telegramLow = tgSignal === 'low' || (tgQueue != null && tgQueue <= 3);
    const telegramHigh = tgSignal === 'high' || (tgQueue != null && tgQueue >= 10);

    if ((baseLow && telegramHigh) || (baseHigh && telegramLow)) {
      return {
        baseQueue,
        tgQueue,
        tgSignal,
        ageMin: Number(latest.src.ageMin),
        source: latest.src
      };
    }
    return null;
  }

  recomputeTimeTrust = function(row) {
    const out = baseRecomputeTimeTrust(row);
    const queueConflict = queueConflictSummary(out);
    if (queueConflict) {
      out.timeReliable = false;
      out.timeReliability = 'conflict';
      out.sourceConflictType = 'queue';
      out.sourceConflict = queueConflict;
      out.confidence = 'low';
      const tgText = queueConflict.tgQueue != null ? `${queueConflict.tgQueue} авто` : (queueConflict.tgSignal === 'high' ? 'значну чергу' : 'майже без черги');
      out.timeReliabilityReason = `Кількість авто не збігається: базове джерело ${queueConflict.baseQueue}, Telegram ${tgText}`;
    }
    return out;
  };

  function conflictTelegramCue(row) {
    if (row?.timeReliability !== 'conflict') return null;
    if (row?.sourceConflictType === 'queue' && row?.sourceConflict) {
      const c = row.sourceConflict;
      if (c.tgQueue != null) return { kind: c.tgQueue >= 10 ? 'high' : 'low', text: `Telegram: ${c.tgQueue} авто`, queueConflict: c };
      if (c.tgSignal === 'high') return { kind: 'high', text: 'Telegram: повідомляють про значну чергу', queueConflict: c };
      if (c.tgSignal === 'low') return { kind: 'low', text: 'Telegram: черги немає / майже немає', queueConflict: c };
    }

    const fresh = (row.sources || [])
      .filter(src => src?.source === 'telegram' && src.ageMin != null && Number(src.ageMin) >= 0 && Number(src.ageMin) <= TG_TRUST_MAX_AGE)
      .sort((a, b) => Number(a.ageMin) - Number(b.ageMin));

    for (const src of fresh) {
      const signal = telegramQualitativeSignal(src);
      if (signal === 'low') {
        const raw = String(src.note || '').toLowerCase();
        const exactNoQueue = /(без черги|нема черги|немає черги|черги нема|черги немає|пусто|нікого|нуль)/u.test(raw);
        return { kind: 'low', text: exactNoQueue ? 'Telegram: черги немає' : 'Telegram: майже без черги' };
      }
      if (signal === 'high') return { kind: 'high', text: 'Telegram: повідомляють про значну чергу' };
    }

    if (row.telegramWaitMin != null) return { kind: 'time', text: `Telegram: ${fmtWait(row.telegramWaitMin)}` };
    return { kind: 'generic', text: 'Джерела розходяться' };
  }

  humanQueueState = function(row) {
    const cue = conflictTelegramCue(row);
    if (cue) return { tone: 'tone-yellow', icon: '⚠️', label: `${cue.text} · джерела розходяться` };
    return baseHumanQueueState(row);
  };

  humanConflictNote = function(row) {
    const cue = conflictTelegramCue(row);
    if (!cue) return baseHumanConflictNote(row);
    if (row?.sourceConflictType === 'queue' && row?.sourceConflict) {
      const c = row.sourceConflict;
      const tg = c.tgQueue != null ? `${c.tgQueue} авто` : (c.tgSignal === 'high' ? 'значну чергу' : 'черги немає / майже немає');
      return `⚠️ Джерела суперечать одне одному: базове джерело показує ${c.baseQueue} авто, а свіжий Telegram — ${tg}. Не визначаємо єдиний стан черги.`;
    }
    if (cue.kind === 'low') return '⚠️ Базова оцінка часу і свіже повідомлення Telegram суперечать одне одному. Час у картці — базовий орієнтир; Telegram окремо повідомляє, що черги немає або вона мінімальна.';
    if (cue.kind === 'high') return '⚠️ Базова оцінка і свіжий Telegram суперечать одне одному. Не зводимо їх до одного кольорового висновку — нижче видно обидва джерела.';
    if (cue.kind === 'time') return `⚠️ Базова оцінка часу не збігається зі свіжим Telegram (${fmtWait(row.telegramWaitMin)}). Показуємо обидва значення окремо.`;
    return '⚠️ Свіжі джерела суперечать одне одному. Показуємо їх окремо без єдиного висновку.';
  };

  estimateText = function(row) {
    if (row?.timeReliability === 'conflict' && row?.sourceConflictType === 'queue' && displayTimeMin(row) == null) return '⚠️ різні дані';
    return baseEstimateText(row);
  };

  comparisonFor = function(rows) {
    return baseComparisonFor((rows || []).filter(row => row?.timeReliability !== 'conflict'));
  };

  telegramStatusLabel = function(status, details) {
    const count = details?.totalSources ? ` ${details.connectedSources || 0}/${details.totalSources}` : '';
    if (status === 'available') return 'готовий';
    if (details?.mode === 'tgatlas' && status === 'partial') return `активний${count}`;
    return baseTelegramStatusLabel(status, details);
  };

  function toUiSource(item) {
    return {
      source: 'telegram',
      label: item.source_label || 'Telegram',
      value: item.wait_min,
      queueCars: item.queue_cars,
      updatedAt: item.updated_at,
      ageMin: item.age_min,
      note: item.note,
      replyContext: item.reply_context,
      directionBasis: item.direction_basis,
      sourceUrl: item.source_url,
      channelUrl: item.channel_url,
      sourceChannel: item.source_channel
    };
  }

  async function loadTelegram(channel) {
    if (!channel) return false;
    try {
      const response = await fetch(`/api/telegram?username=${encodeURIComponent(channel)}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || 'telegram_error');
      const key = channel.toLowerCase();
      const row = state.rows.find(r => String(r.telegramChat?.channel || '').toLowerCase() === key);
      if (!row) return false;
      row.sources = (row.sources || []).filter(s => !(s.source === 'telegram' && String(s.sourceChannel || '').toLowerCase() === key));
      const fresh = (data.items || [])
        .filter(item => item.direction === state.direction && String(item.source_channel || '').toLowerCase() === key)
        .map(toUiSource);
      row.sources.push(...fresh);
      row.humanReports = fresh.length;
      row.humanSignal = fresh.length > 1 ? 'corroborated' : fresh.length === 1 ? 'reported' : null;
      if (typeof recomputeTimeTrust === 'function') recomputeTimeTrust(row);
      const meta = (data.sources || []).find(s => String(s.channel || '').toLowerCase() === key);
      if (meta) row.telegramChat = {
        label: meta.label,
        channel: meta.channel,
        url: meta.channelUrl,
        status: meta.status,
        freshReports: meta.items || 0,
        messagesScanned: meta.messagesScanned || 0,
        newestMessageAt: meta.newestMessageAt || null
      };
      return true;
    } catch (error) {
      console.warn('[telegram-ui]', String(error?.message || error));
      return false;
    }
  }

  function normalizeVisibleRows() {
    for (const row of state.rows || []) {
      if (typeof recomputeTimeTrust === 'function') recomputeTimeTrust(row);
    }
  }

  async function refreshVisibleTelegram() {
    if (refreshRunning || document.hidden) return;
    const rows = typeof currentRows === 'function' ? currentRows() : state.rows;
    const channels = [...new Set(rows.map(r => r.telegramChat?.channel).filter(Boolean))];
    if (!channels.length) return;
    refreshRunning = true;
    try {
      for (let i = 0; i < channels.length; i += BATCH_SIZE) {
        await Promise.all(channels.slice(i, i + BATCH_SIZE).map(loadTelegram));
      }
      normalizeVisibleRows();
      baseRender();
    } finally {
      refreshRunning = false;
    }
  }

  function scheduleForCurrentView() {
    const key = `${state.direction}:${state.country}`;
    if (key === lastViewKey) return;
    lastViewKey = key;
    setTimeout(refreshVisibleTelegram, 150);
  }

  render = function() {
    normalizeVisibleRows();
    baseRender();
    scheduleForCurrentView();
  };

  const forcedAt = new Map();
  const crossingList = document.getElementById('crossingList');
  crossingList?.addEventListener('click', event => {
    const summary = event.target.closest?.('summary.compact-crossing-summary');
    if (!summary) return;
    const details = summary.closest('details.crossing-collapsible');
    setTimeout(async () => {
      if (!details?.open) return;
      const title = summary.querySelector('.crossing-title')?.textContent?.trim() || '';
      const row = state.rows.find(item => item?.name && title.includes(String(item.name)));
      const channel = row?.telegramChat?.channel;
      if (!channel) return;
      const key = String(channel).toLowerCase();
      const now = Date.now();
      if (now - (forcedAt.get(key) || 0) < 15_000) return;
      forcedAt.set(key, now);
      const ok = await loadTelegram(channel);
      if (ok) {
        normalizeVisibleRows();
        baseRender();
      }
    }, 0);
  });

  setInterval(refreshVisibleTelegram, AUTO_REFRESH_MS);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshVisibleTelegram();
  });
  window.addEventListener('focus', refreshVisibleTelegram);
})();
