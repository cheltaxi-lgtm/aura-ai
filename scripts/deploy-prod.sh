#!/usr/bin/env bash
# Safe production deploy — preserves /opt/aura-ai/.env.local on the VM.
set -euo pipefail

HOST="${DEPLOY_HOST:-root@217.12.37.32}"
APP_DIR="${DEPLOY_DIR:-/opt/aura-ai}"
TARBALL="${TMPDIR:-/tmp}/aura-ai-deploy.tgz"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SSH_KEY="${DEPLOY_SSH_KEY:-$HOME/.ssh/aura_deploy_ed25519}"
SSH_OPTS=(-i "$SSH_KEY" -o BatchMode=yes -o StrictHostKeyChecking=accept-new)

# Local build intentionally skipped: the tarball excludes .next and the server
# rebuilds anyway — building here only risks local OOM on Windows.
echo "==> Type-checking locally..."
cd "$ROOT"
npx tsc --noEmit -p tsconfig.json

echo "==> Packing (excluding node_modules, .next, .git, .env.local)..."
rm -f "$TARBALL"
tar --exclude="node_modules" --exclude=".next" --exclude=".git" --exclude=".env.local" \
  -czf "$TARBALL" -C "$(dirname "$ROOT")" "$(basename "$ROOT")"

echo "==> Uploading to $HOST..."
scp "${SSH_OPTS[@]}" "$TARBALL" "$HOST:/tmp/aura-ai-deploy.tgz"

echo "==> Deploying on server (env preserved)..."
ssh "${SSH_OPTS[@]}" "$HOST" bash -s <<'REMOTE'
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

grep -q '^TRUST_PROXY=' "$APP_DIR/.env.local" \
  && sed -i 's|^TRUST_PROXY=.*|TRUST_PROXY=true|' "$APP_DIR/.env.local" \
  || echo 'TRUST_PROXY=true' >> "$APP_DIR/.env.local"

cd "$APP_DIR"
npm ci
[ -f data/geonames/cities.min.json ] || npm run build:geonames
npm run migrate
npm run build
sudo -u ubuntu bash proxmox-setup/install-crons.sh
sudo systemctl restart aura-ai
systemctl is-active aura-ai
REMOTE

echo "==> Done. Check: curl -s -o /dev/null -w '%{http_code}' https://zovus.ru/api/health"
