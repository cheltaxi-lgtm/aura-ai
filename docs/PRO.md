# Zovus Pro

Practitioner CRM module (`src/modules/pro/**`, UI `src/app/(pro)/**`). Isolated schema `pro`, dark by default (`PRO_MODULE_ENABLED=false`).

Uses **normal user auth** + `pro.accounts` — not expert auth. Marketing landing: `/zovus-pro`. Legal: `/offer-pro`.

## Product surfaces

| Path | Role |
|------|------|
| `/zovus-pro` | Marketing landing (sitemap when module on) |
| `/auth` | Role card «Практик» when `proModuleEnabled` → login/register with `returnTo=/pro` |
| `/pro` | Practitioner cabinet (apply form → pending → active) |
| `/pro/f/[token]` | Public intake form |
| `/r/[token]` | Public report (no site header) |
| `/admin/pro` | Admin approve/suspend (AdminShell) |
| `/offer-pro` | Offer for practitioners |

## Stages

| Stage | Flags | Notes |
|-------|--------|-------|
| S0 Dark | all off | routes 404, migrations ok |
| S1 Internal | `PRO_MODULE_ENABLED=true`, `PRO_AI_ENABLED=true`, `PRO_BILLING_MODE=shadow`, `PRO_DELIVERY_ENABLED=false` | allowlist + synthetic clients only |
| S2 Pilot | + `PRO_DELIVERY_ENABLED=true`, `PRO_BILLING_MODE=live` | needs B2B/DPA before real PII |

## Platform feature flag

`GET /api/platform/features` exposes `proModuleEnabled` from `isProModuleEnabled()`. Client: `usePlatformFeatures().proModuleEnabled` (fallback `false`).

## ENV

See `.env.example` (`PRO_*`). Never set `PRO_CRISIS_GATE_ENABLED=false`.

Flags without product UI yet (stubs only): `PRO_PORTAL_ENABLED`, `PRO_FOLLOWUP_ENABLED`, `PRO_VISION_ENABLED`, `PRO_TTS_ENABLED`, `PRO_TRANSCRIPTS_ENABLED`.

## Email

Transactional stubs in `src/lib/email/templates.ts` / registry:

- `pro_apply_admin` — admin alert on new apply
- `pro_apply_user` — confirmation to practitioner (pending)
- `pro_approved` — access opened

Wired from `/api/pro/account` (POST) and `/api/pro/admin/accounts` (PATCH → active).

## Verify

```bash
npm run verify:pro
```

## Cron

`POST /api/cron/pro-maintenance` with `x-cron-secret` — only when module enabled.
