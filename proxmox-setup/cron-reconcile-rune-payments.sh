#!/bin/bash
# Auto-reconcile missed YooKassa rune purchases (webhook fallback).
set -euo pipefail
cd /opt/aura-ai || exit 1

SECRET="$(grep -E '^CRON_SECRET=' .env.local 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\r' | tr -d '"' | tr -d "'")"
if [ -z "$SECRET" ]; then
  echo "cron-reconcile-rune-payments: CRON_SECRET not set — skipping."
  exit 0
fi

BASE="http://127.0.0.1:3000"
echo "[$(date -Is)] reconcile-rune-payments: $(curl -sS -m 180 -H "x-cron-secret: $SECRET" "$BASE/api/cron/reconcile-rune-payments" || echo 'request failed')"
