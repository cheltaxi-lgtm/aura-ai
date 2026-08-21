---
name: audit-natal
description: Audit natal chart calculations, async jobs, guest continuity, and reports. Use for /audit-natal or natal/astrology changes.
disable-model-invocation: true
---

# Audit Natal

1. Follow `.cursor/skills/zovus-harness/SKILL.md`.
2. Run `node scripts/ai-harness.mjs --scope natal --level full`.
3. Reviews: `harness-calc-review`, `harness-code-review`, `harness-visual-review`, `harness-security-review`.
4. Reuse `verify:natal-chart`, `verify:async-natal-jobs`, `verify:ai-delivery`, natal invariants, Playwright natal public/guest.
5. Production only with `--level production` or after deploy.
