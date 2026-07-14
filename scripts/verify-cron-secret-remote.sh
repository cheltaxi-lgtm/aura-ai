#!/bin/bash
set -euo pipefail
cd /opt/aura-ai

ENV_FILE="/opt/aura-ai/.env.local"

ensure_cron_secret() {
  if ! grep -q '^CRON_SECRET=' "$ENV_FILE" 2>/dev/null; then
    echo "CRON_SECRET=$(openssl rand -hex 24)" >> "$ENV_FILE"
    echo "Created CRON_SECRET"
    return 0
  fi
  local val
  val="$(grep '^CRON_SECRET=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '\r' | tr -d '[:space:]')"
  if [ -z "$val" ]; then
    sed -i "s|^CRON_SECRET=.*|CRON_SECRET=$(openssl rand -hex 24)|" "$ENV_FILE"
    echo "Filled empty CRON_SECRET"
    return 0
  fi
  echo "CRON_SECRET already set (len=${#val})"
  return 0
}

ensure_cron_secret

SECRET="$(grep -E '^CRON_SECRET=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '\r' | tr -d '"' | tr -d "'")"
if [ -z "$SECRET" ]; then
  echo "ERROR: CRON_SECRET still empty"
  exit 1
fi

# App must see the same secret after restart
sudo systemctl restart aura-ai
sleep 3

for i in $(seq 1 15); do
  if curl -fsS http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

RESP="$(curl -sS -m 15 -H "x-cron-secret: $SECRET" "http://127.0.0.1:3000/api/cron/reengagement-emails?hourMsk=12" || echo '{"error":"curl_failed"}')"
echo "cron_probe=$RESP"

if echo "$RESP" | grep -q '"error":"Forbidden"'; then
  echo "ERROR: cron secret rejected by app (Forbidden)"
  exit 1
fi

echo ">>> cron-reengagement-emails.sh dry run"
bash /opt/aura-ai/proxmox-setup/cron-reengagement-emails.sh | tail -1

echo "OK: CRON_SECRET configured and accepted"
