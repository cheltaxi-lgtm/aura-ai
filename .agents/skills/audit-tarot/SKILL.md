---
name: audit-tarot
description: Execute a requested full audit of tarot spreads, guest triplets, resume and reading quality. Use for /audit-tarot.
---

# Audit Tarot

For an explicitly requested execution audit:

1. Follow [zovus-harness](../zovus-harness/SKILL.md) for scope, evidence and completion.
2. Run `node scripts/ai-harness.mjs --scope tarot --level full --audit` once, or reuse a fresh equivalent result. Use production level in the same run only for requested production checks or after an authorized deploy.
3. Obtain the independent reviews listed by the audit state. Diagnose findings, fix within the task's scope, and refresh affected checks/reviews when evidence changes. Report unchanged blockers without repeating the same failed run.

Reuse test:spreads, guest resume verifies, prompt hygiene, dark-reading and guest-triplet mobile E2E through the harness. Preserve P0 guest continuity: no post-auth redraw.
