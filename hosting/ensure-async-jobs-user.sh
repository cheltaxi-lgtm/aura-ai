#!/usr/bin/env bash
# Create unprivileged worker user and sync its EnvironmentFile.
# Worker must NOT gain group read on .env.local — only .env.async-jobs (600).
set -euo pipefail

APP_ROOT="${1:-/opt/aura-ai}"

if ! id aura-ai >/dev/null 2>&1; then
  useradd --system --home "$APP_ROOT" --shell /usr/sbin/nologin aura-ai
  echo "Created system user aura-ai"
fi

mkdir -p /var/log/aura-ai
chown aura-ai:aura-ai /var/log/aura-ai

# Drop accidental supplementary membership from earlier deploys (group-readable secrets).
# gpasswd returns non-zero when the user is not in the group — never fail the script.
set +e
for grp in ubuntu root deploy; do
  if getent group "$grp" >/dev/null 2>&1; then
    gpasswd -d aura-ai "$grp" >/dev/null 2>&1
  fi
done
set -e

# Full secrets stay root-only. systemd worker env is a separate minimal file.
if [ -f "${APP_ROOT}/.env.local" ]; then
  chown root:root "${APP_ROOT}/.env.local" 2>/dev/null || true
  chmod 600 "${APP_ROOT}/.env.local" || true
fi

# World-readable code/deps only — enough for `npm run worker:async-jobs` without
# sharing the deploy owner's group (which would expose .env.local at 640).
for path in \
  "${APP_ROOT}/package.json" \
  "${APP_ROOT}/package-lock.json" \
  "${APP_ROOT}/node_modules" \
  "${APP_ROOT}/scripts" \
  "${APP_ROOT}/src" \
  "${APP_ROOT}/tsconfig.json" \
  "${APP_ROOT}/tsconfig.worker.json" \
  "${APP_ROOT}/next.config.ts" \
  "${APP_ROOT}/next.config.mjs" \
  "${APP_ROOT}/next.config.js"
do
  if [ -e "$path" ]; then
    chmod -R a+rX "$path" 2>/dev/null || true
  fi
done

# Ensure app root is traversable by the unprivileged worker.
chmod a+rx "$APP_ROOT" 2>/dev/null || true

sed -i 's/\r$//' "${APP_ROOT}/hosting/sync-async-jobs-env.sh" 2>/dev/null || true
bash "${APP_ROOT}/hosting/sync-async-jobs-env.sh" "$APP_ROOT"
