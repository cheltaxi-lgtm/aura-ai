---
name: audit-palm
description: Audit palm reading (gadanie-po-ladoni) snapshot, guest claim, SEO, and cabinet archive. Use for /audit-palm or palm-reading changes.
disable-model-invocation: true
---

# Audit Palm

1. Follow `.cursor/skills/zovus-harness/SKILL.md`.
2. Run `node scripts/ai-harness.mjs --scope palm --level full`.
3. Reviews: `harness-code-review`, `harness-visual-review`, `harness-security-review`.
4. Reuse `palm-unit` (`palm-*.test.ts`) and `seo-unit`.
5. Production only with `--level production` or after deploy. Do not set `PALM_MODULE_ENABLED` on prod unless the user asked.
