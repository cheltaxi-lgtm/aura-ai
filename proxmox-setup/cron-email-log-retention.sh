#!/bin/bash
# Bound ownerless email diagnostics to 30 days without a bulk deploy-time purge.
set -euo pipefail
exec 9>/run/lock/zovus-email-log-retention.lock
flock -n 9 || exit 0
cd /opt/aura-ai || exit 1
export PATH="/usr/bin:/usr/local/bin:$PATH"
SECRET="$(grep -E '^CRON_SECRET=' .env.local 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\r' | tr -d '"' | tr -d "'")"
if [[ -z "${SECRET}" ]]; then
  echo "cron-email-log-retention: CRON_SECRET missing" >&2
  exit 1
fi
curl -fsS -m 120 -H "x-cron-secret: ${SECRET}" \
  "http://127.0.0.1:3000/api/cron/email-log-retention"
