---
name: audit-palm
description: Execute a requested full audit of palm-reading snapshots, guest claim, SEO and cabinet archive. Use for /audit-palm.
---

# Audit Palm

For an explicitly requested execution audit:

1. Follow [zovus-harness](../zovus-harness/SKILL.md) for scope, evidence and completion.
2. Run `node scripts/ai-harness.mjs --scope palm --level full --audit` once, or reuse a fresh equivalent result. Use production level in the same run only for requested production checks or after an authorized deploy.
3. Obtain the independent reviews listed by the audit state. Diagnose findings, fix within the task's scope, and refresh affected checks/reviews when evidence changes. Report unchanged blockers without repeating the same failed run.

Reuse palm-unit (palm-*.test.ts) and seo-unit through the harness. Do not enable PALM_MODULE_ENABLED in production unless the user asked.
