#!/bin/bash
# Daily natal transit notifications (requires natalChart.enabled).
set -euo pipefail
cd /opt/aura-ai || exit 1

SECRET="$(grep -E '^CRON_SECRET=' .env.local 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\r' | tr -d '"' | tr -d "'")"
if [ -z "$SECRET" ]; then
  echo "cron-natal-transits: CRON_SECRET not set in .env.local — skipping."
  exit 0
fi

BASE="http://127.0.0.1:3000"
echo "[$(date -Is)] natal-transits: $(curl -sS -m 120 -H "x-cron-secret: $SECRET" "$BASE/api/cron/natal-transits" || echo 'request failed')"
