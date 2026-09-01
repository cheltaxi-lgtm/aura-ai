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
BOT_ENV_BACKUP="/tmp/aura-ai-telegram-bot.env.bak"
STAGING="/tmp/aura-ai-staging"
BOT_USER="aura-ai"
BOT_GROUP="aura-ai"

if [ -f "$APP_DIR/.env.local" ]; then
  cp "$APP_DIR/.env.local" "$ENV_BACKUP"
  echo "Backed up .env.local -> $ENV_BACKUP"
fi
if [ -f "$APP_DIR/telegram-bot/.env" ]; then
  cp "$APP_DIR/telegram-bot/.env" "$BOT_ENV_BACKUP"
  echo "Backed up telegram-bot/.env -> $BOT_ENV_BACKUP"
fi

# Stage first: install outage page + Caddy BEFORE wiping the live tree so
# visitors see the premium stub instead of a broken hero / blank 502.
rm -rf "$STAGING"
mkdir -p "$STAGING"
tar -xzf /tmp/aura-ai-deploy.tgz -C "$STAGING"
# Tarball root is the repo folder name (aura-ai).
STAGE_APP="$(find "$STAGING" -mindepth 1 -maxdepth 1 -type d | head -n1)"
[ -n "$STAGE_APP" ] && [ -f "$STAGE_APP/package.json" ]
sed -i 's/\r$//' "$STAGE_APP/hosting/install-maintenance-page.sh" 2>/dev/null || true
bash "$STAGE_APP/hosting/install-maintenance-page.sh" "$STAGE_APP"

systemctl stop aura-ai || true
systemctl stop aura-ai-async-jobs || true
systemctl stop zovus-telegram-bot || true

rm -rf "$APP_DIR"
mv "$STAGE_APP" "$APP_DIR"
rm -rf "$STAGING"
chown -R root:root "$APP_DIR"

if [ -f "$ENV_BACKUP" ]; then
  cp "$ENV_BACKUP" "$APP_DIR/.env.local"
  echo "Restored production .env.local"
fi
if [ -f "$BOT_ENV_BACKUP" ]; then
  mkdir -p "$APP_DIR/telegram-bot"
  cp "$BOT_ENV_BACKUP" "$APP_DIR/telegram-bot/.env"
  chmod 600 "$APP_DIR/telegram-bot/.env"
  echo "Restored telegram-bot/.env"
fi

# Incomplete telegram-bot/.env (no BOT_INTERNAL_SECRET) makes every product
# action reply "Связь с сайтом временно недоступна". Heal from site .env.local.
_BOT_ENV="$APP_DIR/telegram-bot/.env"
_SITE_ENV="$APP_DIR/.env.local"
_BOT_SECRET="$(grep -E '^BOT_INTERNAL_SECRET=.' "$_BOT_ENV" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\r' || true)"
_SITE_SECRET="$(grep -E '^BOT_INTERNAL_SECRET=.' "$_SITE_ENV" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\r' || true)"
if [ -n "$_SITE_SECRET" ] && [ -z "$_BOT_SECRET" ]; then
  if [ -x "$APP_DIR/hosting/restore-bot-env-on-server.sh" ] || [ -f "$APP_DIR/hosting/restore-bot-env-on-server.sh" ]; then
    sed -i 's/\r$//' "$APP_DIR/hosting/restore-bot-env-on-server.sh" 2>/dev/null || true
    bash "$APP_DIR/hosting/restore-bot-env-on-server.sh" || echo "WARN: restore-bot-env-on-server.sh failed" >&2
  else
    mkdir -p "$APP_DIR/telegram-bot"
    touch "$_BOT_ENV"
    printf '\nBOT_INTERNAL_SECRET=%s\nSITE_INTERNAL_BASE_URL=http://127.0.0.1:3000\n' "$_SITE_SECRET" >> "$_BOT_ENV"
    chmod 600 "$_BOT_ENV"
    echo "Injected BOT_INTERNAL_SECRET into telegram-bot/.env from site env"
  fi
elif [ -z "$_SITE_SECRET" ]; then
  echo "WARN: site .env.local missing BOT_INTERNAL_SECRET — bot bridge will fail" >&2
fi
unset _BOT_ENV _SITE_ENV _BOT_SECRET _SITE_SECRET

grep -q '^TRUST_PROXY=' "$APP_DIR/.env.local" \
  && sed -i 's|^TRUST_PROXY=.*|TRUST_PROXY=true|' "$APP_DIR/.env.local" \
  || echo 'TRUST_PROXY=true' >> "$APP_DIR/.env.local"

cd "$APP_DIR"
npm ci
[ -f data/geonames/cities.min.json ] || npm run build:geonames
npm run migrate
# Export PRO_* (and core) for Next middleware/build so kill-switch matches .env.local.
if [ -f "$APP_DIR/.env.local" ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in ""|\#*) continue ;; esac
    key=${line%%=*}
    val=${line#*=}
    case "$key" in
      PRO_*|DATABASE_URL|AUTH_SECRET|NEXT_PUBLIC_APP_URL|TRUST_PROXY|COOKIE_SECURE)
        export "${key}=${val}" || true
        ;;
    esac
  done < "$APP_DIR/.env.local"
  echo "Build env PRO_MODULE_ENABLED=${PRO_MODULE_ENABLED:-unset}"
fi
npm run build
bash proxmox-setup/install-crons.sh

# Async worker needs .env.async-jobs — wiped by rm -rf above. Without it,
# intention/daily/natal jobs stay pending and the client ritual hangs forever.
sed -i 's/\r$//' hosting/ensure-async-jobs-user.sh hosting/sync-async-jobs-env.sh hosting/aura-ai.service hosting/aura-ai-async-jobs.service hosting/install-maintenance-page.sh hosting/zovus-telegram-bot.service 2>/dev/null || true
bash hosting/ensure-async-jobs-user.sh "$APP_DIR"
# Refresh ALL units on every deploy — otherwise app-unit drift on the server
# survives the canonical deploy path.
install -D -m 0644 hosting/aura-ai.service /etc/systemd/system/aura-ai.service
install -D -m 0644 hosting/aura-ai-async-jobs.service /etc/systemd/system/aura-ai-async-jobs.service
if [ -f hosting/zovus-telegram-bot.service ]; then
  install -D -m 0644 hosting/zovus-telegram-bot.service /etc/systemd/system/zovus-telegram-bot.service
fi
systemctl daemon-reload
systemctl reset-failed aura-ai 2>/dev/null || true
systemctl reset-failed aura-ai-async-jobs 2>/dev/null || true
systemctl reset-failed zovus-telegram-bot 2>/dev/null || true
systemctl enable aura-ai-async-jobs
systemctl enable zovus-telegram-bot 2>/dev/null || true

# Bot unit runs as aura-ai; tree was chown'd root:root above. Create runtime
# dirs and fix ownership before start (idempotent — safe if already correct).
if [ -d "$APP_DIR/telegram-bot" ]; then
  mkdir -p "$APP_DIR/telegram-bot/data" "$APP_DIR/telegram-bot/logs"
  if id "$BOT_USER" >/dev/null 2>&1; then
    chown -R "$BOT_USER:$BOT_GROUP" "$APP_DIR/telegram-bot"
    chmod 600 "$APP_DIR/telegram-bot/.env" 2>/dev/null || true
    echo "telegram-bot ownership -> ${BOT_USER}:${BOT_GROUP}"
  else
    echo "WARN: user $BOT_USER missing — bot may fail with EACCES on data/" >&2
  fi
  if [ -f "$APP_DIR/telegram-bot/package.json" ]; then
    (cd "$APP_DIR/telegram-bot" && npm ci --legacy-peer-deps)
    # npm ci as root may recreate node_modules as root — re-apply ownership.
    if id "$BOT_USER" >/dev/null 2>&1; then
      chown -R "$BOT_USER:$BOT_GROUP" "$APP_DIR/telegram-bot"
    fi
  fi
fi

systemctl restart aura-ai
systemctl restart aura-ai-async-jobs
systemctl restart zovus-telegram-bot || true
systemctl is-active aura-ai
if ! systemctl is-active --quiet aura-ai-async-jobs; then
  echo "ERROR: aura-ai-async-jobs failed to start — spreads will hang" >&2
  systemctl status aura-ai-async-jobs --no-pager -l | head -40 >&2
  exit 1
fi
systemctl is-active aura-ai-async-jobs
if systemctl list-unit-files zovus-telegram-bot.service >/dev/null 2>&1; then
  if ! systemctl is-active --quiet zovus-telegram-bot; then
    echo "ERROR: zovus-telegram-bot failed to start" >&2
    systemctl status zovus-telegram-bot --no-pager -l | head -40 >&2
    exit 1
  fi
  systemctl is-active zovus-telegram-bot
fi

# Enforced HTTP health gate: `is-active` proves process liveness, not serving
# correctness (a boot-looping / ChunkLoadError release would still be "active").
echo "Waiting for local /api/health (127.0.0.1:3000)..."
HEALTH_CODE=""
for _ in $(seq 1 30); do
  HEALTH_CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:3000/api/health || true)"
  [ "$HEALTH_CODE" = "200" ] && break
  sleep 2
done
if [ "$HEALTH_CODE" != "200" ]; then
  echo "ERROR: local /api/health never returned 200 (last: ${HEALTH_CODE:-none}; up to ~3.5min of retries)" >&2
  exit 1
fi
echo "Local health gate: HTTP 200"
REMOTE

echo "==> Public health gate (https://zovus.ru/api/health)..."
PUB_CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 https://zovus.ru/api/health || true)"
if [ "$PUB_CODE" != "200" ]; then
  echo "ERROR: https://zovus.ru/api/health returned ${PUB_CODE:-none} after deploy" >&2
  exit 1
fi
echo "==> Done. Public health gate: HTTP 200"

echo "==> Post-deploy SEO (IndexNow / sitemap ping)..."
if ! node scripts/post-deploy-seo.mjs https://zovus.ru; then
  echo "WARN: post-deploy-seo failed (non-fatal — site is already healthy)"
fi
