---
name: zovus-harness
description: Select scoped checks and reviews for Zovus product implementation or explicitly requested audit execution. Excludes explanations, read-only instruction reviews, and documentation-only work.
---

# Zovus harness

Apply this workflow to product implementation and requested execution audits. Read-only analysis and documentation-only tasks do not need a machine PASS merely to finish. Load product audit skills only for a requested product audit.

## Checks and scope

- Inspect the task's changed files and relevant callers before changing behavior or contracts. Preserve the P0 product invariants and use existing scripts in package.json.
- Select the smallest checks that cover the changed behavior. Use `node scripts/ai-harness.mjs --scope auto --level fast` for a fast scoped check, or choose full when broader integration, unit/E2E or build coverage is needed. UI/API changes alone do not require every product check.
- Add repeatable `--file <repo-relative-path>` arguments when the working tree contains unrelated work. They select the task's checks and reviews; evidence still uses the complete workspace fingerprint.
- Unknown runtime paths require choosing the appropriate explicit scope after inspecting those files. Do not choose full solely because scope is unclear or three products changed. Auto documentation/no-change runs require no product checks.
- Use `--audit` for an explicitly requested execution audit. It requires that scope's full product review set. Use `--scope full --level full --audit` for a requested full local audit; full includes fast, so run the selected level once.
- Use production level only for requested production checks or an authorized deploy. Product changes and completed local work do not authorize a release.

## Review and completion

Implementation reviews follow the selected files: code for code changes, calc for engines/goldens, visual for UI/CSS, security for auth/billing/receipts/API/storage/bot, production when production checks are required. The harness records the required set; explicit audits use the selected product set. Use the matching project reviewer agents and fresh test evidence.

Reuse passing checks and independent reviews while their scope, level, required set and workspace fingerprint remain current. After a relevant code/environment change or a new finding, rerun the affected verification required by the gate and refresh stale evidence. Diagnose FAIL/PARTIAL; do not repeat an unchanged failed command while the same blocker remains. Continue independent work and report an unavailable required check as PARTIAL with its exact cause.

For implementation and requested audit execution, COMPLETED requires fresh machine PASS, production PASS or NOT_REQUIRED, and the required independent reviews. Record reviews using `node scripts/ai-harness.mjs --record-review <id> --result PASS|FAIL|PARTIAL`. Do not discard failures or stale evidence to bypass the gate.

Scopes: matrix, natal, hd, tarot, photo, palm, seo, telegram, production; consult the harness catalog for other existing scopes. Use full only for work that actually needs all products or an explicit full audit.

Details, review evidence and troubleshooting: [docs/AI_HARNESS.md](../../../docs/AI_HARNESS.md).
