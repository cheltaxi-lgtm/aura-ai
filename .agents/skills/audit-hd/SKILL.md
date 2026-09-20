---
name: audit-hd
description: Execute a requested full audit of Human Design engines, golden fixtures, connection charts and reports. Use for /audit-hd.
---

# Audit Human Design

For an explicitly requested execution audit:

1. Follow [zovus-harness](../zovus-harness/SKILL.md) for scope, evidence and completion.
2. Run `node scripts/ai-harness.mjs --scope hd --level full --audit` once, or reuse a fresh equivalent result. Use production level in the same run only for requested production checks or after an authorized deploy.
3. Obtain the independent reviews listed by the audit state. Diagnose findings, fix within the task's scope, and refresh affected checks/reviews when evidence changes. Report unchanged blockers without repeating the same failed run.

Reuse verify:human-design, verify:hd-connection and hd-*.test.ts through the harness. Do not regenerate goldens unless the task asks for it.
