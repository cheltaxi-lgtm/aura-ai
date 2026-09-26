---
name: full-audit
description: Execute a requested full local Zovus audit across products, with production checks only when requested or releasing. Use for /full-audit.
---

# Full audit

1. Follow [zovus-harness](../zovus-harness/SKILL.md).
2. Run `node scripts/ai-harness.mjs --scope full --level full --audit` once, or reuse a fresh equivalent result. Full already includes fast checks. Use fast alone for a requested quick diagnostic.
3. Select production level in that run only for requested production checks or after an authorized deploy.
4. Obtain the independent reviews required by the audit state. Diagnose failures and refresh affected evidence after fixes; report unchanged blockers without repeating the same failed command.
