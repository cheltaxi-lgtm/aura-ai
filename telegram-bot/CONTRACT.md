# Контракт Zovus ↔ Telegram bot (этап 1)

Бот хранит гостевые расклады так, чтобы claim на сайте продолжал **те же карты**.

## Claim semantics (явно)

**claim** = authenticated resumed guest reading: пользователь на сайте продолжает **тот же** guest-расклад (те же карты, тот же вопрос) через `tg_receipt` / session token.

Claim **не** является:
- «Картой дня»
- daily UI сайта
- новым раскладом с новой генерацией карт

## session_token

| Поле | Значение |
|------|----------|
| Формат | `zg_` + base64url (32 байта энтропии) |
| Алфавит | `A-Za-z0-9_-` после префикса |
| Хранение | только `sha256(token)` hex в `session_token_hash` |
| Debug prefix | `plain_token_prefix` = первые N символов тела после `zg_` (дефолт N=6) |
| TTL | `expires_at` = created + **7 суток** (дефолт `BOT_SESSION_TTL_HOURS=168`) |
| One-time | после claim `claimed_at` заполняется атомарно; повтор → `already_claimed` |
| Claimable | `claimable=1` и `schema_version=1` у новых сессий; legacy → `claimable=0` (неклеймабельные) |
| Пользователю | plain token не в чате; CTA `/r/:token` → 302 с `tg_receipt` |

### Почему N=6 безопасно для отладки

Тело токена — ~43 символа base64url от 32 байт (~256 бит). Префикс из 6 символов алфавита ~64 даёт порядка \(64^6 ≈ 2^{36}\) вариантов — недостаточно для восстановления полного токена.

## Словарь карт (совпадает с сайтом)

Canonical IDs: major `0..21`, minor `22..77` (suits cups→wands→swords→pentacles × ace…king).

Site claim shape (`GuestResumeSymbol`):

```json
[
  { "id": 0, "name": "Шут", "position": 0, "reversed": false },
  { "id": 22, "name": "Туз Кубков", "position": 1, "reversed": true },
  { "id": 55, "name": "5 Мечей", "position": 2, "reversed": false }
]
```

В SQLite бота могут храниться также `deck_id`, `spread_id`, `slug` — при claim/verify отдаются только site fields.

| Поле | Значение |
|------|----------|
| `system` / deck | `tarot-veronika` |
| `master` | `veronika` |
| `spread_id` | `triplet` |
| Позиции `0..2` | **Прошлое → Настоящее → Будущее** |
| `reversed` | bool |
| Fingerprint | `sha256(system\|masterId\|spreadId\|id:pos:rev…)` — байт-в-байт как на сайте |

## Коды ошибок internal receipt API

| Код | HTTP | Смысл |
|-----|------|--------|
| `unauthorized` | 401 | неверный internal secret |
| `invalid_token` | 400/404 | токен невалиден или сессия не найдена |
| `expired` | 410 | `expires_at` прошёл |
| `already_claimed` | 409 | `claimed_at` уже заполнен |
| `unclaimable` | 409 | `claimable=0` (legacy) |
| `ok` | 200 | verify / claim успех |

## bot_guest_sessions → guest resume

| Бот | Сайт |
|-----|------|
| `question` | guest payload question |
| `cards` → site symbols | `GuestResumeSymbol[]` |
| `master` = `veronika` | `character_key` |
| `system` = `tarot-veronika` | `DeckSystem` |
| `spread_id` = `triplet` | guest spread id |
| `session_token_hash` | (бот — source of truth для tg token) |
| `fingerprint` | `guest_resume_fingerprint` |
| `expires_at` | TTL 7d |
| `claimed_at` | one-time |
| `claimable` / `schema_version` | eligibility |

## Статус сессии и слот расклада

| `status` | Смысл |
|----------|--------|
| `pending` | сессия создана, тизер ещё не доставлен |
| `ok` | тизер доставлен |
| `failed` | расклад не состоялся; слот освобождён |

## Профиль

| Поле | Назначение |
|------|------------|
| `zovus_user_id` | id профиля/аккаунта Zovus после link/claim |
| `timezone_offset_minutes` | локальные напоминания |
| `consent_version` | версия согласия |
| `ref_code` | виральность |

## Internal API (этап 1)

- `POST /internal/receipt/verify` — секрет в заголовке; возвращает данные сессии или код ошибки.
- `POST /internal/receipt/claim` — атомарно ставит `claimed_at` + `zovus_user_id` на пользователе бота.

## Уведомления (типы)

`day_card | abandoned | reading_ready | runes_credited | reactivation | digest`
