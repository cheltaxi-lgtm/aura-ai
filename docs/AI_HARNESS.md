# Zovus AI Harness

Select existing checks and independent reviews for product implementation or an explicitly requested execution audit. Read-only analysis and documentation-only work do not need a machine PASS merely to finish.

## Maintained entrypoints

| Piece | Path | Role |
|---|---|---|
| Canonical orchestrator | .agents/skills/zovus-harness/SKILL.md | Scope, evidence and completion |
| Canonical audit skills | .agents/skills/audit-*/SKILL.md and full-audit/SKILL.md | Explicit audit execution |
| Invocation policy | .agents/skills/audit-*/agents/openai.yaml and full-audit/agents/openai.yaml | Preserve explicit audit invocation |
| Cursor compatibility | .cursor/skills/*/SKILL.md and .cursor/commands/audit-*.md | Thin links to canonical skills |
| Reviewers | .codex/agents/harness-*-review.toml; .cursor/agents/harness-*-review.md | Runtime-specific reviewer definitions |
| Runner and catalog | scripts/ai-harness.mjs; scripts/ai-harness-catalog.mjs | Reuse existing npm scripts and Playwright projects |
| Gate | scripts/ai-harness-gate.mjs | Fresh evidence for implementation/audit completion |
| Hooks | .codex/hooks.json; .cursor/hooks.json | Runtime-specific hints and gates |

Existing P0 invariants, guards, verification scripts and safe deploy scripts remain authoritative. Cursor rules apply when loaded by that runtime or explicitly referenced; their alwaysApply flag does not by itself load them in Codex.

## Select a run

Normal implementation uses an appropriate scope and level, for example `node scripts/ai-harness.mjs --scope auto --level fast`. Full adds broader lint/unit/E2E or build coverage according to the scope; it is not mandatory for every UI/API edit. Production level includes the selected full checks and live health/smoke, and applies only to requested production checks or an authorized deploy. Run the chosen level once; a full run already includes fast checks.

Repeat `--file <repo-relative-path>` for the task's files when unrelated changes share the workspace. These arguments limit check/review planning; the evidence fingerprint still covers the complete workspace. Without them, auto mode uses the changed files. Documentation-only/no-change auto runs require no product checks. Unknown runtime paths yield a scope-required PARTIAL: inspect them and select an appropriate explicit scope. Multiple affected products remain scoped; do not choose full merely because three products changed.

Explicit execution audits add `--audit` and select a scope. For example, `node scripts/ai-harness.mjs --scope matrix --level full --audit` runs a full Matrix audit. `--scope full --level full --audit` runs all local products; `--scope production --level production --audit` performs a requested production audit. Use production level in the chosen run when needed, without a mandatory preceding fast/full run. Audit execution does not authorize a deploy.

Commands: /audit-matrix, /audit-natal, /audit-hd, /audit-tarot, /audit-photo, /audit-palm, /audit-seo, /audit-production, /full-audit. These aliases route directly to the canonical skill; source-command-* skill copies are not maintained.

## Reviews and fresh evidence

Normal implementation selects reviews from the task's changed files: code, calc for engines/goldens, visual for UI/CSS, security for auth/billing/receipts/API/storage/bot, and production when required. Explicit --audit runs require the selected scope's full product reviewer set; production reviews are required only when production checks are required.

For covered implementation and audit execution, COMPLETED requires fresh passing checks, production PASS or NOT_REQUIRED, and the required independent reviews. Evidence is bound to the workspace fingerprint, including HEAD and changed/untracked file contents; generated harness state and designated temporary artifacts are excluded. Any non-excluded workspace change invalidates fingerprint evidence. Any recorded FAIL/PARTIAL review blocks implementation/audit completion, including after the retry limit; it must not be erased or relabeled to bypass the gate.

Record each independent result with `node scripts/ai-harness.mjs --record-review code --result PASS` (or security, visual, calc, production; results PASS, FAIL, PARTIAL). PASS is refused when the diff changed or checks have not passed. Recording a review does not refresh the test timestamp. Reuse current passing evidence when scope, level, required checks/reviews and fingerprint still match. Missing or stale evidence needs the corresponding verification; do not rerun unrelated passing work merely to produce another status.

## Maintaining and diagnosing the harness

To add an actual product/check, update the existing catalog, canonical skill and needed compatibility command, then run npm run harness:selftest. Avoid adding a second test stack or duplicate skill bodies. Preserve the audit skills' existing explicit invocation policy.

When a gate is blocked, inspect its exact reason and saved state. Diagnose FAIL/PARTIAL before repeating a command. Rerun after a relevant fix, environment change or new evidence; if the same required dependency remains unavailable, report PARTIAL and continue independent work. Do not delete state to bypass the gate. Hooks failing to load require inspecting the configuration of the runtime actually in use, not assuming Cursor settings control Codex.

The legacy Cursor stop hook receives working-tree paths and shared saved state, but no reliable current-task intent. It conservatively retains audit failure and freshness enforcement, so old state or unrelated dirty code can still affect that legacy hook. Codex currently registers only the scoped SessionStart hint; the legacy stop hook is not registered in .codex/hooks.json. The CLI validates explicit audit results even on a clean checkout.
