#!/bin/bash
# Sweeps expired joint-reading invites + nudges initiators whose invite is
# about to expire while the partner hasn't started.
set -euo pipefail
cd /opt/aura-ai || exit 1

SECRET="$(grep -E '^CRON_SECRET=' .env.local 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\r' | tr -d '"' | tr -d "'")"
if [ -z "$SECRET" ]; then
  echo "cron-joint-reading-sweep: CRON_SECRET not set — skipping."
  exit 0
fi

BASE="http://127.0.0.1:3000"
echo "[$(date -Is)] joint-reading-sweep: $(curl -sS -m 120 -H "x-cron-secret: $SECRET" "$BASE/api/cron/joint-reading-sweep" || echo 'request failed')"
