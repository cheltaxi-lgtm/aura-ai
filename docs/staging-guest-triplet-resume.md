# Staging rollout — Guest Triplet Resume (P0)

Operational runbook for applying `076_migrate_guest_triplet_receipt.sql` and
verifying guest triplet resume on an isolated staging environment.

**Production migrate/deploy is forbidden by this document.**

Related code:
- Migration: `scripts/migrations/076_migrate_guest_triplet_receipt.sql`
- Runner: `npm run migrate` / `npm run migrate:status` → `scripts/migrate.mjs`
- Cron route: `GET /api/cron/guest-resume-expire`
- Cron installer (VPS): `proxmox-setup/install-crons.sh`
- Optional local DB target: `docker-compose.local-staging.yml`

---

## Local-staging host prerequisites

`docker-compose.local-staging.yml` requires a working **Docker Engine** (Docker Desktop on Windows, or Docker/Podman on Linux/macOS) with Compose v2.

On a host without Docker / WSL / local Postgres:

- local-staging migrate + API/DB smoke **cannot** run;
- static verifies (`verify:guest-triplet-resume`, guardrails, build) can still run;
- use a remote isolated staging DB instead (see Required owner-provided values).

Do **not** fall back to production Beget DB or default `.env.local` unless that file is proven to point at isolated local-staging (`127.0.0.1:5433` / `zovus_local_staging`).

---

## Required owner-provided values

Set these **only** in the staging deployment environment / secret store.
Never commit values to git.

```text
STAGING_APP_URL=
STAGING_DATABASE_URL=
CRON_SECRET=
YANDEX_STAGING_CALLBACK_URL=
VK_STAGING_CALLBACK_URL=
PAYMENT_MODE=
```

### Meaning

| Name | Purpose |
|------|---------|
| `STAGING_APP_URL` | Public origin of the staging app (e.g. preview host). Used for OAuth callbacks and smoke. |
| `STAGING_DATABASE_URL` | Postgres URL for **staging only**. Must be distinct from production. Maps to app env `DATABASE_URL` on the staging host. |
| `CRON_SECRET` | Shared secret for `x-cron-secret` header on cron routes. |
| `YANDEX_STAGING_CALLBACK_URL` | Extra redirect URI registered in Yandex OAuth app for staging origin. |
| `VK_STAGING_CALLBACK_URL` | Extra redirect URI registered in VK ID app for staging origin. |
| `PAYMENT_MODE` | Staging payment policy label. Recommended: `disabled` (omit `YUKASSA_*` so purchases are unavailable / no live charges). |

Derived callback shapes (fill with your `STAGING_APP_URL`):

```text
{STAGING_APP_URL}/api/auth/oauth/yandex/callback
{STAGING_APP_URL}/api/auth/oauth/vk/callback
```

App env on the staging host (names as used by the code):

```text
DATABASE_URL=<STAGING_DATABASE_URL>
NEXT_PUBLIC_APP_URL=<STAGING_APP_URL>
CRON_SECRET=<CRON_SECRET>
# Leave YUKASSA_SHOP_ID / YUKASSA_SECRET_KEY unset when PAYMENT_MODE=disabled
```

---

## Exact rollout sequence

1. **Create / confirm isolated staging DB**
   Separate Postgres instance or database from production. Prove host/name differ from prod.

2. **Set staging secrets** in the real staging deployment environment only
   (`DATABASE_URL`, `NEXT_PUBLIC_APP_URL`, `AUTH_SECRET`, `CRON_SECRET`, OAuth client ids/secrets if testing OAuth, LLM keys as needed). Do not copy production `DATABASE_URL`.

3. **Deploy code to staging**
   Use a non-production path (Vercel preview workflow, or a dedicated staging host).
   Do **not** run `hosting/deploy-beget.ps1` / production Beget deploy for this step.

4. **Confirm deployed app points only to staging DB**
   - App `NEXT_PUBLIC_APP_URL` / public origin = staging host (not `zovus.ru`).
   - `GET {STAGING_APP_URL}/api/health` returns `{ ok: true }` (or document degraded LLM separately).
   - Abort if hostname looks like production (`zovus.ru`) or DB target cannot be proven distinct.

5. **Migration status (read-only)**
   On the staging host (or CI job with staging secrets only):

   ```bash
   npm run migrate:status
   ```

   Abort if status cannot be read.

6. **Apply pending migrations** (includes `076` when pending):

   ```bash
   npm run migrate
   ```

7. **Re-check status + schema**

   ```bash
   npm run migrate:status
   ```

   Confirm `076_migrate_guest_triplet_receipt.sql` is marked applied.
   Optional safe checks (identifiers only — no user rows / tokens):

   ```sql
   -- columns exist
   SELECT column_name FROM information_schema.columns
   WHERE table_name = 'sessions' AND column_name LIKE 'guest_resume%';

   -- constraint / indexes exist (names only)
   SELECT conname FROM pg_constraint WHERE conname LIKE 'sessions_guest_resume%';
   SELECT indexname FROM pg_indexes WHERE indexname LIKE 'idx_sessions_guest_resume%';
   ```

8. **Configure protected cron**
   - On VPS-style hosts using `proxmox-setup/install-crons.sh`: re-run the installer after deploy so `guest-resume-expire` is scheduled.
   - On hosts without that installer (e.g. Vercel preview): use the **Manual cron setup** section below.
   - Never put `CRON_SECRET` in the URL, git, or logs.

9. **Automated verify** (from a checkout of the same commit):

   ```bash
   npm run verify:guest-triplet-resume
   npm run test
   npm run verify:guardrails
   npm run build
   npx tsc --noEmit
   ```

10. **Manual smoke A–L** (see checklist below).

11. **Produce GO / NO-GO** for production (separate owner approval required for prod migrate/deploy).

---

## Hard safety gates (abort)

- Abort if hostname / DB target looks like production (`zovus.ru`, known prod VPS DB, shared prod `DATABASE_URL`).
- Abort if staging DB cannot be proven distinct from production.
- Abort if `npm run migrate:status` cannot be read against the staging DB.
- Abort if OAuth smoke is required but staging callback URLs are not registered (Yandex/VK dashboards).
- Abort if `GET /api/cron/guest-resume-expire` succeeds **without** `x-cron-secret` / admin (must be 403).

---

## Cron setup

### Route

`GET /api/cron/guest-resume-expire`

Auth (unchanged):

- Header `x-cron-secret: <CRON_SECRET>`, or
- Authenticated admin session (`requireAdmin`)

Cleanup SQL touches only:

- `guest_resume_status = 'issued'`
- `guest_resume_expires_at <= NOW()`
- `user_id IS NULL`

Never expires `claimed` / `reading_consumed` or history rows.

### VPS / Proxmox pattern (in-repo)

Scripts:

- `proxmox-setup/cron-guest-resume-expire.sh` — curls `http://127.0.0.1:3000` with header from `.env.local`
- `proxmox-setup/install-crons.sh` — installs daily schedule (after joint-reading sweep)

On the staging VPS (after code deploy):

```bash
bash proxmox-setup/install-crons.sh
```

### Manual cron check (no secret in URL)

```bash
# From the app host; secret comes from env / .env.local — do not echo it
curl -sS -o /tmp/guest-resume-expire.body -w "%{http_code}" \
  -H "x-cron-secret: ${CRON_SECRET}" \
  "http://127.0.0.1:3000/api/cron/guest-resume-expire"
# Expect HTTP 200 and JSON like {"expired":N}
# Unauthenticated check:
curl -sS -o /dev/null -w "%{http_code}" \
  "http://127.0.0.1:3000/api/cron/guest-resume-expire"
# Expect HTTP 403
```

### Manual setup when scheduler is outside the repo

If staging runs on a platform without `install-crons.sh` (e.g. Vercel preview):

1. Create a scheduled job in that platform’s scheduler / GitHub Action / external cron.
2. Call `{STAGING_APP_URL}/api/cron/guest-resume-expire` once daily.
3. Send header `x-cron-secret` from the platform secret store.
4. Do not put the secret in query strings or committed workflow files as plaintext.

---

## OAuth checklist (staging only)

Do **not** remove or change production callbacks:

```text
https://zovus.ru/api/auth/oauth/yandex/callback
https://zovus.ru/api/auth/oauth/vk/callback
```

**Add** staging redirects (same OAuth apps or dedicated staging apps):

```text
{STAGING_APP_URL}/api/auth/oauth/yandex/callback
{STAGING_APP_URL}/api/auth/oauth/vk/callback
```

Code builds redirect URI as `{origin}/api/auth/oauth/{provider}/callback` via
`NEXT_PUBLIC_APP_URL` / request host (`src/lib/oauth/config.ts`).

If callbacks are missing, Yandex/VK smoke (scenarios B/C) must be marked FAIL / blocked.

---

## Payments on staging

Existing project behaviour:

- Without `YUKASSA_SHOP_ID` / `YUKASSA_SECRET_KEY`, rune purchases are unavailable (503 / not configured).
- Demo unlock exists only when YooKassa is not configured (`/api/payments/demo-unlock`).

For guest-resume smoke (free resumed reading), real YooKassa is **not** required.
Set `PAYMENT_MODE=disabled` and leave `YUKASSA_*` unset on staging unless you intentionally use a YooKassa **test** shop (owner-managed; not invented here).

---

## Optional local-staging Docker target

Separate from default `docker compose` (`auraai` / port `5432`).

```bash
# Start
docker compose -f docker-compose.local-staging.yml up -d

# Point tools at local-staging (example — replace password from compose/env)
# DATABASE_URL=postgresql://zovus_stg:LOCAL_STAGING_PASSWORD@127.0.0.1:5433/zovus_local_staging

npm run migrate:status
npm run migrate

npm run verify:guest-triplet-resume
npm run verify:guardrails

# Teardown (destroys local-staging volume)
docker compose -f docker-compose.local-staging.yml down -v
```

Set `LOCAL_STAGING_PGPASSWORD` in your shell or a gitignored env file before `up`
if you override the compose default placeholder password.

**local-staging is not remote staging.** It does not replace OAuth/YooKassa/provider smoke on a public `STAGING_APP_URL`.

---

## Manual smoke A–L (staging UI)

For each scenario record: UI expectation, API/network, server/session/history signal (no PII), PASS/FAIL.

| ID | Scenario | Pass criteria (short) |
|----|----------|------------------------|
| A | Email, question ≥ 20 | Same 3 cards/order/orientation/question; one session; one free reading; no READING charge |
| B | Yandex OAuth web | Cookies survive redirect; claim OK |
| C | VK OAuth web | Same as B |
| D | Empty / short question | Resume same cards; no redraw |
| E | Refresh on stages | No duplicate session/reading/charge |
| F | Two tabs | One claimed session; one `guest_resume_reading_id` |
| G | Claim/reading fail + retry | RU retry UI; no new spread; no second charge |
| H | Clear LS after claim | Server session/history; no redraw/pay |
| I | Delete one cookie before claim | Neutral recovery; no entitlement; no leak |
| J | Capacitor cookie loss | Recovery copy; no entitlement; no token in JS storage |
| K | `/?ask=…&spread=1&master=veronika` without receipt | SEO new spread unchanged |
| L | Cabinet | One resumed session; not «Карты дня»; no orphan anonymous |

---

## Production safety reminders

- Do not run `hosting/deploy-beget.ps1` or production `npm run migrate` as part of this staging rollout.
- Do not point staging `DATABASE_URL` at production.
- Do not commit `.env.local`, connection strings, or `CRON_SECRET`.
- Production GO requires a **separate** owner-approved prompt after staging GO.
