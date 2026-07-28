# Ads Autopilot — API limits & token refresh

Updated: 2026-07-28

## Direct API v5

| Item | Value | Source |
| --- | --- | --- |
| Production JSON base | `https://api.direct.yandex.com/json/v5/` | [docs](https://yandex.ru/dev/direct/doc/ru/concepts/access) |
| Sandbox JSON base | `https://api-sandbox.direct.yandex.com/json/v5/` | [sandbox](https://yandex.ru/dev/direct/doc/ru/concepts/sandbox) |
| Account API flag | «Программный доступ: открыт» | Direct UI 2026-07-28 |
| Units (legacy v4 counter shown in UI) | 32000 remaining | Direct API settings |
| Sandbox / production API | Production `campaigns.get` OK after certification submit | Probe 2026-07-28 |
| Certification request | Submitted 28.07.2026 for ClientID `de5ab94a…7175` | Direct UI «Мои заявки» |
| OAuth app | `Zovus Ads Autopilot` | oauth.yandex.ru |
| Typical token lifetime | access ~15552000 s (~180 days); refresh via refresh_token | token response 2026-07-28 |

### Measured
- date: 2026-07-28
- endpoint: production `POST /json/v5/campaigns` method `get`
- UnitsUsed / UnitsLeft / UnitsLimit (from response headers): **15 / 99985 / 100000**

### Refresh procedure (Direct / shared Yandex OAuth)

1. Store `ADS_DIRECT_REFRESH_TOKEN`, `ADS_DIRECT_CLIENT_ID`, `ADS_DIRECT_CLIENT_SECRET` in `.env.local` only.
2. When API returns 401 / expired token, POST `https://oauth.yandex.ru/token` with `grant_type=refresh_token`.
3. Overwrite `ADS_DIRECT_TOKEN` (and refresh token if rotated). Never log token values.
4. Prefer sandbox (`ADS_DIRECT_SANDBOX=1`) until production campaign automation is approved.

Throttling thresholds for Autopilot code (until finer Units headers are logged in sandbox):

- Max **5** Direct mutating calls / minute
- Max **60** Direct read calls / minute
- Backoff on HTTP 503 / Units exhausted: 60s → 5m → 15m

## Metrika API

| Item | Value |
| --- | --- |
| Management | `https://api-metrika.yandex.net/management/v1/` |
| Stats | `https://api-metrika.yandex.net/stat/v1/` |
| Counter | `110138367` |
| Offline conversions | `.../counter/{id}/offline_conversions/uploadings` — list OK (200) |
| Token env | `METRIKA_TOKEN` (shared Ads Autopilot OAuth token) |

Practical throttle: ≤ **3** Management writes / minute; ≤ **10** stats queries / minute.

## Webmaster API

| Item | Value |
| --- | --- |
| Base | `https://api.webmaster.yandex.net/v4/` |
| Host key (UI) | `https:zovus.ru:443` |
| Verification | Confirmed via meta `7902ba7dfdb76ac3` |
| Queries report | API OK with `WEBMASTER_TOKEN` + `WEBMASTER_HOST_ID=https:zovus.ru:443` |

Throttle: ≤ **5** report requests / minute (conservative until official quota logged).

## Wordstat

Official docs (2026): capabilities moved to **Yandex Cloud Search API / Wordstat API**.
Legacy host `api.wordstat.yandex.net` presents TLS cert for `wordstat.yandex.ru` — do not use blindly.

Current setup:

- OAuth scope `wordstat:api` granted on Ads Autopilot app; `WORDSTAT_TOKEN` = shared OAuth access token.
- For production Autopilot keyword pulls prefer Cloud `Api-Key` + `folderId` when available; until then treat OAuth token as placeholder and keep conservative throttle.

Documented provisional throttle until measured in Cloud console:

- ≤ **30** phrase lookups / hour
- Cache topRequests responses ≥ 24h

## Unit logging requirement

First successful sandbox Direct call must append to this file:

```
### Measured
- date:
- endpoint:
- UnitsUsed / UnitsLeft (from response headers):
```
