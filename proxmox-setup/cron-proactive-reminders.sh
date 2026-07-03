#!/bin/bash
# Proactive re-engagement: fire ritual follow-ups + upcoming-event nudges.
# Hits the running app over localhost using the shared CRON_SECRET from
# .env.local. Installed via proxmox-setup/install-crons.sh.
set -euo pipefail
cd /opt/aura-ai || exit 1

SECRET="$(grep -E '^CRON_SECRET=' .env.local 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\r' | tr -d '"' | tr -d "'")"
if [ -z "$SECRET" ]; then
  echo "cron-proactive-reminders: CRON_SECRET not set in .env.local — skipping."
  exit 0
fi

BASE="http://127.0.0.1:3000"
echo "[$(date -Is)] ritual/remind:    $(curl -sS -m 60 -H "x-cron-secret: $SECRET" "$BASE/api/ritual/remind" || echo 'request failed')"
echo "[$(date -Is)] ritual/recover:   $(curl -sS -m 300 -H "x-cron-secret: $SECRET" "$BASE/api/ritual/recover-stuck" || echo 'request failed')"
echo "[$(date -Is)] event-reminders:  $(curl -sS -m 60 -H "x-cron-secret: $SECRET" "$BASE/api/cron/event-reminders?leadDays=3" || echo 'request failed')"
