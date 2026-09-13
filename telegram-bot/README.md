# Zovus Telegram Bot

Полноценный Telegram-клиент [zovus.ru](https://zovus.ru): расклады и их обсуждение, карта дня, матрица, история, кабинет, поддержка, голосовые ответы и пополнение рун через ЮKassa.

**Источник правды — Postgres сайта** через internal API (`X-Bot-Internal-Secret` → `/api/internal/bot/**`). Локальная bot-БД хранит только bot-specific state (flow, day cards, processed updates). Контракт: [CONTRACT.md](./CONTRACT.md).

## Запуск

```bash
cd telegram-bot
cp .env.example .env
npm install
npm run migrate
npm run dev
```

Нужны: `TELEGRAM_BOT_TOKEN`, `BOT_INTERNAL_SECRET` (= site `BOT_INTERNAL_SECRET`), `ZOVUS_SITE_URL` (https://zovus.ru) и `SITE_INTERNAL_BASE_URL` (обычно loopback URL Next.js-приложения).

Режимы: `BOT_MODE=polling` (локально) или `webhook`.

## Команды

`/start` · `/menu` · `/spread` · `/again` · `/day` · `/runes` · `/history` · `/profile` · `/settings` · `/paysupport` · `/cancel` · `/about` · `/delete` · `/help`

## Админ

```bash
npm run admin -- users
npm run admin -- sessions <telegram_user_id>
npm run admin -- ban <telegram_user_id>
npm run admin -- flag bot_enabled 0
npm run admin -- export-csv
```

## Важно

- Аккаунт, история, руны и сессии общие с сайтом; источником данных остаётся Postgres сайта.
- Единственный платёжный канал — ЮKassa. Stars отключены, старые XTR-счета отклоняются, а checkout создаётся сервером с повторяемым `request_id`.
- Linked-пользователь может делать расклады по общим правилам и тарифам сайта; локальный суточный лимит относится только к legacy guest-режиму.
- `/paysupport` создаёт обращение по оплате. Зачисление после webhook/confirm ЮKassa идемпотентно.
- Ассеты карт: `assets/decks/tarot-veronika` (override: `BOT_DECK_PATH`)
