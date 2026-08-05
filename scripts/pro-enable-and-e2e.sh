#!/bin/bash
# Enable all PRO_* flags on prod and run authenticated E2E against localhost:3000.
set -euo pipefail
APP_DIR=/opt/aura-ai
ENV_FILE="$APP_DIR/.env.local"
cd "$APP_DIR"

echo "==> Enabling all PRO flags in .env.local"
set_kv() {
  local key="$1" val="$2"
  if grep -qE "^${key}=" "$ENV_FILE"; then
    sed -i "s|^${key}=.*|${key}=${val}|" "$ENV_FILE"
  else
    printf '%s=%s\n' "$key" "$val" >> "$ENV_FILE"
  fi
}

set_kv PRO_MODULE_ENABLED true
set_kv PRO_AI_ENABLED true
set_kv PRO_BILLING_MODE live
set_kv PRO_DELIVERY_ENABLED true
set_kv PRO_DIALOG_MODE_MAX c
set_kv PRO_PORTAL_ENABLED true
set_kv PRO_FOLLOWUP_ENABLED true
set_kv PRO_TRANSCRIPTS_ENABLED true
set_kv PRO_VISION_ENABLED true
set_kv PRO_TTS_ENABLED true
set_kv PRO_CRISIS_GATE_ENABLED true
set_kv PRO_MAX_CASES_PER_DAY 50
set_kv PRO_MAX_CLIENTS 200
set_kv PRO_FREE_TRIAL_RUNES 50
set_kv PRO_FREE_TRIAL_DAYS 14

echo "Flags now:"
grep -E '^PRO_' "$ENV_FILE"

echo "==> Restarting app (runtime env)"
systemctl restart aura-ai
sleep 4
for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS -m 3 http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
curl -fsS -m 5 http://127.0.0.1:3000/api/health >/dev/null
curl -fsS -m 5 http://127.0.0.1:3000/api/pro/health
echo

echo "==> Running E2E"
node "$APP_DIR/scripts/pro-prod-e2e.mjs"
echo "ALL_OK"
