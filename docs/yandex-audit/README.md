# Yandex surface audit (zovus.ru + Telegram bot)

## Snapshot (API + prod, 2026-08-02)

| Surface | Status |
|---------|--------|
| Webmaster host `https:zovus.ru:443` | OK, sitemap с 2026-07-10 |
| Pages in search | **96** (было ~33) |
| SQI | **0** |
| Recrawl | 15 хабов + `/telegram` → HTTP 202 |
| IndexNow | 191 URL submitted |
| Metrika `110138367` | goals **87/87**; `code_status=CS_ERR_UNKNOWN` (UI) |
| Direct `cheldriver` | баланс **0 ₽**, day budget 1000; кампании archived/draft, sandbox env |
| Bot SEO live | https://zovus.ru/telegram (200), footer, Organization `sameAs`, sitemap |

## Deployed this session

- `/telegram` — индексируемая страница бота `@zovus_card_bot`
- Footer / about / schema `sameAs` → VK, Дзен, `/telegram`, `t.me/zovus_card_bot`
- Scripts: `scripts/yandex-indexing-audit.mjs`, обновлён `post-deploy-seo.mjs`
- Metrika: созданы 19 недостающих memory/ritual целей

## Commands

```bash
node scripts/yandex-indexing-audit.mjs
node scripts/yandex-indexing-audit.mjs --recrawl
node scripts/post-deploy-seo.mjs https://zovus.ru
node scripts/sync-metrika-goals.mjs
```

## Organic SEO pass (same day)

See [`organic-seo-audit.md`](./organic-seo-audit.md): bot redirects, robots leaks closed, marketing footer on hubs, breadcrumbs, sitemap trim (−144 zodiac×month), IndexNow 192 URLs.

## Owner actions still required

1. **VK / Дзен** — опубликовать тексты из [`social-posts.md`](./social-posts.md) (нужен логин владельца; в браузере без Sign in постить нельзя).
2. **Директ** — пополнить счёт (сейчас 0 ₽), если нужна реклама; на органику не влияет.
3. **Метрика ↔ Вебмастер** — диагностика `NO_METRIKA_COUNTER` PRESENT: счётчик грузится только после cookie-consent (не в SSR). В кабинете Вебмастера привяжите счётчик `110138367` вручную; `CS_ERR_UNKNOWN` из-за того же. Privacy: полный tag.js без согласия не включаем.
4. **Вебмастер** — доп. `NOT_MOBILE_FRIENDLY` в состоянии UNDEFINED (не блокер).
