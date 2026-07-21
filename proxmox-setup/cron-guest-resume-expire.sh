#!/bin/bash
# Expire unclaimed guest-triplet resume receipts past TTL.
# Safe scope: guest_resume_status=issued AND user_id IS NULL AND expired only.
set -euo pipefail
cd /opt/aura-ai || exit 1

SECRET="$(grep -E '^CRON_SECRET=' .env.local 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\r' | tr -d '"' | tr -d "'")"
if [ -z "$SECRET" ]; then
  echo "cron-guest-resume-expire: CRON_SECRET not set — skipping."
  exit 0
fi

BASE="http://127.0.0.1:3000"
echo "[$(date -Is)] guest-resume-expire: $(curl -sS -m 120 -H "x-cron-secret: $SECRET" "$BASE/api/cron/guest-resume-expire" || echo 'request failed')"
