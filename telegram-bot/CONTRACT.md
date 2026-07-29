# Контракт Zovus ↔ Telegram bot (unified client)

Сайт и бот — **два клиента одного аккаунта**. Источник истины по продукту: **Postgres сайта** (сессии, readings, руны, кабинет). Bot SQLite — эфемерное TG-состояние (flow, reminders, legacy guest rows).

## Продуктовая модель

| Канал | Роль |
|-------|------|
| Сайт | Полный продукт + Login Widget / OAuth |
| Бот | Thin client: `POST /api/internal/bot/*` с `X-Bot-Internal-Secret` |

Один аккаунт = строка в `user_telegram_identities` (`telegram_user_id` ↔ `user_account_id`). После link бот синхронизирует `bot_users.zovus_user_id = profileUserId`.

## Internal API сайта (bot → site)

Все маршруты под `/api/internal/bot/`, auth: заголовок `X-Bot-Internal-Secret` = `BOT_INTERNAL_SECRET`.

| Endpoint | Назначение |
|----------|------------|
| `POST /resolve` | linked / accountId / profileUserId / runes / linkUrl |
| `POST /history` | общая история кабинета |
| `POST /reading` | детали сессии |
| `POST /spread` | полный триплет Вероники + биллинг рун как на сайте |
| `POST /daily` | энергия дня (`getOrCreateDailyReading`) |
| `POST /runes` | баланс + URL магазина |
| `POST /modules` | каталог разделов (native + deep-link) |
| `POST /cabinet` | обзор кабинета (натал, обряды, joint, дневник, память, support, photo) |
| `POST /natal` | big three / статус натала |
| `POST /numerology` | свободная матрица судьбы |
| `POST /support` | list / create / reply обращений |
| `POST /chat` | follow-up вопрос по sessionId (ChatOrchestrator + руны) |
| `POST /auth-bridge` | подтверждение входа/привязки с сайта (`/start a_<token>`) |

Сайт также: `POST|GET /api/auth/telegram/bridge` — создание challenge + poll/consume (кнопка «Войти через Telegram» без Login Widget /setdomain).

Env бота: `SITE_INTERNAL_BASE_URL=http://127.0.0.1:3000`, `BOT_INTERNAL_SECRET`, `BOT_REQUIRE_SITE_ACCOUNT=true`.

## Internal API бота (site → bot)

| Endpoint | Назначение |
|----------|------------|
| `POST /internal/receipt/verify` | guest receipt (legacy/claim) |
| `POST /internal/receipt/claim` | атомарный claim + `zovus_user_id` |
| `POST /internal/account-linked` | sync после Login Widget login/link |

## Claim (подмножество)

**claim** = продолжение **конкретного** guest receipt (`tg_receipt`) на сайте с теми же картами.

Claim **не** заменяет login/link. Для полного продукта достаточно `user_telegram_identities`.

| Поле token | Значение |
|------------|----------|
| Формат | `zg_` + base64url |
| Хранение | `sha256` в bot SQLite; `cta_url` до claim для resend |
| TTL | 7 суток |

## Словарь карт

Как на сайте: `tarot-veronika` / `veronika` / `triplet`, позиции Прошлое→Настоящее→Будущее.

## Лимиты

Продуктовый лимит «1 расклад/сутки в боте» **снят** для linked-пользователей. Действуют правила сайта (руны / guest entitlement / anti-abuse).

## Уведомления (типы)

`day_card | abandoned | reading_ready | runes_credited | reactivation | digest`
