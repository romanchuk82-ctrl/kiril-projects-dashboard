# Проєкти Кіріла — dashboard

Особистий статус-дашборд усіх проєктів Кіріла. Це живе дзеркало claude.ai artifact-у "Пульт керування" — статична сторінка (`index.html`), яку хостить GitHub Pages.

Live: https://romanchuk82-ctrl.github.io/kiril-projects-dashboard/

## Що це

Для кожного проєкту показано статус (у розробці / запущено / чекає доступів), опис, останні зміни, посилання (GitHub/сайт/дашборд) і готову фразу "Продовжити" для швидкого старту нової сесії з Claude.

## Оновлення

Цей репозиторій підтримує Claude (Claude Code) — редагує `index.html` і пушить зміни щоразу, коли з'являється новий проєкт або змінюється статус існуючого. Ручне оновлення: відредагуй `index.html` і запуш у `main`, GitHub Pages підхопить автоматично.

## Border Monitor UA (`border-monitor`)

Окрема production-гілка моніторингу черг на автомобільних пунктах пропуску:

- production: https://border-monitor-ua.onrender.com;
- офіційні джерела, Nakordoni, Kordon.info/ДПСУ та Telegram формують основні показники;
- Telegram MTProto додає окремий людський сигнал і ніколи не перезаписує основний `waitMin`;
- 29 чатів конкретних КПП і 4 загальні Telegram-джерела оновлюються раз на 4 хвилини;
- Telegram-повідомлення вважаються актуальними до 3 годин, а дублікати відсіюються за каналом та ID повідомлення.

### Налаштування середовища

Секрети зберігаються тільки у змінних середовища Render:

- `TELEGRAM_API_ID` — API ID застосунку Telegram;
- `TELEGRAM_API_HASH` — API hash застосунку Telegram;
- `TELEGRAM_SESSION` — StringSession після одноразового входу;
- `TELEGRAM_SETUP_TOKEN` — тимчасовий випадковий токен для приватної QR-сторінки;
- `NKD_API_KEY` — ключ Nakordoni, якщо джерело використовується напряму.

Production не публікує маршрути налаштування Telegram. Секрети не повинні потрапляти в Git, логи або відповіді API.

### Локальна перевірка

```bash
npm ci
npm run check
npm test
npm start
```

Без Telegram-секретів застосунок запускається у безпечному режимі `not_configured`: картки КПП і посилання на чати залишаються доступними, але історія повідомлень не читається.

### Безпека production

- тільки read-only GET API;
- суворий CSP без inline JavaScript/CSS;
- HSTS, anti-frame, referrer/permissions policy;
- rate limiting та обмеження розміру URL/headers;
- публічний Telegram API не дозволяє force/full refresh;
- caller-supplied API keys і секрети не приймаються;
- щотижневий dependency/security audit і Dependabot.
