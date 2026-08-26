#!/bin/bash
# Generic Ads cron wrapper — loopback only, same pattern as cron-memory-extract.sh.
# Usage: cron-ads-job.sh JOB_NAME [TIMEOUT_SEC]
set -euo pipefail
cd /opt/aura-ai || exit 1
export PATH="/usr/bin:/usr/local/bin:$PATH"
mkdir -p /opt/aura-ai/logs

JOB="${1:-}"
TIMEOUT="${2:-120}"
if [[ -z "$JOB" || ! "$JOB" =~ ^ads-[a-z0-9-]+$ ]]; then
  echo "cron-ads-job: invalid job name" >&2
  exit 1
fi

SECRET="$(grep -E '^CRON_SECRET=' .env.local 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\r' | tr -d '"' | tr -d "'")"
if [[ -z "${SECRET}" ]]; then
  echo "cron-ads-job ${JOB}: CRON_SECRET missing — skipping."
  exit 0
fi

BASE="http://127.0.0.1:3000"
echo "[$(date -Is)] ${JOB}: $(curl -sS -m "${TIMEOUT}" -X POST -H "x-cron-secret: ${SECRET}" "${BASE}/api/cron/${JOB}" || echo 'request failed')"
