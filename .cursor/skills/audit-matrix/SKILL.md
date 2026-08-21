---
name: audit-matrix
description: Audit Destiny Matrix calculations, snapshots, guest continuity, and UI. Use for /audit-matrix or matrix/numerology changes.
disable-model-invocation: true
---

# Audit Matrix

1. Follow `.cursor/skills/zovus-harness/SKILL.md`.
2. Run `node scripts/ai-harness.mjs --scope matrix --level full`.
3. Reviews: `harness-calc-review`, `harness-code-review`, `harness-visual-review`, `harness-security-review`.
4. Reuse `verify:destiny-matrix`, `verify:destiny-matrix-invariants`, `verify:matrix-sectioned`, `verify:matrix-calc-drift`, matrix invariants, Playwright `matrix-e2e`. Do not add a second calculator.
5. Production only with `--level production` or after deploy.
