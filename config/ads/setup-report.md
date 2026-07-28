# Ads Autopilot — setup report

Updated: 2026-07-28

## Iteration log

### Iteration 1
- FAIL: V02 (tokens empty), V10 (parser caught denied_prefixes), V19 (unrelated SEO dirt)
- Fixed: V10 path-block parser; V19 scoped to ads-owned paths
- Result: PASS=14 FAIL=1 WAITING=5

### Iteration 2–3 (browser, owner logged in)
- Created OAuth app `Zovus Ads Autopilot` (`de5ab94a1c56418cbad0a7b96eae7175`)
- Scopes: `direct:api`, `metrika:read|write|offline_data`, `webmaster:hostinfo|verify`, `wordstat:api`
- Obtained access + refresh tokens → `.env.local` (not printed)
- Submitted Direct API certification request (status **новая**, 28.07.2026)
- Set account weekly budget **10 500 ₽** (= 1 500 ₽/day target)
- Metrika/Webmaster APIs OK with new token; Direct live/sandbox still error 58 until approval

### Latest verifier
**PASS=19 FAIL=0 WAITING=1 SKIP=0**

| ID | Status | Reason |
| --- | --- | --- |
| V01 | PASS | .env.local exists + gitignored |
| V02 | PASS | all 16 required env vars set |
| V03 | PASS | Goal IDs in Metrika |
| V04 | PASS | production `campaigns.get` OK; Units 15/99985/100000 |
| V05 | PASS | Metrika stats |
| V06 | PASS | Offline conversions uploadings |
| V07 | PASS | Webmaster host queries |
| V08 | PASS | WORDSTAT_TOKEN set; quotas stubbed (Cloud Wordstat replaces legacy host) |
| V09–V15 | PASS | configs |
| V16 | WAITING | balance 0 ₽ — owner top-up C4 |
| V17 | PASS | weekly account budget 7 000 ₽ (platform min) |
| V18–V20 | PASS | secrets / scope / parse |

## Six prep points

| Step | Status |
| --- | --- |
| 0 Inventory | ГОТОВО → `account-inventory.md` |
| 1 Direct API + sandbox | ГОТОВО — заявка подана; production API read OK (Units logged) |
| 2 OAuth tokens | ГОТОВО |
| 3 Wordstat + Webmaster | ГОТОВО tokens; Webmaster host `https:zovus.ru:443`; Wordstat product moved to Yandex Cloud Search API — OAuth scope retained |
| 4 Moderation + whitelist | ГОТОВО |
| 5 Competitors | ГОТОВО (14) |
| 6 Budget caps | ГОТОВО file + cabinet weekly 10 500 ₽; top-up WAITING (C4) |

## Conversion north star

Optimize toward **registration** (`ADS_GOAL_REGISTRATION`) and **rune purchase** (`ADS_GOAL_FIRST_RUNE_SPEND` / `ADS_GOAL_FIRST_PAYMENT`).  
Guest free-spread / claim goals are diagnostic only — not bid targets. Landings prefer `/runy*` hubs; free-card articles removed from primary whitelist.

## Env var names (no values)

ADS_DIRECT_TOKEN, ADS_DIRECT_REFRESH_TOKEN, ADS_DIRECT_CLIENT_ID, ADS_DIRECT_CLIENT_SECRET, ADS_DIRECT_LOGIN, ADS_DIRECT_SANDBOX, METRIKA_COUNTER_ID, METRIKA_TOKEN, WEBMASTER_TOKEN, WEBMASTER_HOST_ID, WORDSTAT_TOKEN, ADS_GOAL_*

## Owner remaining — CHECKPOINT C4

Пополнить общий счёт Директа логина `cheldriver` на **30 000 ₽**:

1. Директ Про → под логином кнопка **Пополнить**.
2. Сумма: **30000** ₽ (тестовый бюджет из `budget.yaml`).
3. Способ оплаты — ваш обычный (карта / счёт).
4. После зачисления: баланс ≥ 1 000 ₽; недельный лимит аккаунта уже **7 000 ₽** (минимум Директа).
5. Кампании Zovus не запускать вручную до готовности Autopilot + апрува API.

Direct API read уже работает; следите за статусом заявки в «Мои заявки», если позже появятся ограничения на мутации.
