# Organic SEO audit & changes — zovus.ru

Date: 2026-08-02 · Priority: **organic first** (Yandex)

## Verdict

Technical SEO base was already solid. Organic is capped by **~96 searchable pages / SQI 0**, thin URL mass, index leaks, weak off-home internal links, and consent-gated Metrika (`NO_METRIKA_COUNTER`). This pass closes leaks, activates bot canonicalization, expands hub linking, and trims sitemap noise.

## Implemented (code → deploy)

### P0 — index hygiene & crawl
- Wired `resolveBotHomeQueryRedirect` into `middleware.ts` for search bots on `/`
- `robots.txt`: Disallow `/session/`, `/joint-reading/`, `/tg`, `/diary/`
- noindex: `/session/intention`, `/joint-reading/[token]` layout
- Marketing footer on SEO pages (not only home) — hub equity sitewide
- Single home `h1` in editorial hero; SEO panel uses `h2` (no duplicate); removed client `sr-only` h1

### P1 — linking & hubs
- Expanded `EDITORIAL_NAV`, `SeoRelatedTools`, home SEO links (lenormand, faq, about, telegram, runy…)
- Breadcrumbs on `/gadanie`, `/rasklady`, `/photo-rasklad`, `/numerology`
- `/partners` added to sitemap; `/joint-reading` hub kept; token URLs blocked
- Removed **144** zodiac×month URLs from sitemap (pages remain, not pushed)

### Ops
- Recrawl + IndexNow after deploy (run `yandex-indexing-audit --recrawl` + `post-deploy-seo`)

## Done in follow-up pass

- SEO overrides: **37** commercial intents with unique intro/whenFits/body (was ~29 thin)
- SSR Metrika `noscript` watch pixel + bot client loader (Webmaster can see counter; humans consent-gated)
- Recrawl expanded (photo, lenormand lisa-i-medved, zhdat-ili-zabyt, kak-otpustit…)
- Social script: `scripts/publish-zovus-social.mjs` (needs owner login)

## Still owner (cannot automate without login/money)

1. **VK + Дзен**: `HEADED=1 node scripts/publish-zovus-social.mjs` after Sign in, or paste [`social-posts.md`](./social-posts.md)
2. **Webmaster UI**: подтвердить привязку Метрики `110138367` (diagnostic may clear after recrawl sees noscript)
3. **Директ**: баланс 0 ₽ — только если нужна реклама (не органика)
4. Monitor searchable_pages_count weekly (baseline 96)

## Success metrics (2–4 weeks)

| Metric | Baseline | Target |
|--------|----------|--------|
| searchable_pages_count | ~96 | ≥200 quality URLs |
| SQI | 0 | >0 |
| Top query clicks (photo/lenormand) | single digits | growing |
| Indexed private/token URLs | risk | 0 |

## Commands

```bash
node scripts/yandex-indexing-audit.mjs --recrawl
node scripts/post-deploy-seo.mjs https://zovus.ru
npx vitest run src/lib/seo/bot-query-redirect.test.ts src/lib/seo/indexability.test.ts
```
