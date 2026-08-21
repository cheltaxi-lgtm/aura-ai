---
name: audit-production
description: Audit production health, smoke URLs, worker, and deploy safety. Use for /audit-production or hosting/deploy changes.
disable-model-invocation: true
---

# Audit Production

1. Follow `.cursor/skills/zovus-harness/SKILL.md` and `.cursor/rules/prod-deploy.mdc`.
2. Run `node scripts/ai-harness.mjs --scope production --level production`.
3. Review: `harness-production-review`, `harness-security-review`.
4. Reuse public `https://zovus.ru/api/health` (expect 200) and product smoke URLs. After a real deploy, both `aura-ai` and `aura-ai-async-jobs` must be active.
5. Never hand-roll `rm -rf /opt/aura-ai`. Secrets stay outside git.
