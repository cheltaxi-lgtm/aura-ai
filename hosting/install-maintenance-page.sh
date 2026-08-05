#!/usr/bin/env bash
# Install static deploy/outage page outside the app tree (survives rm -rf /opt/aura-ai).
set -euo pipefail

APP_DIR="${1:-/opt/aura-ai}"
DEST="${MAINTENANCE_ROOT:-/var/www/zovus-maintenance}"
SRC="${APP_DIR}/hosting/maintenance"

if [ ! -f "${SRC}/index.html" ]; then
  echo "ERROR: missing ${SRC}/index.html" >&2
  exit 1
fi

mkdir -p "$DEST"
install -m 0644 "${SRC}/index.html" "${DEST}/index.html"

if [ -f "${APP_DIR}/hosting/Caddyfile" ]; then
  install -m 0644 "${APP_DIR}/hosting/Caddyfile" /etc/caddy/Caddyfile
  if command -v caddy >/dev/null 2>&1; then
    caddy validate --config /etc/caddy/Caddyfile
    systemctl reload caddy
  fi
fi

echo "Maintenance page ready at ${DEST}/index.html"
