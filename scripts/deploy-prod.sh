#!/usr/bin/env bash
# Safe production deploy — preserves /opt/aura-ai/.env.local on the VM.
set -euo pipefail

HOST="${DEPLOY_HOST:-root@217.12.37.32}"
TARBALL="${TMPDIR:-/tmp}/aura-ai-deploy.tgz"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SSH_KEY="${DEPLOY_SSH_KEY:-$HOME/.ssh/aura_deploy_ed25519}"
SSH_OPTS=(-i "$SSH_KEY" -o BatchMode=yes -o StrictHostKeyChecking=accept-new)

# Local build intentionally skipped: the tarball excludes .next and the server
# rebuilds anyway — building here only risks local OOM on Windows.
echo "==> Type-checking locally..."
cd "$ROOT"
npx tsc --noEmit -p tsconfig.json

echo "==> Packing committed release (local secrets and temporary files excluded)..."
RELEASE_SHA="$(git rev-parse HEAD)"
PACK_DIR="$(mktemp -d)"
trap 'rm -rf "$PACK_DIR"' EXIT
mkdir "$PACK_DIR/aura-ai"
git archive "$RELEASE_SHA" | tar -xf - -C "$PACK_DIR/aura-ai"
printf '%s\n' "$RELEASE_SHA" > "$PACK_DIR/aura-ai/deploy-sha.txt"
tar -czf "$TARBALL" -C "$PACK_DIR" aura-ai
echo "Release: $RELEASE_SHA"

echo "==> Uploading to $HOST..."
scp "${SSH_OPTS[@]}" "$TARBALL" "$HOST:/tmp/aura-ai-deploy.tgz"

echo "==> Deploying on server (env preserved)..."
ssh "${SSH_OPTS[@]}" "$HOST" bash -s <<'REMOTE'
set -euo pipefail
APP_DIR="/opt/aura-ai"
umask 077
SNAPSHOT_ROOT="/opt/aura-ai-deploy-snapshots"
mkdir -p "$SNAPSHOT_ROOT"
chmod 700 "$SNAPSHOT_ROOT"
SNAPSHOT="$(mktemp -d "$SNAPSHOT_ROOT/release-$(date -u +%Y%m%dT%H%M%SZ)-XXXXXX")"
PREVIOUS="$SNAPSHOT/aura-ai"
ENV_BACKUP="$SNAPSHOT/env.local"
BOT_ENV_BACKUP="$SNAPSHOT/telegram-bot.env"
STAGING="$(mktemp -d /tmp/aura-ai-staging-XXXXXX)"
BOT_USER="aura-ai"
BOT_GROUP="aura-ai"
TREE_MOVED=0
SERVICES_STOPPED=0
RUNTIME_COPIED=0
NEW_SERVICES_STARTED=0

rollback_on_failure() {
  local code=$?
  trap - EXIT
  if [ "$code" -ne 0 ]; then
    echo "ERROR: deploy failed; restoring previous release from $SNAPSHOT" >&2
    if [ "$TREE_MOVED" -eq 1 ] && [ "$NEW_SERVICES_STARTED" -eq 1 ]; then
      # Freeze all consumers before inspecting the durable state. A failed or
      # ambiguous check must never downgrade executables that own accepted work.
      ROLLBACK_STATE_SAFE=0
      if systemctl stop aura-ai-async-jobs zovus-telegram-bot aura-ai; then
        ALL_NEW_SERVICES_STOPPED=1
        for unit in aura-ai aura-ai-async-jobs zovus-telegram-bot; do
          if [ "$(systemctl show "$unit" --property=ActiveState --value 2>/dev/null || true)" != "inactive" ]; then
            ALL_NEW_SERVICES_STOPPED=0
          fi
        done
        if [ "$ALL_NEW_SERVICES_STOPPED" -eq 1 ]; then
          if timeout 20s /usr/bin/node "$APP_DIR/hosting/check-deploy-rollback-safety.mjs" "$APP_DIR" "$PREVIOUS" > "$SNAPSHOT/rollback-safety.json" 2>/dev/null; then
            ROLLBACK_STATE_SAFE=1
          fi
        fi
      fi
      if [ "$ROLLBACK_STATE_SAFE" -ne 1 ]; then
        echo "NEEDS_FORWARD_RECOVERY: old-version rollback blocked; new code, compatible units and all data retained. Snapshot: $SNAPSHOT" >&2
        # These are still the new units and tree. Do not restore old credentials,
        # databases, fences or service definitions over unfinished durable work.
        systemctl restart aura-ai aura-ai-async-jobs zovus-telegram-bot || true
        exit "$code"
      fi
    fi
    if [ "$TREE_MOVED" -eq 1 ]; then
      systemctl stop aura-ai-async-jobs zovus-telegram-bot aura-ai || true
      if [ "$RUNTIME_COPIED" -eq 1 ]; then
        for relative in public/scene-art telegram-bot/data telegram-bot/backups logs backups; do
          if [ -d "$APP_DIR/$relative" ]; then
            mkdir -p "$PREVIOUS/$relative"
            cp -a "$APP_DIR/$relative/." "$PREVIOUS/$relative/"
          fi
        done
      fi
      [ ! -d "$APP_DIR" ] || mv "$APP_DIR" "$SNAPSHOT/failed-release"
      mv "$PREVIOUS" "$APP_DIR"
    fi
    for unit in aura-ai aura-ai-async-jobs zovus-telegram-bot; do
      if [ -f "$SNAPSHOT/$unit.service" ]; then
        install -m 644 "$SNAPSHOT/$unit.service" "/etc/systemd/system/$unit.service"
      fi
    done
    if [ -f "$SNAPSHOT/Caddyfile" ]; then
      install -m 644 "$SNAPSHOT/Caddyfile" /etc/caddy/Caddyfile
      systemctl reload caddy || true
    fi
    if [ -f "$SNAPSHOT/root.crontab" ]; then
      crontab "$SNAPSHOT/root.crontab"
    fi
    systemctl daemon-reload
    if [ "$SERVICES_STOPPED" -eq 1 ]; then
      systemctl restart aura-ai aura-ai-async-jobs zovus-telegram-bot || true
    fi
    local restored=0
    for _ in $(seq 1 30); do
      if [ "$(curl -sS --max-time 5 -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/api/health || true)" = "200" ]; then
        restored=1
        break
      fi
      sleep 2
    done
    for unit in aura-ai aura-ai-async-jobs zovus-telegram-bot; do
      systemctl is-active --quiet "$unit" || restored=0
    done
    for url in https://zovus.ru/api/health http://127.0.0.1:8787/health; do
      [ "$(curl -sS --max-time 15 -o /dev/null -w '%{http_code}' "$url" || true)" = "200" ] || restored=0
    done
    echo "previous_release_restored=$restored snapshot=$SNAPSHOT"
  fi
  exit "$code"
}

for unit in aura-ai aura-ai-async-jobs zovus-telegram-bot; do
  cp -a "/etc/systemd/system/$unit.service" "$SNAPSHOT/$unit.service"
done
cp -a /etc/caddy/Caddyfile "$SNAPSHOT/Caddyfile"
crontab -l > "$SNAPSHOT/root.crontab"
trap rollback_on_failure EXIT
test -s "$APP_DIR/.env.local"
bash "$APP_DIR/proxmox-setup/cron-pg-backup.sh"

if [ -f "$APP_DIR/.env.local" ]; then
  cp "$APP_DIR/.env.local" "$ENV_BACKUP"
  echo "Backed up .env.local -> $ENV_BACKUP"
fi
if [ -f "$APP_DIR/telegram-bot/.env" ]; then
  cp "$APP_DIR/telegram-bot/.env" "$BOT_ENV_BACKUP"
  echo "Backed up telegram-bot/.env -> $BOT_ENV_BACKUP"
fi

# Stage first: install outage page + Caddy BEFORE replacing the live tree so
# visitors see the premium stub instead of a broken hero / blank 502.
tar -xzf /tmp/aura-ai-deploy.tgz -C "$STAGING"
# Tarball root is the repo folder name (aura-ai).
STAGE_APP="$(find "$STAGING" -mindepth 1 -maxdepth 1 -type d | head -n1)"
[ -n "$STAGE_APP" ] && [ -f "$STAGE_APP/package.json" ]
sed -i 's/\r$//' "$STAGE_APP/hosting/install-maintenance-page.sh" 2>/dev/null || true
bash "$STAGE_APP/hosting/install-maintenance-page.sh" "$STAGE_APP"

SERVICES_STOPPED=1
systemctl stop aura-ai-async-jobs
systemctl stop zovus-telegram-bot
systemctl stop aura-ai

mv "$APP_DIR" "$PREVIOUS"
TREE_MOVED=1
mv "$STAGE_APP" "$APP_DIR"
rm -rf "$STAGING"
chown -R root:root "$APP_DIR"
# Keep runtime state authoritative; never replace it with developer copies.
for relative in public/releases public/scene-art telegram-bot/data telegram-bot/backups logs backups; do
  if [ -d "$PREVIOUS/$relative" ]; then
    mkdir -p "$APP_DIR/$relative"
    cp -a "$PREVIOUS/$relative/." "$APP_DIR/$relative/"
  fi
done
RUNTIME_COPIED=1

if [ -f "$ENV_BACKUP" ]; then
  cp "$ENV_BACKUP" "$APP_DIR/.env.local"
  chmod 600 "$APP_DIR/.env.local"
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
umask 022
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

# Async worker needs .env.async-jobs regenerated for the new tree. Without it,
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

NEW_SERVICES_STARTED=1
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

# New releases must demonstrate a functioning update consumer, not just a live
# Node process. The rollback above deliberately retains /health for old releases
# that predate /ready. Keep rollback armed throughout this bounded gate.
BOT_READY_CODE=""
for _ in $(seq 1 20); do
  BOT_READY_CODE="$(curl -sS --max-time 3 -o /dev/null -w '%{http_code}' http://127.0.0.1:8787/ready || true)"
  [ "$BOT_READY_CODE" = "200" ] && break
  sleep 2
done
if [ "$BOT_READY_CODE" != "200" ]; then
  echo "ERROR: bot readiness never returned 200 (last: ${BOT_READY_CODE:-none}; bounded to 100s)" >&2
  exit 1
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
# Keep rollback armed until public traffic and every service pass.
for path in /api/health / /auth/user/register /numerology/destiny-matrix /apple-icon.svg; do
  CODE="$(curl -sS --max-time 20 -o /dev/null -w '%{http_code}' "https://zovus.ru$path" || true)"
  [ "$CODE" = "200" ] || { echo "ERROR: public $path returned $CODE" >&2; exit 1; }
done
for unit in aura-ai aura-ai-async-jobs zovus-telegram-bot; do
  systemctl is-active --quiet "$unit"
done
[ "$(curl -sS --max-time 5 -o /dev/null -w '%{http_code}' http://127.0.0.1:8787/ready || true)" = "200" ]
echo "Previous release retained: $PREVIOUS"
trap - EXIT
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
