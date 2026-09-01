# Zovus AI Harness

Agent cycle: `discover → plan → implement → test → review → fix → retest`. Machine gate decides COMPLETED.

## Architecture

| Piece | Path | Role |
|---|---|---|
| Rule | `.cursor/rules/zovus-ai-harness.mdc` | Always-on cycle + COMPLETED |
| Orchestrator | `.cursor/skills/zovus-harness/SKILL.md` | When to run which scope |
| Product skills | `.cursor/skills/audit-*/SKILL.md` | Slash procedures |
| Commands | `.cursor/commands/audit-*.md` | `/audit-*` `/full-audit` |
| Reviewers | `.cursor/agents/harness-*-review.md` | Independent reviews |
| Runner | `scripts/ai-harness.mjs` | Wraps existing npm/scripts |
| Catalog | `scripts/ai-harness-catalog.mjs` | Product → checks |
| Gate | `scripts/ai-harness-gate.mjs` | PASS-only COMPLETED |
| Hooks | `.cursor/hooks.json` | session hint, cheap post-edit, stop gate |

Existing preflight, guards, invariants, Playwright, and `scripts/deploy-prod.sh` stay canonical. This harness does not replace them.

## Commands

| Command | Scope |
|---|---|
| `/audit-matrix` | Destiny Matrix |
| `/audit-natal` | Natal |
| `/audit-hd` | Human Design |
| `/audit-tarot` | Tarot / guest triplet |
| `/audit-photo` | Photo reading |
| `/audit-palm` | Palm reading |
| `/audit-seo` | SEO landings |
| `/audit-production` | Live health + smoke |
| `/full-audit` | All local products |

Equivalent CLI: `node scripts/ai-harness.mjs --scope <id> --level <fast\|full\|production>`.

## Gates

| Level | Runs | When |
|---|---|---|
| **fast** | typecheck/guards + product verify scripts | Default after small edits |
| **full** | fast + lint + scoped unit/E2E + extra verifies | Behavior, UI, API, calc |
| **production** | full + `https://zovus.ru/api/health` + product URLs | Deploy, infra, `/audit-production` |

`COMPLETED` only if `.cursor/harness-state.json` is fresh `PASS` and production is `PASS` or `NOT_REQUIRED`. FAIL, missing run, PARTIAL, or guesswork cannot be COMPLETED.

## Add a product or check

1. Add the check to `CHECKS` in `scripts/ai-harness-catalog.mjs` pointing at an **existing** npm script or Playwright project.
2. Add the scope (paths, `fast`/`full`/`production` ids, `smokeUrls`, `reviews`).
3. Add `.cursor/skills/audit-<id>/SKILL.md` + `.cursor/commands/audit-<id>.md`.
4. Run `npm run harness:selftest`.

## Troubleshooting

- **Hooks silent** — Cursor reloads `.cursor/hooks.json` on save; restart if needed. Scripts are Node (Windows-safe). Hooks fail-open.
- **COMPLETED blocked** — read `.cursor/harness-state.json`. Re-run the same `--scope/--level`. Do not delete the state to bypass the gate.
- **PARTIAL** — exact `reason` on the check (no Playwright browsers, unreachable zovus.ru, no `TEST_DATABASE_URL`). Fix the environment or keep PARTIAL.
- **Post-edit feels heavy** — it no longer runs typecheck. Only `guards` on `src/` / `telegram-bot/src/` TS/JS.
- **Self-check** — `npm run harness:selftest`.
