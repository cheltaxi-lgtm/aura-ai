#!/bin/bash
# Drain durable memory extraction outbox every minute.
# Always hits the app on loopback — never the public host.
# Going through Caddy logs x-cron-secret on every 502 and was the leak we found.
set -euo pipefail
exec 9>/run/lock/zovus-memory-extract.lock
flock -n 9 || exit 0
cd /opt/aura-ai || exit 1
export PATH="/usr/bin:/usr/local/bin:$PATH"
mkdir -p /opt/aura-ai/logs
SECRET="$(grep -E '^CRON_SECRET=' .env.local 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\r' | tr -d '"' | tr -d "'")"
if [[ -z "${SECRET}" ]]; then
  echo "cron-memory-extract: CRON_SECRET missing" >&2
  exit 1
fi
curl -fsS -m 300 -H "x-cron-secret: ${SECRET}" \
  "http://127.0.0.1:3000/api/cron/memory-extract?limit=5"
