# Контракт будущего коннекта Zovus ↔ Telegram bot

Автономный бот хранит гостевые расклады так, чтобы claim «те же карты» на сайте не требовал переписывания.

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
| Debug prefix | `plain_token_prefix` = первые N символов тела после `zg_` (дефолт N=6, `BOT_PLAIN_TOKEN_PREFIX_LEN`); полный plain token в БД не хранится |
| TTL | `expires_at` = created + 24h (конфиг `BOT_SESSION_TTL_HOURS`) |
| One-time | после claim `claimed_at` заполняется; повторный claim отклоняется |
| Пользователю | plain token не светится в чате; уходит в CTA `/r/:token` → 302 на сайт с `tg_receipt` |

### Почему N=6 безопасно для отладки

Тело токена — ~43 символа base64url от 32 байт (~256 бит). Префикс из 6 символов алфавита ~64 даёт порядка \(64^6 ≈ 2^{36}\) вариантов — это лишь малая доля пространства и **недостаточна** для восстановления полного токена или для online-brute-force claim (нужен полный `zg_…`). Поле служит для admin-поиска сессии и корреляции логов; старые строки без префикса остаются `NULL` (бэкфилл невозможен без plain token).

## Словарь карт (cards JSON)

```json
[
  {
    "id": 0,
    "name": "Шут",
    "position": 0,
    "reversed": false,
    "deck_id": "tarot-veronika",
    "spread_id": "triplet",
    "slug": "the-fool"
  }
]
```

Порядок позиций (`position` 0..2): **Прошлое → Настоящее → Будущее**.

`reversed`: bool (серверный draw, не всегда false).

## bot_guest_sessions → guest resume

| Бот | Сайт (цель) |
|-----|-------------|
| `question` | guest payload question |
| `cards` JSON | `GuestResumeSymbol[]` (+ deck_id/spread_id) |
| `master` = `veronika` | `character_key` |
| `system` / `deck_id` = `tarot-veronika` | `DeckSystem` |
| `spread_id` = `triplet` | guest spread id |
| `session_token_hash` | `guest_resume_token_hash` |
| `fingerprint` | `guest_resume_fingerprint` |
| `expires_at` | `guest_resume_expires_at` |
| `claimed_at` NULL | claimed timestamp / status |
| `teaser_text` + `teaser_prompt_version` + `teaser_model` + `teaser_seed` | teaser record |
| `expired_at` | soft-expire marker (cron) |

## Статус сессии и слот расклада

| `status` | Смысл |
|----------|--------|
| `pending` | сессия создана, тизер ещё не доставлен в чат |
| `ok` | тизер доставлен (`teaser_delivered_at` заполнен) |
| `failed` | расклад не состоялся; слот освобождён; строка сохранена |
| `NULL` | legacy; для квоты считается как `ok` |

Уникальность повторной попытки: `bot_spread_claims PRIMARY KEY (telegram_user_id, question_hash, local_date)`. При `failed` в окне 15 минут claim удаляется — повторный INSERT по тому же вопросу разрешён. После успешной доставки тизера слот не возвращается.

## Профиль

| Поле | Назначение |
|------|------------|
| `zovus_user_id` | закладка линковки |
| `timezone_offset_minutes` | локальные напоминания |
| `consent_version` | версия согласия |
| `ref_code` | виральность `t.me/bot?start=ref_<code>` |

## Провайдеры

- `DeckProvider` — local; позже HTTP API Zovus
- `generateTeaser` — OpenRouter / fallback
- `TtsProvider` — OpenRouter speech / silent fallback

## Уведомления (типы)

`day_card | abandoned | reading_ready | runes_credited | reactivation | digest`

`reading_ready` и `runes_credited` — no-op до коннекта.
