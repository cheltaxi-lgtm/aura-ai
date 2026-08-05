# Zovus Pro

Practitioner CRM module (`src/modules/pro/**`). Isolated schema `pro`, dark by default.

## Stages

| Stage | Flags | Notes |
|-------|--------|-------|
| S0 Dark | all off | routes 404, migrations ok |
| S1 Internal | `PRO_MODULE_ENABLED=true`, `PRO_AI_ENABLED=true`, `PRO_BILLING_MODE=shadow`, `PRO_DELIVERY_ENABLED=false` | allowlist + synthetic clients only |
| S2 Pilot | + `PRO_DELIVERY_ENABLED=true`, `PRO_BILLING_MODE=live` | needs B2B/DPA before real PII |

## ENV

See `.env.example` (`PRO_*`). Never set `PRO_CRISIS_GATE_ENABLED=false`.

## Verify

```bash
npm run verify:pro
```

## Cron

`POST /api/cron/pro-maintenance` with `x-cron-secret` — only when module enabled.
