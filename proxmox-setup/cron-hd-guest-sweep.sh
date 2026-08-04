#!/bin/bash
# Expire unclaimed guest-pool Human Design charts past TTL (30 days).
# Safe scope: hd_charts.user_id IS NULL only — owned charts are never touched.
set -euo pipefail
cd /opt/aura-ai || exit 1

SECRET="$(grep -E '^CRON_SECRET=' .env.local 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\r' | tr -d '"' | tr -d "'")"
if [ -z "$SECRET" ]; then
  echo "cron-hd-guest-sweep: CRON_SECRET not set — skipping."
  exit 0
fi

BASE="http://127.0.0.1:3000"
echo "[$(date -Is)] hd-guest-sweep: $(curl -sS -m 120 -H "x-cron-secret: $SECRET" "$BASE/api/cron/hd-guest-sweep" || echo 'request failed')"
