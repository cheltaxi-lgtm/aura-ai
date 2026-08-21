---
name: audit-seo
description: Audit SEO landings, ask-spread, teasers, and discoverability. Use for /audit-seo or sitemap/SEO changes.
disable-model-invocation: true
---

# Audit SEO

1. Follow `.cursor/skills/zovus-harness/SKILL.md`.
2. Run `node scripts/ai-harness.mjs --scope seo --level full`.
3. Reviews: `harness-code-review`, `harness-visual-review`.
4. Reuse `verify:seo-ask-spread`, `verify:guest-teaser-quality`, SEO invariants. `/?ask&spread=1` without receipt is a new SEO spread; with receipt it is resume only.
5. Production only with `--level production` or after deploy.
