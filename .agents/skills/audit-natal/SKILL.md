---
name: audit-natal
description: Execute a requested full audit of natal charts, async jobs, guest continuity and reports. Use for /audit-natal.
---

# Audit Natal

For an explicitly requested execution audit:

1. Follow [zovus-harness](../zovus-harness/SKILL.md) for scope, evidence and completion.
2. Run `node scripts/ai-harness.mjs --scope natal --level full --audit` once, or reuse a fresh equivalent result. Use production level in the same run only for requested production checks or after an authorized deploy.
3. Obtain the independent reviews listed by the audit state. Diagnose findings, fix within the task's scope, and refresh affected checks/reviews when evidence changes. Report unchanged blockers without repeating the same failed run.

Reuse verify:natal-chart, verify:async-natal-jobs, verify:ai-delivery, natal invariants and Playwright natal public/guest through the harness.
