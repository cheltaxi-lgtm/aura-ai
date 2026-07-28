# Zovus Telegram Bot

Автономный премиум-бот: гостевой триплет, карта дня, профиль, история, напоминания.  
**Не связан** с Next.js-сайтом. Данные — своя SQLite. Контракт будущего claim: [CONTRACT.md](./CONTRACT.md).

## Запуск

```bash
cd telegram-bot
cp .env.example .env   # токен уже может быть в .env
npm install
npm run migrate
npm run dev
```

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

- Один триплет в сутки на `telegram_user_id`
- В БД: вопрос + карты + teaser + hash токена (`claimed_at` всегда null пока нет коннекта)
- Ассеты карт: `../public/decks/tarot-veronika`
