---
name: zovus-harness
description: Orchestrates the Zovus AI development cycle discover → plan → implement → test → review → fix → retest → COMPLETED. Use for product work, audits, and whenever the user gives a short top-level task.
---

# Zovus harness

Do not load this file's siblings until the matching product is in scope.

## Cycle

1. **Discover** — git status/diff, grep callers before changing a function, reuse existing scripts in `package.json`.
2. **Plan** — smallest change that preserves P0 invariants. No new business logic unless required.
3. **Implement** — edit only task files. Deck sizes stay server-provided.
4. **Test** — `node scripts/ai-harness.mjs --scope auto --level fast`. Promote to `full` for behavior/UI/API changes, `production` only if prod/infra is touched or you will deploy.
5. **Review** — launch applicable `.cursor/agents/harness-*-review.md` subagents. They are independent.
6. **Fix + retest** — every FAIL/PARTIAL that is required. Re-run the same harness command. Re-record reviews.
7. **COMPLETED** — only if `.cursor/harness-state.json` verdict is `PASS` and production is `PASS` or `NOT_REQUIRED`. Otherwise `PARTIAL` with the exact reason.

## Scope map

| Paths | Scope |
|---|---|
| matrix / numerology | `matrix` |
| natal / astrology | `natal` |
| human-design / dizayn-cheloveka | `hd` |
| tarot / rasklad / guest | `tarot` |
| photo-rasklad | `photo` |
| gadanie-po-ladoni / palm | `palm` |
| seo / sitemap | `seo` |
| telegram-bot | `telegram` |
| hosting / deploy | `production` |
| 3+ products or unclear | `full` |

## Commands

`/audit-matrix` `/audit-natal` `/audit-hd` `/audit-tarot` `/audit-photo` `/audit-palm` `/audit-seo` `/audit-production` `/full-audit`

Details: [docs/AI_HARNESS.md](../../../docs/AI_HARNESS.md)
