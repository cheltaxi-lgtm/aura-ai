#!/bin/bash
# Ads autopilot weekly digest (B6) + max-days guard — admin in-app notification.
set -euo pipefail
cd /opt/aura-ai || exit 1

SECRET="$(grep -E '^CRON_SECRET=' .env.local 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\r' | tr -d '"' | tr -d "'")"
if [ -z "$SECRET" ]; then
  echo "cron-ads-weekly-digest: CRON_SECRET not set — skipping."
  exit 0
fi

BASE="http://127.0.0.1:3000"
echo "[$(date -Is)] ads-weekly-digest: $(curl -sS -m 120 -X POST -H "x-cron-secret: $SECRET" "$BASE/api/cron/ads-weekly-digest" || echo 'request failed')"
