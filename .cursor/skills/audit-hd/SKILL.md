---
name: audit-hd
description: Audit Human Design engine, golden fixtures, connection chart, and reports. Use for /audit-hd or Human Design changes.
disable-model-invocation: true
---

# Audit Human Design

1. Follow `.cursor/skills/zovus-harness/SKILL.md`.
2. Run `node scripts/ai-harness.mjs --scope hd --level full`.
3. Reviews: `harness-calc-review`, `harness-code-review`, `harness-visual-review`, `harness-security-review`.
4. Reuse `verify:human-design`, `verify:hd-connection`, `hd-*.test.ts`. Do not regenerate goldens unless the task says so.
5. Production only with `--level production` or after deploy.
