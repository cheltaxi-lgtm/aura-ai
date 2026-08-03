# Ads Autopilot — inventory (zovus.ru)

Snapshot date: 2026-07-28 (UTC+5)

## Яндекс Директ

| Field | Value |
| --- | --- |
| Login | `cheldriver` |
| Account type | Client (direct advertiser UI / Директ Про) |
| Currency | RUB (₽) |
| Balance | **0 ₽** |
| VAT / НДС | Not confirmed in UI without opening payment forms; assume RU standard when replenishing — **ДОПУЩЕНИЕ** |
| API access | **Программный доступ: открыт**; v5 production `campaigns.get` OK |
| API v5 Units (measured) | 15 / 99985 / 100000 |
| Account weekly budget | **7 000 ₽** (platform minimum; ≈ 1 000 ₽/day) |
| OAuth app | `Zovus Ads Autopilot` ClientID `de5ab94a1c56418cbad0a7b96eae7175` |
| Certification request | Submitted 28.07.2026 (полный доступ) |
| Campaign pause banner | «кампании на паузе уже 773 дня» |

### Campaigns

| ID | Name | Status | Notes |
| --- | --- | --- | --- |
| 35196656 | Мобильное приложение «Мой Копейск» | Черновик | Unrelated legacy (since 2018); weekly 300 ₽; Search+RSYa |
| 116716619 | Яндекс.Услуги | Черновик | Budget not set; Search; started 15.12.2024 |

No live Zovus campaigns. No moderation status for active Zovus creatives (none running).

## Яндекс Метрика

| Field | Value |
| --- | --- |
| Counter ID | `110138367` |
| Name | Zovus |
| Site | `zovus.ru` (status ok) |
| Goals (Management API) | 74 active (incl. newly created `guest_claim` = `589870003`) |
| Offline conversions uploadings API | HTTP 200 (list empty) — upload permission present |
| Stats API | HTTP 200 (visits last 7 days readable) |

### Ads Autopilot goal mapping (numeric Metrika IDs)

**North star:** registration + rune purchase. Free/guest spreads are funnel diagnostics only — not bid targets.

| Priority | Env | Goal | Metrika ID |
| --- | --- | --- | --- |
| primary | ADS_GOAL_REGISTRATION | registration_completed | 581800617 |
| primary | ADS_GOAL_FIRST_RUNE_SPEND | rune_purchase | 580953383 |
| primary | ADS_GOAL_FIRST_PAYMENT | rune_purchase | 580953383 |
| diagnostic | ADS_GOAL_GUEST_SPREAD_START | guest_spread_started | 581800511 |
| diagnostic | ADS_GOAL_CLAIM | guest_claim | 589870003 |

Note: first payment currently aliases `rune_purchase` (only paid conversion goal present). Separate first-payment goal can be added later if product emits a distinct event.

## Яндекс Вебмастер

| Field | Value |
| --- | --- |
| Domain | `https://zovus.ru` confirmed in dashboard |
| Verification | Meta `yandex-verification` = `7902ba7dfdb76ac3` (in app SEO metadata) |
| HOST_ID | To be filled after Webmaster OAuth token (`https:zovus.ru:443` host key used in UI URLs) |
| Search queries report | Available in UI (popular queries visible on dashboard) |

## OAuth apps already registered (oauth.yandex.ru)

- Zovus Login (Web, 13.07.2026) — connected
- Zovus Metrika API (12.07.2026) — connected
- **Zovus Ads Autopilot** — created; tokens in `.env.local`

## Wordstat

OAuth scope `wordstat:api` on Ads Autopilot app; product docs point to Yandex Cloud Search API for live Wordstat.
