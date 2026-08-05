# Preflight — Zovus regression gates

Run before every deploy:

```bash
npm run preflight
```

This runs: `typecheck` → `guards` → `test:invariants` → `preflight:report` → `build`.

On Windows, if `next build` crashes mid static generation, raise the heap:

```bash
set NODE_OPTIONS=--max-old-space-size=8192
npm run preflight
```

## Local test database

Invariant DB tests need a **dedicated** Postgres URL in `.env.test` (never prod):

```bash
cp .env.test.example .env.test
docker compose up -d postgres
docker exec auraai-postgres psql -U auraai -d postgres -c "CREATE DATABASE auraai_test;"
DATABASE_URL="$TEST_DATABASE_URL" npm run migrate
```

`TEST_DATABASE_URL` must:

- not contain `prod`, `beget`, or `zovus.ru`
- not equal `DATABASE_URL`

Then:

```bash
npm run test:invariants:db
```

Without `TEST_DATABASE_URL`, DB suites use `describe.skipIf(!hasTestDb)` and preflight prints:

`⚠ ИНВАРИАНТЫ НЕ ПРОВЕРЕНЫ: N` + skipped test names.

With a live test DB and zero skips: `✓ Все инварианты проверены`.

## Gates

| Gate | Command | What it checks |
|------|---------|----------------|
| Typecheck | `npm run typecheck` | `tsc --noEmit` |
| Guards | `npm run guards` | Static rules G1–G8 over `src/` + `telegram-bot/src/` |
| Invariants | `npm run test:invariants` | Vitest P0 contracts (DB suites when `TEST_DATABASE_URL` set) |
| Skip report | `npm run preflight:report` | Lists skipped invariants (informational) |
| Build | `npm run build` | Next.js production build |

## Guards (G1–G8)

| ID | Level | Rule |
|----|-------|------|
| G1 | error | Client storage keys suggesting entitlement (`isFree`, `billingExempt`, `guestResume`, …) |
| G2 | error | Auth/receipt tokens in client storage |
| G3 | error | Hardcoded deck/pick sizes (`deckSize=78`, `.slice(0,78)`, `Array(36)`, …) |
| G4 | error | `getTimezoneOffset` / numeric UTC offsets in business logic |
| G5 | warning | CSS transitions on non-`transform`/`opacity` properties |
| G6 | error | `process.env.*` without `NEXT_PUBLIC_` inside `'use client'` |
| G7 | error | Import of server billing/auth modules from `'use client'` files |
| G8 | error | DB pool / `@/lib/db` / `pg` usage in `'use client'` or `src/components/` |

### On failure

1. Read `path:line` + rule message.
2. Prefer fixing the call site.
3. Do **not** weaken P0 invariants to silence a guard.

### Adding an exclusion

1. Edit `scripts/guards.mjs` → the guard’s `exclude` array.
2. Add a one-line comment explaining why.
3. Re-run `npm run guards`.

Inline skip: `// guards-ignore` on that line.

## What «ИНВАРИАНТЫ НЕ ПРОВЕРЕНЫ» means

Vitest wrote a JSON report with skipped tests. Usually:

- no `TEST_DATABASE_URL` / `.env.test` locally, or
- `describe.skipIf(!hasTestDb)` suites were skipped.

This block does **not** fail preflight by itself. In GitHub Actions, skipped DB invariants **do** fail the workflow.

## Husky

`pre-push` runs `guards` + `typecheck` + `test:invariants` (no build).

## CI

`.github/workflows/preflight.yml` starts Postgres, runs `npm run migrate` + `npm run schema:diff`, sets `TEST_DATABASE_URL`, and fails if any invariant is skipped.

Locally, `schema:diff` runs inside `preflight` only when `TEST_DATABASE_URL` (or `DATABASE_URL`) is set (`--if-test-db`).
