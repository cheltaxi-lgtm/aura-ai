# Ads Autopilot — build report

Updated: 2026-07-28

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

| Path | Role without secret |
| --- | --- |
| `/api/cron/ads-collect-conversions` | 401 |
| `/api/cron/ads-funnel-rollup` | 401 |
| `/api/cron/ads-sync-stats` | 401 |
| `/api/cron/ads-sync-entities` | 401 |
| `/api/cron/ads-semantics` | 401 |
| `/api/cron/ads-economics` | 401 |
| `/api/cron/ads-offline-conversions` | 401 |
| `/api/cron/ads-search-queries` | 401 |
| `/api/cron/ads-rules` | 401 |

All also 404 when `ads.enabled=false`.

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
