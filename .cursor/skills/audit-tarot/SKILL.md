---
name: audit-tarot
description: Audit tarot spreads, guest triplet, resume, and reading quality. Use for /audit-tarot or tarot/guest changes.
disable-model-invocation: true
---

# Audit Tarot

1. Follow `.cursor/skills/zovus-harness/SKILL.md`.
2. Run `node scripts/ai-harness.mjs --scope tarot --level full`.
3. Reviews: `harness-code-review`, `harness-visual-review`, `harness-security-review`.
4. Reuse `test:spreads`, guest resume verifies, prompt hygiene, dark-reading, guest-triplet mobile E2E. Honor P0 guest continuity — no post-auth redraw.
5. Production only with `--level production` or after deploy.
