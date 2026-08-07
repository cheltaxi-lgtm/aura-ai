# Zovus Pro

Practitioner CRM module (`src/modules/pro/**`, UI `src/app/(pro)/**`). Isolated schema `pro`, dark by default (`PRO_MODULE_ENABLED=false`).

Uses **normal user auth** + `pro.accounts` — not expert auth. Marketing landing: `/zovus-pro`. Legal: `/offer-pro`.

## Product surfaces

| Path | Role |
|------|------|
| `/zovus-pro` | Marketing landing (sitemap when module on) |
| `/auth` | Role card «Практик» when `proModuleEnabled` → login/register with `returnTo=/pro` |
| `/pro` | Practitioner cabinet (apply form → pending → active) |
| `/pro/landing` | Mini-landing editor (needs `PRO_PORTAL_ENABLED`) |
| `/pro/case/new` | Create case (`manual_spread` / `natal` / `matrix` / `hd`) |
| `/pro/case/[id]` | Birth form → chart facts → premium draft → accept → deliver |
| `/pro/f/[token]` | Public intake (client picks product + birth data) |
| `/p/[slug]` | Public practitioner mini-landing (`brand_slug`, needs portal) |
| `/r/[token]` | Public report (no site header); print / Save as PDF |
| `/admin/pro` | Admin approve/suspend (AdminShell) |
| `/offer-pro` | Offer for practitioners |

## Practice → graphics → result landing → PDF

Expert funnel (no Avito API yet):

1. `/pro/case/new` — pick practice (`natal` | `matrix` | `hd`) matching site products.
2. Case form: birth fields per practice; geocode; `chartFacts` + later `chartSnapshot` (no consumer cabinet write).
3. `PATCH generate` charges Pro `generate_draft`, enqueues async job `pro_premium_report` (migration `114_migrate_async_pro_premium_job_kind`) which calls **consumer generators** (natal validated report / matrix sectioned / HD full report).
4. Practitioner waits (poll `/api/jobs/:id`), **Accept** (`save_human`), **Deliver** → `/r/{token}`.
5. Client result page: wheel / matrix grid / bodygraph + text + **Скачать PDF**.
6. PDF: `GET /api/pro/public/report/{token}/pdf` via `puppeteer-core` + Chromium (`PRO_PDF_ENABLED`, `PRO_PDF_CHROMIUM_PATH`). Install helper: `hosting/ensure-pro-pdf-chromium.sh`.

Intake `/pro/f/{zf_…}` still lets the client choose product + birth data.

## Mini-landing (portal)

Flag: `PRO_PORTAL_ENABLED` (also requires `PRO_MODULE_ENABLED`).

- Table `pro.landings` — offer copy, promo counter, bound `intake_url`
- Cabinet: `/pro/landing` → publish → public `/p/{brand_slug}`
- CTA → `/pro/f/{zf_…}` (intake creates client + case)
- Promo «первые N бесплатно» — editable badge + manual `promo_used` counter (no client billing)
- Pages are `noindex`; robots Disallow `/p/`

## Stages

| Stage | Flags | Notes |
|-------|--------|-------|
| S0 Dark | all off | routes 404, migrations ok |
| S1 Internal | `PRO_MODULE_ENABLED=true`, `PRO_AI_ENABLED=true`, `PRO_BILLING_MODE=shadow`, `PRO_DELIVERY_ENABLED=false` | allowlist + synthetic clients only |
| S2 Pilot | + `PRO_DELIVERY_ENABLED=true`, `PRO_BILLING_MODE=live` | needs B2B/DPA before real PII |
| Portal | + `PRO_PORTAL_ENABLED=true` | public `/p/{slug}` mini-landings |

## Platform feature flag

`GET /api/platform/features` exposes `proModuleEnabled` from `isProModuleEnabled()`. Client: `usePlatformFeatures().proModuleEnabled` (fallback `false`).

## ENV

See `.env.example` (`PRO_*`). Never set `PRO_CRISIS_GATE_ENABLED=false`.

Flags without full product UI yet (stubs): `PRO_FOLLOWUP_ENABLED`, `PRO_VISION_ENABLED`, `PRO_TTS_ENABLED`, `PRO_TRANSCRIPTS_ENABLED`.

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
