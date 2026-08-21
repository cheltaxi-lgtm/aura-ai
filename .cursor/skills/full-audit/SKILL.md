---
name: full-audit
description: Run the full local Zovus audit across products, then production if requested. Use for /full-audit or cross-product releases.
disable-model-invocation: true
---

# Full audit

1. Follow `.cursor/skills/zovus-harness/SKILL.md`.
2. Fast pulse: `node scripts/ai-harness.mjs --scope full --level fast`.
3. Full local: `node scripts/ai-harness.mjs --scope full --level full` (product suite, invariants, telegram, lint, build).
4. Production: add `--level production` only when releasing or when asked.
5. Reviews: all five `harness-*-review` agents that apply. Fix and retest until PASS or honest PARTIAL.
