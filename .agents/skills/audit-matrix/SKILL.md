---
name: audit-matrix
description: Execute a requested full audit of Destiny Matrix calculations, snapshots, guest continuity and UI. Use for /audit-matrix.
---

# Audit Matrix

For an explicitly requested execution audit:

1. Follow [zovus-harness](../zovus-harness/SKILL.md) for scope, evidence and completion.
2. Run `node scripts/ai-harness.mjs --scope matrix --level full --audit` once, or reuse a fresh equivalent result. Use production level in the same run only for requested production checks or after an authorized deploy.
3. Obtain the independent reviews listed by the audit state. Diagnose findings, fix within the task's scope, and refresh affected checks/reviews when evidence changes. Report unchanged blockers without repeating the same failed run.

Reuse verify:destiny-matrix, verify:destiny-matrix-invariants, verify:matrix-sectioned, verify:matrix-calc-drift, matrix invariants and Playwright matrix-e2e through the harness. Do not add a second calculator.
