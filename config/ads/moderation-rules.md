# Ads Autopilot — moderation rules (own wording)

Sources are linked per point. This is an operational digest for Zovus, not a copy of Yandex help text.

## 1) What is directly forbidden

- Promoting magic services that promise **harm** to people (damage, curse-style offers).  
  Source: [Restricted categories](https://yandex.ru/support/direct/ru/moderation/restricted-categories)
- For **Belarus** geo: fortune-telling / divination services must not be promoted at all.  
  Sources: [Magic category](https://yandex.ru/support/direct/ru/moderation/categories/magic), [Restricted categories](https://yandex.ru/support/direct/ru/moderation/restricted-categories)
- Guarantees of safety or effectiveness of fortune-telling / divination services in ad copy.  
  Source: [Magic category](https://yandex.ru/support/direct/ru/moderation/categories/magic)
- Unfair methods: bait-and-switch landings after moderation, sensational/shock hooks, fake documents.  
  Source: [Restricted categories — unfair methods](https://yandex.ru/support/direct/ru/moderation/restricted-categories)
- Ads that look like medical diagnosis online, “healing” claims on non-medical products, or other prohibited verticals listed in restricted categories (not our niche, but hard stop if copy drifts there).  
  Source: [Restricted categories](https://yandex.ru/support/direct/ru/moderation/restricted-categories)

## 2) What needs documents / labels / age marks

- Fortune-telling / divination in **Russia**: special documents are **not** required for placement, but ads must still follow general Direct ad rules and local law.  
  Source: [Magic category](https://yandex.ru/support/direct/ru/moderation/categories/magic)
- Internet ads in Russia require **advertising labeling** (mark «Реклама» + creative token / erid chain via ORD → ERIR). In Direct, advertiser must keep legal entity data filled; platform handles much of the tech flow.  
  Source: [Ad labeling in Direct](https://yandex.ru/support/direct/ru/technologies-and-services/ad-labelingl)
- 18+ / adult framing: avoid sex-dating style formulations (prohibited intimacy-dating phrasing). For esoteric content keep tone informational / service-without-harm; do not push adult shock creatives.  
  Sources: [Restricted categories](https://yandex.ru/support/direct/ru/moderation/restricted-categories), [Direct ad material requirements](https://yandex.ru/legal/direct_adv_rules/)
- Landing must match the ad object, work stably, and not use deceptive UI in images.  
  Source: [Direct ad material requirements](https://yandex.ru/legal/direct_adv_rules/)

## 3) Informational content vs fortune-telling service (key distinction)

- **Informational content** (card meanings, articles, forecasts-as-editorial, numerology explainers): promote as knowledge / reading material on content hubs; avoid promising a paid personal ritual outcome in the ad itself. Prefer whitelist hubs (`/statyi/*`, `/taro`, `/runy`, `/numerology`, `/prognoz`, `/matrix-destiny`).  
  Operational rule for Autopilot (derived from category + ad-object rules): [Magic category](https://yandex.ru/support/direct/ru/moderation/categories/magic), [Ad rules](https://yandex.ru/support/direct/ru/moderation/ad-rules)
- **Fortune-telling / reading service**: allowed in RU with limits — no guarantees, no “safe/effective” claims, no harm magic; geo-exclude BY; some banner formats unavailable for this topic.  
  Source: [Magic category](https://yandex.ru/support/direct/ru/moderation/categories/magic)
- Autopilot phase-1 policy: **only content hubs** in `landing-whitelist.yaml`; transactional funnels stay out until separately approved.

## 4) Who assigns `erid` inside Direct

Yandex, acting as an advertising data operator (ORD), issues the creative token and adds the «Реклама» mark for creatives placed in Direct after required advertiser data is filled; advertisers do not manually mint erid for in-Direct placement.  
Source: [Ad labeling in Direct](https://yandex.ru/support/direct/ru/technologies-and-services/ad-labelingl)

If we later place creatives **outside** Direct (site, partners), token flow may differ — that case is out of scope for in-Direct Autopilot.
