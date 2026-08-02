# Zovus Telegram Bot

Тонкий клиент сайта [zovus.ru](https://zovus.ru): гостевой триплет, карта дня, расклады, руны (ЮKassa), профиль.

**Источник правды — Postgres сайта** через internal API (`X-Bot-Internal-Secret` → `/api/internal/bot/**`). Локальная bot-БД хранит только bot-specific state (flow, day cards, processed updates). Контракт: [CONTRACT.md](./CONTRACT.md).

## Запуск

```bash
cd telegram-bot
cp .env.example .env
npm install
npm run migrate
npm run dev
```

Нужны: `BOT_TOKEN`, `BOT_INTERNAL_SECRET` (= site `BOT_INTERNAL_SECRET`), `SITE_BASE_URL` (https://zovus.ru).

Режимы: `BOT_MODE=polling` (локально) или `webhook`.

## Команды

`/start` · `/menu` · `/spread` · `/again` · `/day` · `/history` · `/profile` · `/settings` · `/about` · `/delete` · `/help`

## Админ

```bash
npm run admin -- users
npm run admin -- sessions <telegram_user_id>
npm run admin -- ban <telegram_user_id>
npm run admin -- flag bot_enabled 0
npm run admin -- export-csv
```

## Важно

- Аккаунты/руны/оплата — на сайте (ЮKassa). Stars checkout отключён (`starsEnabled: false`).
- Один триплет в сутки на `telegram_user_id` (guest limits + site claim).
- Ассеты карт: `assets/decks/tarot-veronika` (override: `BOT_DECK_PATH`)
