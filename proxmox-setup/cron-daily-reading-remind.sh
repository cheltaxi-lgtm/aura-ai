#!/bin/bash
# Daily reading reminders — in-app + email (Resend when RESEND_API_KEY set).
set -euo pipefail
cd /opt/aura-ai || exit 1

SECRET="$(grep -E '^CRON_SECRET=' .env.local 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\r' | tr -d '"' | tr -d "'")"
if [ -z "$SECRET" ]; then
  echo "cron-daily-reading-remind: CRON_SECRET not set — skipping."
  exit 0
fi

BASE="http://127.0.0.1:3000"
HOUR="$(TZ=Europe/Moscow date +%-H 2>/dev/null || date -u +%-H)"
echo "[$(date -Is)] daily-reading-remind MSK hour=$HOUR: $(curl -sS -m 120 -H "x-cron-secret: $SECRET" "$BASE/api/cron/daily-reading-remind?hourMsk=$HOUR" || echo 'request failed')"
