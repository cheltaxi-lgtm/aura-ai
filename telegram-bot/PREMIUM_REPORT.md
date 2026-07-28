# Premium upgrade report — Zovus Telegram Bot

## 1. DISCOVERY (до правок)

### Структура пакета
| Путь | Роль |
|------|------|
| `src/index.ts` | Entry: migrate, polling/webhook, reminder tick |
| `src/bot.ts` | grammY Bot + middleware stack |
| `src/flows/*` | start/spread/day/register |
| `src/middleware/stack.ts` | private, idempotency, rate-limit, flags |
| `src/domain/*` | deck, question, session token, teaser, tts |
| `src/render/card-collage.ts` | sharp collage |
| `src/copy/ru.ts` | texts |
| `src/db/*` | SQLite schema + repos |
| `src/admin/cli.ts` | ops CLI |
| `src/jobs/reminders.ts` | reminders tick |
| `src/http/server.ts` | health + webhook |
| `CONTRACT.md` | claim contract |

### Схема SQLite (до)
`bot_users`, `bot_guest_sessions` (question/cards/teaser/token_hash/expires/claimed), `bot_flow_state`, `bot_day_cards`, `bot_processed_updates`, `bot_events`, `bot_flags`, `bot_copy`, `bot_admin_audit`, `bot_jobs`, `bot_reminder_log`. WAL on. `zovus_user_id` уже был.

### Коллаж (до)
sharp, horizontal ~900×540, Georgia labels, assets `../public/decks/tarot-veronika`, `_back` unused.

### Copy (до)
Single strings, emoji in nav buttons, some `!` in system texts.

### LLM / reminders / flags (до)
OpenRouter + fallback; reminders by server TZ; flags: bot/day/reminders.

---

## 2. ИЗМЕНЕНИЯ ПО ФАЗАМ

| Фаза | Файлы | Суть |
|------|-------|------|
| 1 Ritual | `flows/ritual.ts`, `flows/spread.ts`, `render/card-collage.ts`, `config.ts` | Пауза → рубашки → editMessageMedia 1→2→3 → тизер отдельно → CTA третьим; флаг `ritual_reveal_enabled`; деградация; кэш `data/collage-cache/{session}-sN.jpg` |
| 2 Tone | `copy/ru.ts`, `keyboards/index.ts`, `no-emoji.test.ts` | Без эмодзи в теле; вариативность ×3; салонный тон; nav с ᚢ только на 2 кнопках |
| 3 TTS | `domain/tts/*`, `flows/spread.ts`, settings | `TtsProvider`, voice ogg, text/text_voice, cap + `tts_enabled`, тихий fallback |
| 4 Visual | `render/card-collage.ts` | 1400px long side, 4:5 vertical, рамка/градиент, Georgia; share watermark `zovus.ru` |
| 5 Safety | `domain/question/validate.ts`, spread | crisis без карт/без текста вопроса; medical/minor; `llm_enabled` + daily cap |
| 6 CTA | `http/server.ts`, `domain/session/token.ts` | `GET /r/:token` → `cta_click` → 302; rate-limit; invalid → zovus.ru |
| 7 Claim fields | `migrations/002_*`, repos, `CONTRACT.md` | deck_id, teaser_seed, consent_version, timezone, expire cron, token `zg_`+sha256 |
| 8 Retention | register, reminders, repos | timezone buttons; soft streak; milestones 3/7/30; reactivation 7/14/30 + unsub |
| 9 Viral | register share, profile ref | share image + switch_inline; `ref_<code>`; bonus_spreads only |
| 10 Ops | `ops/lock.ts`, admin, index | polling lock; backup; presence:sync; daily admin report; HTTP always |
| 11 Metrics | events + `admin report` | cta_click, ritual_*, voice_*, crisis_*, share_*, referral_*, timezone_set, reactivation_sent |

---

## 3. МИГРАЦИИ
- `001_baseline` (no-op marker)
- `002_premium_fields` (+ `.down.sql` снимает только запись migrations)
- Verify: `migrate:up` → `down` → `up` OK на локальной БД (колонки additive; down не дропает колонки SQLite — допущение)

---

## 4. CONTRACT.md
Обновлён: семантика claim, формат `zg_` token, sha256, TTL, словарь карт + reversed/deck_id/spread_id, позиции, профиль timezone/consent_version/ref_code.

---

## 5. FEATURE FLAGS (default)
| Flag | Default |
|------|---------|
| bot_enabled | true |
| day_card_enabled | true |
| reminders_enabled | true |
| ritual_reveal_enabled | true |
| tts_enabled | true |
| llm_enabled | true |
| share_card_enabled | true |
| weekly_digest_enabled | **false** (рендер дайджеста не реализован) |

---

## 6. НОВЫЕ СОБЫТИЯ
`cta_click`, `ritual_completed`, `voice_sent`, `voice_failed`, `crisis_detected`, `share_clicked`, `referral_joined`, `timezone_set`, `reactivation_sent`  
(+ существующие funnel events)

---

## 7. VERIFY
```
npm test              → ok: 35 body copy samples without emoji
npm run typecheck/lint/build → pass
npm run migrate:up / down / up → pass
CONTRACT.md exists → pass
git: telegram-bot/ untracked as package; no intentional site src edits in this task
```
`npm ci` — нет package-lock в пакете (используйте `npm install`).

---

## 8. ACCEPTANCE

| Критерий | Статус | Доказательство |
|----------|--------|----------------|
| Ритуал editMessageMedia + degrade + flag | PASS | `flows/ritual.ts`, flag env/DB |
| Нет эмодзи в теле | PASS | `npm test` |
| Системные тексты без «Ошибка» | PASS | `copy/ru.ts` |
| Voice как voice, settings, silent fail | PASS | spread + settings callbacks |
| Коллаж вертикальный ≥1280 | PASS | HEIGHT=1400 in collage |
| Crisis: нет карт, нет текста вопроса | PASS | validate + spread |
| GET /r/:token logs + 302 | PASS | `http/server.ts` |
| Новые поля + старые строки | PASS | additive ALTER |
| migrate up/down/up | PASS | CLI output |
| Напоминания по TZ пользователя | PASS | `localHourForUser` + tz buttons |
| Dual instance lock | PASS | `ops/lock.ts` |
| Лимит 1/сутки + bonus only | PASS | `canDrawTriplet` / `bonus_spreads` |
| Нет кода сайта | PASS | только `telegram-bot/` |
| Секреты в env | PASS | config dotenv |

---

## 9. ДОПУЩЕНИЯ
1. TTS через OpenRouter `/audio/speech` (если недоступен — тихий text-only).
2. `migrate:down` для SQLite не удаляет колонки (только снимает migration id).
3. Share использует slug из сохранённых cards; старые сессии без slug — fallback placeholder.
4. CTA tracking требует `BOT_PUBLIC_BASE_URL`; иначе кнопка ведёт напрямую на сайт (клик не логируется).
5. Скриншот после Telegram-сжатия не приложен (нет UI capture в CI) — размер файла локально ~JPEG q90 1400px.
6. Weekly digest: только флаг, без генерации изображения недели.
7. Broadcast queue ~30 msg/s не реализован как отдельный воркер (есть admin users list).
8. Retention D1/D7/D30 cohort SQL — упрощённый report (chip/free + teaser→cta), не полные когорты.
9. `setChatMenuButton` не вызывался (нужен URL Mini App — запрещён в этой фазе).

---

## 10. ОТКРЫТЫЕ ВОПРОСЫ ВЛАДЕЛЬЦУ
1. Какой публичный URL бота для `BOT_PUBLIC_BASE_URL` (CTA redirect)?
2. Подтвердить TTS-провайдер/модель (сейчас OpenRouter speech + voice `nova`).
3. `BOT_ADMIN_CHAT_ID` для дневного отчёта?
4. Целевой URL CTA: сейчас `BOT_CTA_TARGET_URL` default `https://zovus.ru` — ок?
5. Нужен ли weekly digest сразу (флаг выключен)?
6. Нужен ли полноценный broadcast worker сейчас?
7. Отозвать/ротировать bot token (светился в чатах ранее)?

---

## 11. ЧТО НЕ СДЕЛАНО И ПОЧЕМУ
- Weekly digest image — флаг есть, генерация отложена (мало ТЗ по макету).
- Full cohort retention D1/D7/D30 — нужен продуктовый SQL; сделан упрощённый admin report.
- Broadcast rate-limited queue — нет отдельного ТЗ по сегментам UI.
- setChatMenuButton — требует Mini App URL (запрет фазы).
- Screenshot proof of Telegram compression — нет visual CI.
- npm ci / package-lock — lockfile не генерировался в задании.
