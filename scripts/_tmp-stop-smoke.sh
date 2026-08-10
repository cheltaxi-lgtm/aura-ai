#!/usr/bin/env bash
set -euo pipefail
pkill -f 'smoke-paid-report-kinds' || true
pkill -f '_tmp-wait-smoke' || true
bash /opt/aura-ai/hosting/sync-async-jobs-env.sh /opt/aura-ai
systemctl restart aura-ai-async-jobs
sleep 3
systemctl is-active aura-ai-async-jobs
grep OPENROUTER_HTTPS_PROXY /opt/aura-ai/.env.async-jobs | head -1
cd /opt/aura-ai
DB=$(grep -E '^DATABASE_URL=' .env.local | head -1 | cut -d= -f2- | sed 's/^["'\'']//;s/["'\'']$//')
psql "$DB" -c "UPDATE async_jobs SET status='failed', error_code='smoke_aborted', error_message='aborted stuck smoke', completed_at=NOW(), worker_id=NULL, locked_at=NULL, updated_at=NOW() WHERE status IN ('pending','running') AND kind IN ('hd_report','hd_composite_report','numerology_reading','natal_interpretation','natal_forecast','natal_compatibility','pro_premium_report');"
echo stopped
