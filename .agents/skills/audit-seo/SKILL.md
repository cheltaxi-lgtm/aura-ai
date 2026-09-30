---
name: audit-seo
description: Execute a requested full audit of SEO landings, ask-spread, teasers and discoverability. Use for /audit-seo.
---

# Audit SEO

For an explicitly requested execution audit:

1. Follow [zovus-harness](../zovus-harness/SKILL.md) for scope, evidence and completion.
2. Run `node scripts/ai-harness.mjs --scope seo --level full --audit` once, or reuse a fresh equivalent result. Use production level in the same run only for requested production checks or after an authorized deploy.
3. Obtain the independent reviews listed by the audit state. Diagnose findings, fix within the task's scope, and refresh affected checks/reviews when evidence changes. Report unchanged blockers without repeating the same failed run.

Reuse verify:seo-ask-spread, verify:guest-teaser-quality and SEO invariants through the harness. /?ask&spread=1 without a receipt is a new SEO spread; with a receipt it is resume only.
