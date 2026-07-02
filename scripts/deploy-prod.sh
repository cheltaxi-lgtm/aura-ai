#!/usr/bin/env bash
# Safe production deploy — preserves /opt/aura-ai/.env.local on the VM.
set -euo pipefail

HOST="${DEPLOY_HOST:-root@217.12.37.32}"
APP_DIR="${DEPLOY_DIR:-/opt/aura-ai}"
TARBALL="${TMPDIR:-/tmp}/aura-ai-deploy.tgz"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Building locally..."
cd "$ROOT"
npm run build

echo "==> Packing (excluding node_modules, .next, .git, .env.local)..."
rm -f "$TARBALL"
tar --exclude="node_modules" --exclude=".next" --exclude=".git" --exclude=".env.local" \
  -czf "$TARBALL" -C "$(dirname "$ROOT")" "$(basename "$ROOT")"

echo "==> Uploading to $HOST..."
scp "$TARBALL" "$HOST:/tmp/aura-ai-deploy.tgz"

echo "==> Deploying on server (env preserved)..."
ssh "$HOST" bash -s <<'REMOTE'
set -euo pipefail
APP_DIR="/opt/aura-ai"
ENV_BACKUP="/tmp/aura-ai-env.local.bak"

if [ -f "$APP_DIR/.env.local" ]; then
  cp "$APP_DIR/.env.local" "$ENV_BACKUP"
  echo "Backed up .env.local -> $ENV_BACKUP"
fi

sudo rm -rf "$APP_DIR"
sudo tar -xzf /tmp/aura-ai-deploy.tgz -C /opt
sudo chown -R ubuntu:ubuntu "$APP_DIR"

if [ -f "$ENV_BACKUP" ]; then
  cp "$ENV_BACKUP" "$APP_DIR/.env.local"
  echo "Restored production .env.local"
fi

cd "$APP_DIR"
npm ci
npm run build
sudo systemctl restart aura-ai
systemctl is-active aura-ai
REMOTE

echo "==> Done. Check: curl -s -o /dev/null -w '%{http_code}' https://zovus.ru/api/health"
