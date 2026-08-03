# Zovus Telegram Bot — Stabilization Report

## 1. GIT

| Item | Value |
|------|--------|
| Baseline commit | `d4480909ace33846b5dd65147fd7a781b73f2ee4` |
| Tag | `bot-premium-v1` → same hash |
| `.gitignore` | `data/`, `*.sqlite*`, `.env*`, `assets/bot-avatar.jpg`, backups, collage-cache, logs, `node_modules/` |
| Removed from index | N/A (package was untracked; secrets never staged) |

Phase commits (telegram-bot only):

1. `d448090` chore(bot): premium phases 1-11 + timezone migration fix
2. `413921e` fix(bot): idempotency point-of-no-return and spread claim unique
3. `08efec7` fix(bot): declarative expected schema for ensureCriticalColumns
4. `9f729dc` fix(bot): move timezone prompt out of onboarding
5. `e28b21d` fix(bot): daily limits by user localDateKey with TZ-hop guard
6. `fcd8739` fix(bot): normalize safety text and expand crisis/medical/minor corpus
7. `b6d9826` fix(bot): expand audit coverage and wire pre-commit hook

## 2. IDEMPOTENCY

- **Point of no return:** `markIrreversible(ctx)` immediately after successful `claimSpreadSlot` (before draw/LLM).
- **Lock policy:** on handler error, `releaseUpdate` only if `!isIrreversible(ctx)`.
- **Spread key:** table `bot_spread_claims` PRIMARY KEY `(telegram_user_id, question_hash, local_date)`; `question_hash` = sha256 of normalized question text.
- **Events:** `duplicate_update_suppressed` on re-claim of `update_id` and on UNIQUE conflict.
- **Proof:** `npm run audit` — “exactly one session after retry”, “duplicate spread claim blocked”.

## 3. SCHEMA DB

### Migration 002 vs live (at audit time)

| Column / object | 002 | Live |
|-----------------|-----|------|
| bot_users.timezone_offset_minutes | ADD | present (via 003 + ensure) |
| bot_users.consent_version … timezone_asked_at | ADD | present |
| bot_guest_sessions.deck_id … expired_at | ADD | present |
| bot_llm_usage / bot_tts_usage | CREATE | present |
| idx_users_ref_code | CREATE | present |

**Phase-2 migration 004 for 002 gaps:** not created — no missing 002 columns after 003/ensure.  
**Note:** phase 1 used `004_spread_dedupe`; later additive migrations are `005_timezone_source`, `006_quota_day`.

### Fresh vs live

`npx tsx scripts/schema-diff.ts` → **SCHEMA COLUMN SETS MATCH (order may differ)**  
(`timezone_offset_minutes` appears later on live due to historical ALTER order.)

Declarative source: `src/db/expected-schema.ts`; `ensureCriticalColumns()` driven by it.

## 4. TZ

- Onboarding: age → consent → **salon menu** (no TZ step).
- Default: `timezone_offset_minutes=180`, `timezone_source='default'`.
- Soft ask after first full spread CTA (`timezoneAskSoft` + skip).
- Hard ask when enabling morning/evening reminders if `timezone_source !== 'user'`.
- Existing users with prior `timezone_asked_at` + offset → `timezone_source='user'` (migration 005 backfill).
- Profile/settings show label + how to change.

## 5. LIMITS

- `localDateKey(user, at)` in `src/domain/time/local-date.ts` used for: triplet count (`quota_day`), day card, LLM/TTS caps, reminders, streak, spread claims.
- Sessions store `quota_day` at create time.
- TZ-hop guard: if last draw &lt; 20h ago, its `quota_day` ≠ current local day, and no bonus → `canDrawTriplet` false.

## 6. SAFETY

| Corpus | Size |
|--------|------|
| crisis POSITIVE | 12 |
| crisis NEGATIVE | 8 |
| medical POSITIVE | 4 |
| medical NEGATIVE | 3 |
| minor POSITIVE | 3 |
| minor NEGATIVE | 2 |

Normalize: lower case, ё→е, homoglyphs, strip punct/spaces, collapse letter repeats.  
On crisis: no draw, no LLM, no session row, `crisis_detected` without question text.

## 7. AUDIT

- `npm run audit` → **42/42 OK**
- Checks: full expected schema, safety corpus, crisis side-effects, idempotency, emoji body/button rules, localDateKey TZ cases, TZ-hop, `zg_` tokens, fresh DB smoke.
- Pre-commit: `scripts/install-git-hooks.mjs` + `npm run prepare` / `hooks:install` appends bot audit to root `.git/hooks/pre-commit` when `telegram-bot/` is staged.

## 8. VERIFY (executed)

```
npm run lint          → OK (tsc --noEmit)
npm run typecheck     → OK
npm test              → OK (emoji + corpus)
npm run audit         → 42/42 OK
npm run build         → OK
migrate:up → down → up → OK; users row preserved (count=1)
schema-diff           → column sets match
```

`npm ci`: **failed once** with EPERM on `sharp-win32-x64.node` while bot process held the file; recovered via stop bot + `npm install`. Re-run `npm ci` only with bot stopped.

## 9. ACCEPTANCE

| Criterion | Result |
|-----------|--------|
| Commit + tag `bot-premium-v1`; sqlite/env not in index | PASS |
| Error after session + retry update → one session | PASS (audit) |
| UNIQUE (user, question_hash, local_date) | PASS |
| Fresh schema vs live; 002 gaps closed | PASS (sets match; no 004-for-002) |
| ensureCriticalColumns from declarative schema | PASS |
| New user to menu without TZ; reminders ask TZ; old users kept | PASS (code + migration 005) |
| Daily limit local midnight; TZ change no free second | PASS (audit) |
| Crisis POSITIVE/NEGATIVE corpus | PASS |
| Crisis: no draw/LLM/DB question; event logged | PASS |
| audit-bot all OK | PASS 42/42 |
| Button emoji kept; body without emoji | PASS |
| migrate up→down→up no row loss | PASS |
| git paths only telegram-bot for bot commits | PASS |

## 10. ДОПУЩЕНИЯ

1. Migration number `004` used for spread dedupe (phase 1); phase-2 “004 for gaps” skipped as N/A.
2. Soft TZ skip sets `timezone_asked_at` but leaves `timezone_source='default'`.
3. TZ-hop guard window = 20 hours (not specified in brief).
4. Admin metrics day key still uses `todayInTz()` / BOT_TZ (server report, not user quota).
5. `npm ci` requires bot stopped on Windows due to sharp native lock.

## 11. ОТКРЫТЫЕ ВОПРОСЫ ВЛАДЕЛЬЦУ

1. Нужен ли IANA timezone (`Europe/Samara`) вместо fixed UTC offset minutes?
2. Оставлять ли soft-ask TZ после **каждого** первого расклада только один раз навсегда (сейчас так)?
3. Какой CTA URL / `BOT_PUBLIC_BASE_URL` для продакшен-трекинга?
4. Подтвердить TTS-провайдер и дневные капы LLM/TTS.
5. Нужен ли weekly digest / broadcast worker?
6. Ротация bot token (ранее светился в чате)?

## 12. ЧТО НЕ СДЕЛАНО И ПОЧЕМУ

- Claim к БД aura-ai / сайт — запрет задачи.
- Stars / руны / Mini App / полный разбор в чате — запрет.
- Отдельная миграция «004 gaps» — gaps по 002 отсутствовали.
- Идеальный byte-identical `.schema` dump fresh vs live — порядок колонок ALTER отличается; множества колонок совпадают.
