
(() => {
  const baseTelegramStatusLabel = telegramStatusLabel;
  const baseRender = render;
  const AUTO_REFRESH_MS = 60_000;
  const BATCH_SIZE = 4;
  let refreshRunning = false;
  let lastViewKey = '';

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
      if (ok) baseRender();
    }, 0);
  });

  setInterval(refreshVisibleTelegram, AUTO_REFRESH_MS);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshVisibleTelegram();
  });
  window.addEventListener('focus', refreshVisibleTelegram);
})();
