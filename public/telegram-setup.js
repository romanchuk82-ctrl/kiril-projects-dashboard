const $ = id => document.getElementById(id);
const tokenKey = 'border-monitor-telegram-setup-token';
const fragment = new URLSearchParams(location.hash.slice(1));
const fragmentToken = fragment.get('token');
if (fragmentToken) {
  sessionStorage.setItem(tokenKey, fragmentToken);
  history.replaceState(null, '', '/telegram/setup');
}
let setupToken = sessionStorage.getItem(tokenKey) || '';
let pollTimer = null;
let currentQrUrl = '';

function forgetSetupToken() {
  sessionStorage.removeItem(tokenKey);
  setupToken = '';
}

function headers(json = false) {
  return {
    'X-Setup-Token': setupToken,
    ...(json ? { 'Content-Type': 'application/json' } : {})
  };
}

async function api(action, options = {}) {
  const response = await fetch(`/api/telegram-auth/${action}`, {
    cache: 'no-store',
    ...options,
    headers: { ...headers(Boolean(options.body)), ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({ ok: false, error: 'invalid_response' }));
  if (!response.ok) throw Object.assign(new Error(data.error || 'request_failed'), { data, status: response.status });
  return data;
}

function setStatus(text, kind = '') {
  $('statusText').textContent = text;
  $('statusBox').className = `status-box ${kind}`.trim();
}

function hidePanels() {
  for (const id of ['qrPanel', 'passwordForm', 'successPanel', 'errorPanel']) $(id).classList.add('hidden');
}

function render(status) {
  hidePanels();
  if (status.stage === 'already_configured') {
    clearInterval(pollTimer);
    forgetSetupToken();
    setStatus('Telegram MTProto уже підключено.', 'success');
    $('successPanel').classList.remove('hidden');
    $('successPanel').querySelector('p').textContent = 'Захищена сесія вже збережена в Render.';
    return;
  }
  if (status.stage === 'waiting_for_scan' && status.qrImage) {
    setStatus('Очікую підтвердження в Telegram…');
    $('qrImage').src = status.qrImage;
    currentQrUrl = status.qrUrl || '';
    $('telegramLink').href = currentQrUrl || '#';
    $('qrPanel').classList.remove('hidden');
    return;
  }
  if (status.stage === 'password_required') {
    setStatus('Telegram просить двоетапний пароль.');
    $('passwordHint').textContent = status.passwordHint ? `Підказка Telegram: ${status.passwordHint}` : 'Цей крок потрібен лише якщо для акаунта ввімкнено 2FA.';
    $('passwordForm').classList.remove('hidden');
    $('passwordInput').focus();
    return;
  }
  if (status.stage === 'checking_password') {
    setStatus('Перевіряю підтвердження…');
    return;
  }
  if (status.stage === 'done' && status.sessionReady) {
    forgetSetupToken();
    setStatus('Telegram успішно підтверджено.', 'success');
    $('successPanel').classList.remove('hidden');
    clearInterval(pollTimer);
    return;
  }
  if (status.stage === 'error' || status.error) {
    setStatus('Підключення потребує повторної спроби.', 'error');
    $('errorText').textContent = status.error || 'telegram_auth_error';
    $('errorPanel').classList.remove('hidden');
    return;
  }
  setStatus(status.stage === 'connecting' ? 'Встановлюю захищене з’єднання…' : 'Готую захищений QR-код…');
}

async function start() {
  if (!setupToken) {
    setStatus('Посилання недійсне або вже використане.', 'error');
    $('errorText').textContent = 'Відсутній одноразовий токен налаштування.';
    $('errorPanel').classList.remove('hidden');
    $('retryBtn').classList.add('hidden');
    return;
  }
  try {
    const status = await api('start', { method: 'POST' });
    render(status);
    clearInterval(pollTimer);
    if (!['already_configured', 'done', 'error'].includes(status.stage)) pollTimer = setInterval(poll, 1500);
  } catch (error) {
    render(error.data || { stage: 'error', error: error.message });
  }
}

async function poll() {
  try { render(await api('status')); }
  catch (error) { render(error.data || { stage: 'error', error: error.message }); }
}

$('telegramLink').addEventListener('click', event => {
  if (!currentQrUrl) event.preventDefault();
});

$('passwordForm').addEventListener('submit', async event => {
  event.preventDefault();
  const input = $('passwordInput');
  const password = input.value;
  input.value = '';
  try {
    render(await api('password', { method: 'POST', body: JSON.stringify({ password }) }));
  } catch (error) {
    render(error.data || { stage: 'error', error: error.message });
  }
});

$('retryBtn').addEventListener('click', start);
start();
