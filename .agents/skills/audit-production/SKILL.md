---
name: audit-production
description: Execute requested production health, smoke, worker and deploy-safety checks. Use for /audit-production.
---

# Audit Production

1. Follow [zovus-harness](../zovus-harness/SKILL.md); for an authorized deploy, also follow [.cursor/rules/prod-deploy.mdc](../../../.cursor/rules/prod-deploy.mdc).
2. Run `node scripts/ai-harness.mjs --scope production --level production --audit` once, or reuse fresh equivalent evidence. Obtain the required production and security reviews.
3. Expect https://zovus.ru/api/health to return 200 and inspect product smoke results. After a real deploy, both aura-ai and aura-ai-async-jobs must be active.

An audit does not authorize a deploy. Never hand-roll rm -rf /opt/aura-ai; secrets stay outside git. Diagnose failed checks before rerunning; report an unchanged unavailable check as PARTIAL and continue independent checks.
