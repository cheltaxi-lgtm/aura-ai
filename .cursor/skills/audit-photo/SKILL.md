---
name: audit-photo
description: Audit photo-reading aliases, recognition, and starter conversion. Use for /audit-photo or photo-rasklad changes.
disable-model-invocation: true
---

# Audit Photo

1. Follow `.cursor/skills/zovus-harness/SKILL.md`.
2. Run `node scripts/ai-harness.mjs --scope photo --level full`.
3. Reviews: `harness-code-review`, `harness-visual-review`, `harness-security-review`.
4. Reuse `test:photo-reading`, `verify:photo-aliases`, `photo-*.test.ts`.
5. Production only with `--level production` or after deploy.
