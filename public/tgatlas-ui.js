
(() => {
  const baseTelegramBlock = telegramBlock;
  const baseTelegramStatusLabel = telegramStatusLabel;
  const baseRender = render;

  telegramStatusLabel = function(status, details) {
    const count = details?.totalSources ? ` ${details.connectedSources || 0}/${details.totalSources}` : '';
    if (status === 'available') return 'готовий по кліку';
    if (details?.mode === 'tgatlas' && status === 'partial') return `активний${count}`;
    return baseTelegramStatusLabel(status, details);
  };

  telegramBlock = function(r) {
    const tg = (r.sources || []).filter(s => s.source === 'telegram').sort((a,b)=>(a.ageMin ?? 9999) - (b.ageMin ?? 9999));
    const chat = r.telegramChat || null;
    if (tg.length) return baseTelegramBlock(r);
    if (!chat) return baseTelegramBlock(r);

    const link = chat.url ? `<a href="${esc(chat.url)}" target="_blank" rel="noopener">Відкрити чат «${esc(chat.label || 'Telegram')}» ↗</a>` : '';
    const canLoad = ['available','connected','error','partial'].includes(chat.status || 'available');
    let message = 'За останні 3 години релевантних повідомлень по цьому КПП не знайдено.';
    if (chat.status === 'available') message = 'Натисни нижче, щоб перевірити свіжі повідомлення безпосередньо в Telegram.';
    if (chat.status === 'error') message = 'Остання перевірка Telegram не вдалася. Можна повторити.';
    const button = canLoad ? `<button type="button" class="tg-load-btn" data-channel="${esc(chat.channel || '')}">Перевірити Telegram</button>` : '';
    return `<div class="telegram-box no-tg"><div class="telegram-title">💬 Що пишуть у Telegram</div><div class="telegram-empty">${message}</div><div class="telegram-links">${button}${link}</div></div>`;
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

  async function loadTelegram(channel, button) {
    if (!channel || button.dataset.loading === '1') return;
    button.dataset.loading = '1';
    button.disabled = true;
    button.textContent = 'Перевіряю…';
    try {
      const response = await fetch(`/snapshot?username=${encodeURIComponent(channel)}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || 'telegram_error');
      const key = channel.toLowerCase();
      const row = state.rows.find(r => String(r.telegramChat?.channel || '').toLowerCase() === key);
      if (!row) throw new Error('row_not_found');
      row.sources = (row.sources || []).filter(s => !(s.source === 'telegram' && String(s.sourceChannel || '').toLowerCase() === key));
      const fresh = (data.items || []).filter(item => item.direction === state.direction && String(item.source_channel || '').toLowerCase() === key).map(toUiSource);
      row.sources.push(...fresh);
      row.humanReports = fresh.length;
      row.humanSignal = fresh.length > 1 ? 'corroborated' : fresh.length === 1 ? 'reported' : null;
      const meta = (data.sources || []).find(s => String(s.channel || '').toLowerCase() === key);
      if (meta) row.telegramChat = { label: meta.label, channel: meta.channel, url: meta.channelUrl, status: meta.status, freshReports: meta.items || 0, messagesScanned: meta.messagesScanned || 0, newestMessageAt: meta.newestMessageAt || null };
      render();
    } catch (error) {
      button.disabled = false;
      button.dataset.loading = '0';
      button.textContent = 'Повторити Telegram';
      console.warn('[telegram-ui]', String(error?.message || error));
    }
  }

  render = function() {
    baseRender();
    document.querySelectorAll('.tg-load-btn').forEach(button => {
      button.addEventListener('click', () => loadTelegram(button.dataset.channel, button), { once: true });
    });
  };
})();
