# Natal Playwright E2E

Run the public authentication-boundary suite locally:

```bash
npm run test:e2e:natal
```

Playwright starts an isolated Next.js development server on `127.0.0.1:3417` and
uses `.next-e2e`, so it does not reuse or modify a developer server on port 3000.
Install Chromium once if it is not already available:

```bash
npx playwright install chromium
```

## Authenticated workspace suite

The authenticated project is included only when both variables below are set:

- `NATAL_E2E_BASE_URL`: URL of a test deployment or an already-running local
  fixture server.
- `NATAL_E2E_STORAGE_STATE`: path to a Playwright storage-state JSON file for a
  non-production user session.

PowerShell example:

```powershell
$env:NATAL_E2E_BASE_URL = "http://127.0.0.1:3000"
$env:NATAL_E2E_STORAGE_STATE = "playwright/.auth/natal-user.json"
npm run test:e2e:natal
```

Create the storage state outside this repository or under a gitignored local
directory. Do not commit cookies, tokens, passwords, or the state file. The
fixture account only needs a valid user session; deterministic route mocks
provide natal data and exercise tabs, unknown-time handling, recompute,
tradition reports, timing, independent consent settings, and share
create/revoke behavior.

Paid interpretation requests are blocked by the authenticated test fixture.
The suite never invokes a live LLM or spends runes.
