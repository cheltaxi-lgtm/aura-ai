#!/usr/bin/env bash
# Create unprivileged worker user and sync its EnvironmentFile.
set -euo pipefail

APP_ROOT="${1:-/opt/aura-ai}"

if ! id aura-ai >/dev/null 2>&1; then
  useradd --system --home "$APP_ROOT" --shell /usr/sbin/nologin aura-ai
  echo "Created system user aura-ai"
fi

mkdir -p /var/log/aura-ai
chown aura-ai:aura-ai /var/log/aura-ai

# Deploy tree may be owned by root/ubuntu — grant group read so the worker can run npm.
OWNER_GROUP="$(stat -c '%G' "$APP_ROOT" 2>/dev/null || echo root)"
if [ "$OWNER_GROUP" != "aura-ai" ]; then
  usermod -aG "$OWNER_GROUP" aura-ai 2>/dev/null || true
fi
chmod -R g+rX "$APP_ROOT" 2>/dev/null || true
if [ -f "${APP_ROOT}/.env.local" ]; then
  chmod 640 "${APP_ROOT}/.env.local" || true
fi

sed -i 's/\r$//' "${APP_ROOT}/hosting/sync-async-jobs-env.sh" 2>/dev/null || true
bash "${APP_ROOT}/hosting/sync-async-jobs-env.sh" "$APP_ROOT"
