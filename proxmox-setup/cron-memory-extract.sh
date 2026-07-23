#!/bin/bash
# Drain durable memory extraction outbox every few minutes.
set -euo pipefail
cd /opt/aura-ai || exit 1
export PATH="/usr/bin:/usr/local/bin:$PATH"
mkdir -p /opt/aura-ai/logs
set -a
# shellcheck disable=SC1090
source <(grep -E '^(CRON_SECRET|NEXT_PUBLIC_APP_URL|APP_URL)=' .env.local | sed 's/\r$//')
set +a
BASE="${NEXT_PUBLIC_APP_URL:-${APP_URL:-http://127.0.0.1:3000}}"
BASE="${BASE%/}"
if [[ -z "${CRON_SECRET:-}" ]]; then
  echo "cron-memory-extract: CRON_SECRET missing" >&2
  exit 1
fi
curl -fsS -H "x-cron-secret: ${CRON_SECRET}" \
  "${BASE}/api/cron/memory-extract?limit=20"
