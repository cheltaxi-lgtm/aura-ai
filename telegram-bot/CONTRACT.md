# Контракт Zovus ↔ Telegram bot (unified client)

Сайт и бот — **два клиента одного аккаунта**. Источник истины по продукту: **Postgres сайта** (сессии, readings, руны, кабинет). Bot SQLite — эфемерное TG-состояние (flow, reminders, legacy guest rows).

## Продуктовая модель

| Канал | Роль |
|-------|------|
| Сайт | Полный продукт + разрешённая авторизация (email / Яндекс ID / VK ID; позже телефон+SMS) |
| Бот | Thin client + канал уведомлений. **Не** система подтверждения личности |

Один аккаунт = строка в `user_telegram_identities` (`telegram_user_id` ↔ `user_account_id`). После link бот синхронизирует `bot_users.zovus_user_id = profileUserId`.

**Инвариант (149-ФЗ ч.10 ст.8):** нет «Входа через Telegram» / Login Widget / создания аккаунта по Telegram HMAC.
Аккаунт Zovus может быть создан **по оферте в боте** (age + terms) с синтетическим email и bind в `user_telegram_identities` — Telegram здесь канал договора, не заявленный способ авторизации.
Апгрейд (email / Яндекс / VK) — опционально через link-code. Запрещены Widget и `POST /api/auth/telegram`.

**Mini App bootstrap (разрешён):** `POST /api/auth/telegram/webapp` проверяет `initData` HMAC и выдаёт site session cookie **только** если `telegram_user_id` уже в `user_telegram_identities`. Не создаёт аккаунт и не заменяет Login Widget.

## Привязка Telegram (link-code)

1. Бот: `POST /api/internal/bot/link-code` → одноразовый `code` (TTL ~10 мин) + `linkUrl`.
2. Deep link: `/auth/telegram-link?code=…` на zovus.ru.
3. Пользователь проходит **разрешённую** авторизацию на сайте.
4. `POST /api/auth/telegram/link-code` (session required) → bind в `user_telegram_identities`.
5. Сайт уведомляет бота `POST /internal/account-linked`.

Запрещено и отключено (410):
- Telegram Login Widget / «Войти через Telegram»
- `POST /api/auth/telegram` (login / создание аккаунта по Telegram HMAC)
- Site→bot auth bridge `/start a_<token>` / `POST /api/internal/bot/auth-bridge`

Разрешено (не login):
- `POST /api/auth/telegram/webapp` — session bootstrap для **уже привязанных** (см. выше)

## Internal API сайта (bot → site)

Все маршруты под `/api/internal/bot/`, auth: заголовок `X-Bot-Internal-Secret` = `BOT_INTERNAL_SECRET`.

| Endpoint | Назначение |
|----------|------------|
| `POST /resolve` | linked / accountId / profileUserId / runes / linkUrl |
| `POST /ensure-account` | shell-аккаунт по оферте бота + TG bind |
| `POST /delete-account` | полное удаление аккаунта Zovus (152-ФЗ; `confirm: true`) |
| `POST /profile` | дата рождения / пол для bot-offer аккаунта |
| `POST /link-code` | выдать одноразовый код привязки / апгрейда (`/start link`) |
| `POST /history` | общая история кабинета |
| `POST /reading` | детали сессии |
| `POST /spread` | полный триплет Вероники + биллинг рун как на сайте |
| `POST /catalog` | полный каталог раскладов сайта (`/rasklady`: summary / list / item) |
| `POST /daily` | энергия дня (`getOrCreateDailyReading`) |
| `POST /runes` | баланс + URL магазина |
| `POST /modules` | каталог разделов (native + deep-link) |
| `POST /cabinet` | обзор кабинета |
| `POST /natal` | big three / статус натала |
| `POST /numerology` | матрица: `summary` / `list` / `get` / `run` (buy-once + биллинг как на сайте) |
| `POST /support` | list / create / reply обращений |
| `POST /chat` | API follow-up (продуктовый UX бота: deep-link `/?chat_session=` на сайт) |
| `POST /auth-bridge` | **disabled** (410) |

Env бота: `SITE_INTERNAL_BASE_URL=http://127.0.0.1:3000`, `BOT_INTERNAL_SECRET`, `BOT_REQUIRE_SITE_ACCOUNT=true` (в production `false` — hard-fail на старте).
Webhook mode: обязателен `TELEGRAM_WEBHOOK_SECRET` (≥32 символов); без секрета апдейты отклоняются.

## Internal API бота (site → bot)

| Endpoint | Назначение |
|----------|------------|
| `POST /internal/receipt/verify` | guest receipt (legacy/claim) |
| `POST /internal/receipt/claim` | атомарный claim + `zovus_user_id` |
| `POST /internal/account-linked` | sync после post-auth bind |
| `POST /internal/support-reply` | ответ админа по обращению → push в Telegram |

## Claim (подмножество)

**claim** = продолжение **конкретного** guest receipt (`tg_receipt`) на сайте с теми же картами.

Claim **не** заменяет login/link. Для полного продукта достаточно `user_telegram_identities` после site auth.

| Поле token | Значение |
|------------|----------|
| Формат | `zg_` + base64url |
| Хранение | `sha256` в bot SQLite; `cta_url` до claim для resend |
| TTL | 7 суток |

## Словарь карт

Как на сайте: `tarot-veronika` / `veronika` / `triplet`, позиции Прошлое→Настоящее→Будущее.

## Лимиты

Продуктовый лимит «1 расклад/сутки в боте» **снят** для linked-пользователей. Действуют правила сайта (руны / guest entitlement / anti-abuse).

`BOT_TRIPLET_DAILY_LIMIT` / `canDrawTriplet` — только legacy guest SQLite (тесты/аудиты), не gate продукта.

Без привязки: только анонимные/гостевые функции; кабинет и списания — после bind к авторизованному аккаунту.

## UX чтения в боте

Длинный разбор (расклад / матрица) — одно сообщение с pager ‹ ›. Обсуждение продолжается **на сайте** (`/?chat_session=<uuid>`), не чатом внутри бота.

## Уведомления (типы)

`day_card | abandoned | reading_ready | runes_credited | reactivation | digest`
