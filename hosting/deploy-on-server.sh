#!/usr/bin/env bash
# Run on production server after tarball + .env.local + DB dump are in place.
set -euo pipefail

APP_DIR="/opt/aura-ai"
TARBALL="${1:-/tmp/aura-ai-deploy.tgz}"
DUMP="${2:-/tmp/auraai.dump}"

cd "$APP_DIR"

if [ -f "$TARBALL" ]; then
  tar -xzf "$TARBALL" -C /opt/aura-ai
fi

sed -i 's/\r$//' hosting/deploy-on-server.sh hosting/bootstrap-beget.sh proxmox-setup/*.sh scripts/*.sh 2>/dev/null || true

echo ">>> Docker Postgres..."
docker compose up -d postgres
for i in $(seq 1 30); do
  if docker exec auraai-postgres pg_isready -U auraai -d auraai >/dev/null 2>&1; then break; fi
  sleep 2
done

if [ -f "$DUMP" ]; then
  echo ">>> Restore PostgreSQL..."
  docker cp "$DUMP" auraai-postgres:/tmp/auraai.dump
  docker exec auraai-postgres pg_restore -U auraai -d auraai --clean --if-exists --no-owner --no-acl /tmp/auraai.dump || \
    docker exec auraai-postgres pg_restore -U auraai -d auraai --no-owner --no-acl /tmp/auraai.dump || true
fi

grep -q '^NEXT_PUBLIC_APP_URL=' .env.local 2>/dev/null || echo 'NEXT_PUBLIC_APP_URL=https://zovus.ru' >> .env.local
grep -q '^COOKIE_SECURE=' .env.local 2>/dev/null || echo 'COOKIE_SECURE=true' >> .env.local
grep -q '^DATABASE_URL=' .env.local 2>/dev/null || echo 'DATABASE_URL=postgresql://auraai:auraai_secret@localhost:5432/auraai' >> .env.local

grep -q '^YANDEX_OAUTH_CLIENT_ID=' .env.local 2>/dev/null || echo 'YANDEX_OAUTH_CLIENT_ID=' >> .env.local
grep -q '^YANDEX_OAUTH_CLIENT_SECRET=' .env.local 2>/dev/null || echo 'YANDEX_OAUTH_CLIENT_SECRET=' >> .env.local
grep -q '^VK_CLIENT_ID=' .env.local 2>/dev/null || echo 'VK_CLIENT_ID=' >> .env.local
grep -q '^VK_CLIENT_SECRET=' .env.local 2>/dev/null || echo 'VK_CLIENT_SECRET=' >> .env.local
grep -q '^MAILRU_CLIENT_ID=' .env.local 2>/dev/null || echo 'MAILRU_CLIENT_ID=' >> .env.local
grep -q '^MAILRU_CLIENT_SECRET=' .env.local 2>/dev/null || echo 'MAILRU_CLIENT_SECRET=' >> .env.local

npm ci --legacy-peer-deps
set -a
# shellcheck disable=SC1091
source <(grep -E '^(NEXT_PUBLIC_RECAPTCHA_SITE_KEY|NEXT_PUBLIC_RECAPTCHA_ENABLED|NEXT_PUBLIC_APP_URL)=' .env.local | sed 's/\r$//')
set +a
npm run build

echo ">>> DB migrations..."
set -a
# shellcheck disable=SC1091
source <(grep -E '^(DATABASE_URL|OPENROUTER_API_KEY|MEMORY_EMBED_MODEL)=' .env.local | sed 's/\r$//')
set +a
node scripts/migrate.mjs

cp hosting/aura-ai.service /etc/systemd/system/aura-ai.service
systemctl daemon-reload
systemctl enable aura-ai
systemctl restart aura-ai

cp hosting/Caddyfile /etc/caddy/Caddyfile
systemctl enable caddy
systemctl reload caddy || systemctl restart caddy

if [ -f proxmox-setup/install-crons.sh ]; then
  sed -i 's/\r$//' proxmox-setup/install-crons.sh proxmox-setup/cron-*.sh 2>/dev/null || true
  bash proxmox-setup/install-crons.sh || true
fi

sleep 3
curl -sf http://127.0.0.1:3000/api/health | head -c 120
echo
systemctl is-active aura-ai caddy
echo "Deploy OK on $(hostname)"
