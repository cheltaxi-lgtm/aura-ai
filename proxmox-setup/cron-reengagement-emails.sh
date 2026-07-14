#!/bin/bash
# Re-engagement emails: daily rune bonus (19 MSK) + inactive win-back (10 MSK).
set -euo pipefail
cd /opt/aura-ai || exit 1

SECRET="$(grep -E '^CRON_SECRET=' .env.local 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\r' | tr -d '"' | tr -d "'")"
if [ -z "$SECRET" ]; then
  echo "cron-reengagement-emails: CRON_SECRET not set — skipping."
  exit 0
fi

BASE="http://127.0.0.1:3000"
HOUR="$(TZ=Europe/Moscow date +%-H 2>/dev/null || date -u +%-H)"
echo "[$(date -Is)] reengagement-emails MSK hour=$HOUR: $(curl -sS -m 180 -H "x-cron-secret: $SECRET" "$BASE/api/cron/reengagement-emails?hourMsk=$HOUR" || echo 'request failed')"
