---
name: audit-photo
description: Execute a requested full audit of photo-reading aliases, recognition and starter conversion. Use for /audit-photo.
---

# Audit Photo

For an explicitly requested execution audit:

1. Follow [zovus-harness](../zovus-harness/SKILL.md) for scope, evidence and completion.
2. Run `node scripts/ai-harness.mjs --scope photo --level full --audit` once, or reuse a fresh equivalent result. Use production level in the same run only for requested production checks or after an authorized deploy.
3. Obtain the independent reviews listed by the audit state. Diagnose findings, fix within the task's scope, and refresh affected checks/reviews when evidence changes. Report unchanged blockers without repeating the same failed run.

Reuse test:photo-reading, verify:photo-aliases and photo-*.test.ts through the harness.
