#!/bin/bash
# Refund Human Design charges whose report generation never delivered
# (crashed pending / error rows with a held charge, older than 1h).
set -euo pipefail
cd /opt/aura-ai || exit 1

SECRET="$(grep -E '^CRON_SECRET=' .env.local 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\r' | tr -d '\"' | tr -d "'")"
if [ -z "$SECRET" ]; then
  echo "cron-hd-payment-reconcile: CRON_SECRET not set — skipping."
  exit 0
fi

BASE="http://127.0.0.1:3000"
echo "[$(date -Is)] hd-payment-reconcile: $(curl -sS -m 120 -H "x-cron-secret: $SECRET" "$BASE/api/cron/hd-payment-reconcile" || echo 'request failed')"
