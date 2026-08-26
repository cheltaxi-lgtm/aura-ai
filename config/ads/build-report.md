# Ads Autopilot — build report

Updated: 2026-07-28 (budget guards B1–B7)

## Budget protection layer (B1–B7) — inventory

| ID | Уже было | Добавлено сейчас |
| --- | --- | --- |
| B1 hard total | soft caps K1/K4/D2/D3, total_budget в yaml | `guard/budget.ts`, ledger, cron `ads-budget-guard`, `assertBudgetAvailable`, immutable `hard_total_budget_rub` |
| B2 freshness | — | `guard/freshness.ts`, cron `ads-freshness-guard`, fail streak в sync-stats |
| B3 landing | D4/K3 (clicks→deck/reg) | `guard/landing.ts`, cron `ads-landing-check`, resume only non-CPA |
| B4 expensive cfg | creative/keyword/goal validator | расширен `validateDiscoveryCampaignConfig` (поиск, регион, автотаргет, freq, strategy…) |
| B5 approval | TTL + money→approval | impact preview, typed confirm >2×, server expired reject |
| B6 forgotten test | — | `guard/max-days.ts`, cron `ads-max-days-guard` + `ads-weekly-digest` (in-app notify) |
| B7 emergency | stop UI + `/api/ads/admin/stop` | `/emergency-stop` + `requireAdmin` 403, `scripts/ads-stop.ts` Direct-only |

D4/K3: **уже было** — не дублировали.

## Final verifier (B1–B7 tranche)

**SUMMARY PASS=37 FAIL=0 WAITING=3** (V03/V06/V12). V26–V40 all PASS after iteration fixing V30 `failStreak` name.

## Sources dashboard (post-push)

- Migration `085_migrate_ads_source_snapshots.sql` — `source_snapshot`, metrika/webmaster caches, `ads.observe`
- Admin tab **Источники** + cron `ads-sync-sources` — Direct/Metrika/Webmaster read-only (balance 0 OK)
- Admin access: `ads.enabled` **or** `ads.observe` (default on)

## Final verifier (latest)

| ID | Status | Reason |
| --- | --- | --- |
| V01 | PASS | ads tsc clean; pre-existing non-ads tsc debt — ДОПУЩЕНИЕ |
| V02 | PASS | ads imports only in allowed existing files (+ middleware ДОПУЩЕНИЕ) |
| V03 | WAITING | 084 SQL ok; local Postgres unreachable to apply |
| V04 | PASS | ads.enabled=false → 404 + beacon omitted |
| V05 | PASS | DB guard rejects public INSERT |
| V06 | WAITING | DB unreachable for attribution integration |
| V07–V11 | PASS | unit suite |
| V12 | WAITING | sandbox login not linked to Direct |
| V13–V25 | PASS | unit / static checks |

**SUMMARY: FAIL=0** (WAITING: V03, V06, V12)

## Iteration log

### Iteration 1
- Wired layout `AdsBeaconServer`, AdminShell nav under flag, middleware public `/api/ads/t|e`
- Fixed cron ads-rules / ads-search-queries context & approval shapes
- Added unit suite, ads-verify V01–V25, ads-semantics/plan/smoke/attribution scripts
- FAIL: V03 migrate regex, V06 empty ECONNREFUSED
- Fixed → FAIL=0

### Iteration 2
- V03/V06 → WAITING when DB down; V12 WAITING sandbox login
- Exit condition pure helper + rules cron

## Isolation (allowed existing edits)

1. `src/app/layout.tsx` — `<AdsBeaconServer />`
2. `src/components/admin/AdminShell.tsx` — «Реклама» nav when ads APIs not 404
3. `src/middleware.ts` — ДОПУЩЕНИЕ: public `/api/ads/t`, `/api/ads/e`

New code only under `src/modules/ads/**`, `src/app/(ads)/**`, `config/ads/**`, `scripts/ads*`, `scripts/migrations/084_*`.

## Migrations

- `084_migrate_ads_schema.sql`: `CREATE SCHEMA ads` + tables click, click_user, conversion, config, entity_snapshot, daily_stats, keyword_candidate, negative_keyword, search_query, funnel_daily, economics_snapshot, approval_request, rule_log, action_log, alert
- No FK to `public.*`; rollback: `DROP SCHEMA ads CASCADE;`
- Apply when DB up: `npm run migrate`

## Env (names only)

| Name | Example |
| --- | --- |
| ADS_ENABLED | false |
| ADS_RULES_MODE | dry_run |
| ADS_AUTOPILOT_WRITE | 0 |
| ADS_ALLOW_DIRECT_WRITE | 0 (smoke=1) |
| ADS_DATABASE_URL | (optional; else DATABASE_URL) |
| ADS_DIRECT_* / METRIKA_* / goals | see `.env.example` |

## Cron routes

| Path | Schedule (owner) | Without secret | API down |
| --- | --- | --- |
| `/api/cron/ads-collect-conversions` | hourly+ | 401 | n/a |
| `/api/cron/ads-funnel-rollup` | daily | 401 | n/a |
| `/api/cron/ads-sync-stats` | hourly | 401 | fail streak++; ≥3 → pause ALL |
| `/api/cron/ads-sync-entities` | hourly | 401 | log/alert |
| `/api/cron/ads-semantics` | daily | 401 | degrade |
| `/api/cron/ads-economics` | daily | 401 | skip |
| `/api/cron/ads-offline-conversions` | daily | 401 | skip |
| `/api/cron/ads-search-queries` | daily | 401 | skip |
| `/api/cron/ads-rules` | hourly | 401 | skip |
| `/api/cron/ads-sync-sources` | hourly | 401 | snapshot ok=false |
| `/api/cron/ads-budget-guard` | **/15 min** | 401 | pause if ledger≥hard; Direct estimate best-effort |
| `/api/cron/ads-freshness-guard` | hourly | 401 | stale/missing → pause ALL |
| `/api/cron/ads-landing-check` | hourly | 401 | non-200/timeout → pause by landing |
| `/api/cron/ads-max-days-guard` | daily | 401 | >discovery_max_days → pause |
| `/api/cron/ads-weekly-digest` | weekly | 401 | in-app notify only |

All also 404 when `ads.enabled=false` (except observe-only Sources where applicable).
Guards B1–B7 ignore `ads.rules.enabled` / `ADS_RULES_MODE` / `ads.autopilot.write`; safety pauses use Direct `safetyPause`.

## Migration 086

- Tables: `ads.budget_ledger`, `ads.health_check`
- Nullable: `ads.entity_snapshot.pause_reason`
- Config: `hard_total_budget_rub=9000`, `budget_warn_pct=90`, `stats_stale_warn_hours=24`, `stats_stale_stop_hours=48`, `discovery_max_days=45`, `landing_timeout_ms=5000`, `guard.sync_stats_fail_streak`, `guard.landing_paused_ids`, `guard.cpa_paused_ids`, `guard.protection_status`

## Spend limits: physical vs programmatic

| Layer | What |
| --- | --- |
| Physical (Yandex cabinet) | Account balance; campaign daily budget in Direct UI; shared account limits |
| Programmatic (this module) | hard_total 9000 + pause; assertBudgetAvailable before writes; discovery daily/CPA/freq validators; soft K/D pauses; emergency-stop; ads-stop.ts |

## Owner checklist (Yandex Direct UI)

1. Пополнить баланс (C4 BLOCKER: 0 ₽).
2. Подключить логин к Директу (sandbox/prod) — иначе V12/ads-stop FAIL.
3. В кампаниях discovery: только Поиск; автотаргетинг OFF; регионы явно; без РГТ; не ручные ставки если запрещены валидатором.
4. Дневной бюджет кампании ≤ discovery_daily_cap; общий кабинетный потолок ≥ programmatic hard_total.
5. После деплоя: `npm run migrate` (084–086); cron schedule для новых guard-роутов; ADS_ENABLED=true только после dry_run.

## Action → auto or approval

| Action | Mode |
| --- | --- |
| Pause on K1–K4 / D1–D4 / D6 | auto only if `ADS_RULES_MODE=apply` |
| D5 teaser alert | alert only, never pause |
| Budget / bid / global cap increase | `approval_request` only |
| Goal switch / new landing / mode_switch | `approval_request` only |
| Offline upload spread_submit | never |
| Discovery exit | approval `mode_switch`, mode unchanged |

## Default thresholds

From `config/ads/budget.yaml` + seed `ads.config`: daily cap 300 ₽, total 9000, target CPA reg 150, max CPA 400, target regs 100, freq 100–5000, approval TTL 48h.

## Admin tabs

Overview · Campaign · Approvals · Semantics · Economics · Rules · Alerts · Settings (+ emergency stop API).

## BLOCKERS / WAITING

- C4 Direct balance 0 ₽ (owner top-up)
- Local Postgres down → migrate + attribution WAITING
- Sandbox Direct login not connected → V12 WAITING

## ДОПУЩЕНИЯ

- Middleware as 3rd existing-file edit
- Pre-existing tsc debt (vitest / telegram-bot) outside ads
- Ads alert email: in-app only
- Cabinet weekly min 7000 vs programmatic daily 300

## Intentionally not done

- Live money spend / production campaign push (flags off, dry_run default)
- package.json scripts (isolation — run via `npx tsx`)

### Iteration 2026-07-28T14:17:51.134Z

| ID | Status | Reason |
| --- | --- | --- |
| V01 | PASS | ads tsc clean; pre-existing non-ads tsc debt (2) — ДОПУЩЕНИЕ |
| V02 | PASS | ads imports only in allowed existing files: (ads tree only) |
| V03 | WAITING | 084 SQL ok (schema ads only; no public FK); DB unreachable to apply |
| V04 | PASS | ads.enabled=false → 404 gate + beacon omitted |
| V05 | PASS | DB guard unit ok |
| V06 | WAITING | DB unreachable or ads schema not applied yet |
| V07 | PASS | D1–D8 / K1–K4 covered by ads-unit |
| V08 | PASS | classifier covered by ads-unit |
| V09 | PASS | validator covered by ads-unit |
| V10 | PASS | semantics degrade covered by ads-unit |
| V11 | PASS | no landing covered by ads-unit |
| V12 | WAITING | WAITING/FAIL: Ваш логин не подключен к Яндекс.Директу
 |
| V13 | PASS | dry_run write block covered by ads-unit |
| V14 | PASS | no secrets in .next/static |
| V15 | PASS | cron-auth 401 + 9 ads cron routes guarded |
| V16 | PASS | admin pages + action_log helper present |
| V17 | PASS | kill-switch covered by ads-unit |
| V18 | PASS | forbidden goals covered by ads-unit |
| V19 | PASS | economics covered by ads-unit |
| V20 | PASS | money approval covered by ads-unit |
| V21 | PASS | ROMI gated covered by ads-unit |
| V22 | PASS | D5 no pause covered by ads-unit |
| V23 | PASS | exit mode_switch covered by ads-unit |
| V24 | PASS | offline no spread_submit covered by ads-unit |
| V25 | PASS | sample < 100 covered by ads-unit |

SUMMARY PASS=22 FAIL=0 WAITING=3 SKIP=0

### Iteration 2026-07-28T14:45:33.246Z

| ID | Status | Reason |
| --- | --- | --- |
| V01 | PASS | ads tsc clean; pre-existing non-ads tsc debt (2) — ДОПУЩЕНИЕ |
| V02 | PASS | ads imports only in allowed existing files: (ads tree only) |
| V03 | WAITING | 084 SQL ok (schema ads only; no public FK); DB unreachable to apply |
| V04 | PASS | ads.enabled=false → 404 gate + beacon omitted |
| V05 | PASS | DB guard unit ok |
| V06 | WAITING | DB unreachable or ads schema not applied yet |
| V07 | PASS | D1–D8 / K1–K4 covered by ads-unit |
| V08 | PASS | classifier covered by ads-unit |
| V09 | PASS | validator covered by ads-unit |
| V10 | PASS | semantics degrade covered by ads-unit |
| V11 | PASS | no landing covered by ads-unit |
| V12 | WAITING | WAITING/FAIL: 
 |
| V13 | PASS | dry_run write block covered by ads-unit |
| V14 | PASS | no secrets in .next/static |
| V15 | PASS | cron-auth 401 + 15 ads cron routes guarded |
| V16 | PASS | admin pages + action_log helper present |
| V17 | PASS | kill-switch covered by ads-unit |
| V18 | PASS | forbidden goals covered by ads-unit |
| V19 | PASS | economics covered by ads-unit |
| V20 | PASS | money approval covered by ads-unit |
| V21 | PASS | ROMI gated covered by ads-unit |
| V22 | PASS | D5 no pause covered by ads-unit |
| V23 | PASS | exit mode_switch covered by ads-unit |
| V24 | PASS | offline no spread_submit covered by ads-unit |
| V25 | PASS | sample < 100 covered by ads-unit |
| V26 | PASS | hard budget pause independent of flags (safetyPause) |
| V27 | PASS | assertBudgetAvailable on Direct create/resume |
| V28 | PASS | hard_total immutable via setConfigJson |
| V29 | PASS | 48h stale stats → pause |
| V30 | FAIL | 3× sync-stats fail → pause |
| V31 | PASS | landing 500/timeout pauses campaigns |
| V32 | PASS | landing resume skips CPA-paused |
| V33 | PASS | RSYA/autotargeting blocked in validator |
| V34 | PASS | campaign without region blocked |
| V35 | PASS | freq above discovery_freq_max blocked |
| V36 | PASS | expired TTL rejected server-side |
| V37 | PASS | approval >2× requires typed confirm |
| V38 | PASS | discovery_max_days pause |
| V39 | PASS | ads-stop.ts Direct-only dry-run |
| V40 | PASS | emergency-stop admin-only 403 |

SUMMARY PASS=36 FAIL=1 WAITING=3 SKIP=0

### Iteration 2026-07-28T14:46:01.767Z

| ID | Status | Reason |
| --- | --- | --- |
| V01 | PASS | ads tsc clean; pre-existing non-ads tsc debt (2) — ДОПУЩЕНИЕ |
| V02 | PASS | ads imports only in allowed existing files: (ads tree only) |
| V03 | WAITING | 084 SQL ok (schema ads only; no public FK); DB unreachable to apply |
| V04 | PASS | ads.enabled=false → 404 gate + beacon omitted |
| V05 | PASS | DB guard unit ok |
| V06 | WAITING | DB unreachable or ads schema not applied yet |
| V07 | PASS | D1–D8 / K1–K4 covered by ads-unit |
| V08 | PASS | classifier covered by ads-unit |
| V09 | PASS | validator covered by ads-unit |
| V10 | PASS | semantics degrade covered by ads-unit |
| V11 | PASS | no landing covered by ads-unit |
| V12 | WAITING | WAITING/FAIL: 
 |
| V13 | PASS | dry_run write block covered by ads-unit |
| V14 | PASS | no secrets in .next/static |
| V15 | PASS | cron-auth 401 + 15 ads cron routes guarded |
| V16 | PASS | admin pages + action_log helper present |
| V17 | PASS | kill-switch covered by ads-unit |
| V18 | PASS | forbidden goals covered by ads-unit |
| V19 | PASS | economics covered by ads-unit |
| V20 | PASS | money approval covered by ads-unit |
| V21 | PASS | ROMI gated covered by ads-unit |
| V22 | PASS | D5 no pause covered by ads-unit |
| V23 | PASS | exit mode_switch covered by ads-unit |
| V24 | PASS | offline no spread_submit covered by ads-unit |
| V25 | PASS | sample < 100 covered by ads-unit |
| V26 | PASS | hard budget pause independent of flags (safetyPause) |
| V27 | PASS | assertBudgetAvailable on Direct create/resume |
| V28 | PASS | hard_total immutable via setConfigJson |
| V29 | PASS | 48h stale stats → pause |
| V30 | PASS | 3× sync-stats fail → pause |
| V31 | PASS | landing 500/timeout pauses campaigns |
| V32 | PASS | landing resume skips CPA-paused |
| V33 | PASS | RSYA/autotargeting blocked in validator |
| V34 | PASS | campaign without region blocked |
| V35 | PASS | freq above discovery_freq_max blocked |
| V36 | PASS | expired TTL rejected server-side |
| V37 | PASS | approval >2× requires typed confirm |
| V38 | PASS | discovery_max_days pause |
| V39 | PASS | ads-stop.ts Direct-only dry-run |
| V40 | PASS | emergency-stop admin-only 403 |

SUMMARY PASS=37 FAIL=0 WAITING=3 SKIP=0

### Iteration 2026-07-28T14:50:07.265Z

| ID | Status | Reason |
| --- | --- | --- |
| V01 | PASS | ads tsc clean; pre-existing non-ads tsc debt (2) — ДОПУЩЕНИЕ |
| V02 | PASS | ads imports only in allowed existing files: (ads tree only) |
| V03 | WAITING | 084 SQL ok (schema ads only; no public FK); DB unreachable to apply |
| V04 | PASS | ads.enabled=false → 404 gate + beacon omitted |
| V05 | PASS | DB guard unit ok |
| V06 | WAITING | DB unreachable or ads schema not applied yet |
| V07 | PASS | D1–D8 / K1–K4 covered by ads-unit |
| V08 | PASS | classifier covered by ads-unit |
| V09 | PASS | validator covered by ads-unit |
| V10 | PASS | semantics degrade covered by ads-unit |
| V11 | PASS | no landing covered by ads-unit |
| V12 | WAITING | WAITING/FAIL: 
 |
| V13 | PASS | dry_run write block covered by ads-unit |
| V14 | PASS | no secrets in .next/static |
| V15 | PASS | cron-auth 401 + 15 ads cron routes guarded |
| V16 | PASS | admin pages + action_log helper present |
| V17 | PASS | kill-switch covered by ads-unit |
| V18 | PASS | forbidden goals covered by ads-unit |
| V19 | PASS | economics covered by ads-unit |
| V20 | PASS | money approval covered by ads-unit |
| V21 | PASS | ROMI gated covered by ads-unit |
| V22 | PASS | D5 no pause covered by ads-unit |
| V23 | PASS | exit mode_switch covered by ads-unit |
| V24 | PASS | offline no spread_submit covered by ads-unit |
| V25 | PASS | sample < 100 covered by ads-unit |
| V26 | PASS | hard budget pause independent of flags (safetyPause) |
| V27 | PASS | assertBudgetAvailable on Direct create/resume |
| V28 | PASS | hard_total immutable via setConfigJson |
| V29 | PASS | 48h stale stats → pause |
| V30 | PASS | 3× sync-stats fail → pause |
| V31 | PASS | landing 500/timeout pauses campaigns |
| V32 | PASS | landing resume skips CPA-paused |
| V33 | PASS | RSYA/autotargeting blocked in validator |
| V34 | PASS | campaign without region blocked |
| V35 | PASS | freq above discovery_freq_max blocked |
| V36 | PASS | expired TTL rejected server-side |
| V37 | PASS | approval >2× requires typed confirm |
| V38 | PASS | discovery_max_days pause |
| V39 | PASS | ads-stop.ts Direct-only dry-run |
| V40 | PASS | emergency-stop admin-only 403 |

SUMMARY PASS=37 FAIL=0 WAITING=3 SKIP=0

### Iteration 2026-07-28T14:54:43.255Z

| ID | Status | Reason |
| --- | --- | --- |
| V01 | PASS | ads tsc clean; pre-existing non-ads tsc debt (2) — ДОПУЩЕНИЕ |
| V02 | PASS | ads imports only in allowed existing files: (ads tree only) |
| V03 | WAITING | 084 SQL ok (schema ads only; no public FK); DB unreachable to apply |
| V04 | PASS | ads.enabled=false → 404 gate + beacon omitted |
| V05 | PASS | DB guard unit ok |
| V06 | WAITING | DB unreachable or ads schema not applied yet |
| V07 | PASS | D1–D8 / K1–K4 covered by ads-unit |
| V08 | PASS | classifier covered by ads-unit |
| V09 | PASS | validator covered by ads-unit |
| V10 | PASS | semantics degrade covered by ads-unit |
| V11 | PASS | no landing covered by ads-unit |
| V12 | WAITING | WAITING/FAIL: 
 |
| V13 | PASS | dry_run write block covered by ads-unit |
| V14 | PASS | no secrets in .next/static |
| V15 | PASS | cron-auth 401 + 15 ads cron routes guarded |
| V16 | PASS | admin pages + action_log helper present |
| V17 | PASS | kill-switch covered by ads-unit |
| V18 | PASS | forbidden goals covered by ads-unit |
| V19 | PASS | economics covered by ads-unit |
| V20 | PASS | money approval covered by ads-unit |
| V21 | PASS | ROMI gated covered by ads-unit |
| V22 | PASS | D5 no pause covered by ads-unit |
| V23 | PASS | exit mode_switch covered by ads-unit |
| V24 | PASS | offline no spread_submit covered by ads-unit |
| V25 | PASS | sample < 100 covered by ads-unit |
| V26 | PASS | hard budget pause independent of flags (safetyPause) |
| V27 | PASS | assertBudgetAvailable on Direct create/resume |
| V28 | PASS | hard_total immutable via setConfigJson |
| V29 | PASS | 48h stale stats → pause |
| V30 | PASS | 3× sync-stats fail → pause |
| V31 | PASS | landing 500/timeout pauses campaigns |
| V32 | PASS | landing resume skips CPA-paused |
| V33 | PASS | RSYA/autotargeting blocked in validator |
| V34 | PASS | campaign without region blocked |
| V35 | PASS | freq above discovery_freq_max blocked |
| V36 | PASS | expired TTL rejected server-side |
| V37 | PASS | approval >2× requires typed confirm |
| V38 | PASS | discovery_max_days pause |
| V39 | PASS | ads-stop.ts Direct-only dry-run |
| V40 | PASS | emergency-stop admin-only 403 |

SUMMARY PASS=37 FAIL=0 WAITING=3 SKIP=0

### Iteration 2026-08-26T09:23:36.381Z

| ID | Status | Reason |
| --- | --- | --- |
| V01 | FAIL | ads tsc: src/modules/ads/admin/WordstatPanel.tsx(165,19): error TS1381: Unexpected token. Did you mean `{'}'}` or `&rbrace;`? |
| V02 | PASS | ads imports only in allowed existing files: (ads tree only) |
| V03 | PASS | 084 migration present + migrate ok; public untouched in SQL |
| V04 | PASS | ads.enabled=false → 404 gate + beacon omitted |
| V05 | PASS | DB guard unit ok |
| V06 | PASS | attribution integration ok |
| V07 | PASS | D1–D8 / K1–K4 covered by ads-unit |
| V08 | PASS | classifier covered by ads-unit |
| V09 | PASS | validator covered by ads-unit |
| V10 | PASS | semantics degrade covered by ads-unit |
| V11 | PASS | no landing covered by ads-unit |
| V12 | WAITING | WAITING/FAIL: Ваш логин не подключен к Яндекс.Директу
 |
| V13 | PASS | dry_run write block covered by ads-unit |
| V14 | PASS | no secrets in .next/static |
| V15 | FAIL | cron-auth 401 + 15 routes + install-crons.sh schedules 16 ads jobs |
| V16 | PASS | admin pages + action_log helper present |
| V17 | PASS | kill-switch covered by ads-unit |
| V18 | PASS | forbidden goals covered by ads-unit |
| V19 | PASS | economics covered by ads-unit |
| V20 | PASS | money approval covered by ads-unit |
| V21 | PASS | ROMI gated covered by ads-unit |
| V22 | PASS | D5 no pause covered by ads-unit |
| V23 | PASS | exit mode_switch covered by ads-unit |
| V24 | PASS | offline no spread_submit covered by ads-unit |
| V25 | PASS | sample < 100 covered by ads-unit |
| V26 | PASS | hard budget pause independent of flags (safetyPause) |
| V27 | PASS | assertBudgetAvailable on Direct create/resume |
| V28 | PASS | hard_total immutable via setConfigJson |
| V29 | PASS | 48h stale stats → pause |
| V30 | PASS | 3× sync-stats fail → pause |
| V31 | PASS | landing 500/timeout pauses campaigns |
| V32 | PASS | landing resume skips CPA-paused |
| V33 | PASS | RSYA/autotargeting blocked in validator |
| V34 | PASS | campaign without region blocked |
| V35 | PASS | freq above discovery_freq_max blocked |
| V36 | PASS | expired TTL rejected server-side |
| V37 | PASS | approval >2× requires typed confirm |
| V38 | PASS | discovery_max_days pause |
| V39 | PASS | ads-stop.ts Direct-only dry-run |
| V40 | PASS | emergency-stop admin-only 403 |
| V41 | PASS | analytics Metrika/Webmaster isolated via allSettled |
| V42 | PASS | 139 job_run + organic registry + experiments |
| V43 | PASS | /api/ads/admin/diagnostics present |
| V44 | PASS | READ crons use runAdsCronJob (observe), not requireAdsEnabled |
| V45 | PASS | AdsAdminNav integrated SEO tabs; no /admin/seo |
| V46 | PASS | opportunity score 4–10/11–20/21–30 bands |
| V47 | PASS | admin nav label Продвижение keeps /admin/ads |
| V48 | PASS | generic cron-ads-job.sh + all ads crons recorded |

SUMMARY PASS=45 FAIL=2 WAITING=1 SKIP=0

### Iteration 2026-08-26T09:27:23.216Z

| ID | Status | Reason |
| --- | --- | --- |
| V01 | PASS | tsc --noEmit green |
| V02 | PASS | ads imports only in allowed existing files: (ads tree only) |
| V03 | PASS | 084 migration present + migrate ok; public untouched in SQL |
| V04 | PASS | ads.enabled=false → 404 gate + beacon omitted |
| V05 | PASS | DB guard unit ok |
| V06 | PASS | attribution integration ok |
| V07 | PASS | D1–D8 / K1–K4 covered by ads-unit |
| V08 | PASS | classifier covered by ads-unit |
| V09 | PASS | validator covered by ads-unit |
| V10 | PASS | semantics degrade covered by ads-unit |
| V11 | PASS | no landing covered by ads-unit |
| V12 | WAITING | WAITING/FAIL: Ваш логин не подключен к Яндекс.Директу
 |
| V13 | PASS | dry_run write block covered by ads-unit |
| V14 | PASS | no secrets in .next/static |
| V15 | PASS | cron-auth 401 + 15 routes + install-crons.sh schedules 15 ads jobs |
| V16 | PASS | admin pages + action_log helper present |
| V17 | PASS | kill-switch covered by ads-unit |
| V18 | PASS | forbidden goals covered by ads-unit |
| V19 | PASS | economics covered by ads-unit |
| V20 | PASS | money approval covered by ads-unit |
| V21 | PASS | ROMI gated covered by ads-unit |
| V22 | PASS | D5 no pause covered by ads-unit |
| V23 | PASS | exit mode_switch covered by ads-unit |
| V24 | PASS | offline no spread_submit covered by ads-unit |
| V25 | PASS | sample < 100 covered by ads-unit |
| V26 | PASS | hard budget pause independent of flags (safetyPause) |
| V27 | PASS | assertBudgetAvailable on Direct create/resume |
| V28 | PASS | hard_total immutable via setConfigJson |
| V29 | PASS | 48h stale stats → pause |
| V30 | PASS | 3× sync-stats fail → pause |
| V31 | PASS | landing 500/timeout pauses campaigns |
| V32 | PASS | landing resume skips CPA-paused |
| V33 | PASS | RSYA/autotargeting blocked in validator |
| V34 | PASS | campaign without region blocked |
| V35 | PASS | freq above discovery_freq_max blocked |
| V36 | PASS | expired TTL rejected server-side |
| V37 | PASS | approval >2× requires typed confirm |
| V38 | PASS | discovery_max_days pause |
| V39 | PASS | ads-stop.ts Direct-only dry-run |
| V40 | PASS | emergency-stop admin-only 403 |
| V41 | PASS | analytics Metrika/Webmaster isolated via allSettled |
| V42 | PASS | 139 job_run + organic registry + experiments |
| V43 | PASS | /api/ads/admin/diagnostics present |
| V44 | PASS | READ crons use runAdsCronJob (observe), not requireAdsEnabled |
| V45 | PASS | AdsAdminNav integrated SEO tabs; no /admin/seo |
| V46 | PASS | opportunity score 4–10/11–20/21–30 bands |
| V47 | PASS | admin nav label Продвижение keeps /admin/ads |
| V48 | PASS | generic cron-ads-job.sh + all ads crons recorded |

SUMMARY PASS=47 FAIL=0 WAITING=1 SKIP=0
