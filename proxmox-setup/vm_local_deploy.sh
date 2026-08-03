#!/bin/bash
# Запускать на VM 192.168.1.152 после загрузки /tmp/aura-ai-deploy.tgz
set -euo pipefail

TARBALL="${1:-/tmp/aura-ai-deploy.tgz}"
RELEASES_BACKUP=""
SCENE_ART_BACKUP=""
DEPLOY_LOG="/opt/aura-ai/logs/deploy-journal.txt"
DEPLOY_STARTED="$(date -Iseconds)"
GIT_SHA="unknown"
DEPLOY_STATUS="failed"

verify_geonames_index() {
  local file="$1"
  [ -s "$file" ] || {
    echo "ERROR: required GeoNames index is missing or empty: $file" >&2
    return 1
  }
  node -e '
    const fs = require("fs");
    const value = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    if (!Array.isArray(value) || value.length === 0) {
      throw new Error("GeoNames index must be a non-empty JSON array");
    }
  ' "$file"
}

mkdir -p /opt/aura-ai/logs

log_deploy() {
  local status="$1"
  local detail="${2:-}"
  echo "${DEPLOY_STARTED} sha=${GIT_SHA} status=${status}${detail:+ detail=${detail}}" >> "${DEPLOY_LOG}"
}

# Services are stopped before `npm ci` + candidate build, so any abort between
# those steps and activation leaves the site 502 until someone notices. The old
# .next is still on disk (rsync keeps it), so bringing the units back restores
# the previous release. Also re-derive the worker EnvironmentFile: rsync --delete
# removes .env.async-jobs, and it is normally regenerated after activation.
restore_previous_release() {
  if systemctl is-active --quiet aura-ai; then
    return
  fi
  echo ">>> Deploy aborted with app stopped — restoring previous release..."
  if [ ! -f /opt/aura-ai/.env.async-jobs ] && [ -f /opt/aura-ai/hosting/sync-async-jobs-env.sh ]; then
    sed -i 's/\r$//' /opt/aura-ai/hosting/sync-async-jobs-env.sh 2>/dev/null || true
    bash /opt/aura-ai/hosting/sync-async-jobs-env.sh /opt/aura-ai || true
  fi
  # Activation swaps both .next and node_modules. Prefer the side-by-side previous
  # trees when present; only reinstall if both are gone.
  if [ -d /opt/aura-ai/.next-previous ]; then
    rm -rf /opt/aura-ai/.next
    mv /opt/aura-ai/.next-previous /opt/aura-ai/.next
  fi
  if [ -d /opt/aura-ai/node_modules-previous/next ]; then
    rm -rf /opt/aura-ai/node_modules
    mv /opt/aura-ai/node_modules-previous /opt/aura-ai/node_modules
  elif [ ! -d /opt/aura-ai/node_modules/next ]; then
    echo ">>> node_modules incomplete — reinstalling before restore..."
    (cd /opt/aura-ai && npm ci --legacy-peer-deps) || echo "WARN: reinstall failed; app cannot start without manual npm ci"
  fi
  sudo systemctl start aura-ai || true
  RESTORED=0
  for _ in $(seq 1 30); do
    if curl -fsS http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
      RESTORED=1
      echo "previous_release_restored=1"
      break
    fi
    sleep 2
  done
  if [ "$RESTORED" -ne 1 ]; then
    echo "ERROR: restore did not bring the app back — production is DOWN, manual recovery required"
  fi
  sudo systemctl start aura-ai-async-jobs || true
}

# Stronger than /api/health alone: that endpoint only checks SELECT 1 + LLM slots,
# so a ChunkLoadError release still passes. Register + a real SSR page catch more.
candidate_accepts_traffic() {
  curl -fsS http://127.0.0.1:3000/api/health >/dev/null 2>&1 || return 1
  local register_code matrix_code
  register_code="$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/auth/user/register || printf '000')"
  [ "$register_code" = "200" ] || return 1
  matrix_code="$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/numerology/destiny-matrix || printf '000')"
  [ "$matrix_code" = "200" ] || return 1
  return 0
}

on_exit() {
  if [ "${DEPLOY_STATUS}" != "success" ]; then
    restore_previous_release
  fi
  log_deploy "${DEPLOY_STATUS}"
}

trap on_exit EXIT

if [ -f "$TARBALL" ]; then
  if [ -d "/opt/aura-ai/public/releases" ]; then
    RELEASES_BACKUP="$(mktemp -d)"
    cp -a /opt/aura-ai/public/releases/. "$RELEASES_BACKUP/"
  fi
  # Generated destiny-card / scene art must survive rsync --delete.
  if [ -d "/opt/aura-ai/public/scene-art" ]; then
    SCENE_ART_BACKUP="$(mktemp -d)"
    cp -a /opt/aura-ai/public/scene-art/. "$SCENE_ART_BACKUP/" 2>/dev/null || true
  fi
  STAGE="$(mktemp -d)"
  tar -xzf "$TARBALL" -C "$STAGE"
  echo ">>> Verifying staged GeoNames index before rsync..."
  verify_geonames_index "$STAGE/data/geonames/cities.min.json"
  if [ -e /opt/aura-ai/data/geonames/cities.min.json ]; then
    verify_geonames_index /opt/aura-ai/data/geonames/cities.min.json
  fi
  rsync -a --delete --ignore-times \
    --exclude='.env.local' \
    --exclude='.env.async-jobs' \
    --exclude='public/releases/' \
    --exclude='public/scene-art/' \
    --exclude='.next/' \
    --exclude='.next-candidate/' \
    --exclude='.next-previous/' \
    --exclude='node_modules/' \
    --exclude='node_modules-candidate/' \
    --exclude='node_modules-previous/' \
    --exclude='.build-staging/' \
    --exclude='logs/' \
    --exclude='backups/' \
    --exclude='telegram-bot/.env' \
    --exclude='telegram-bot/data/' \
    --exclude='telegram-bot/node_modules/' \
    --exclude='telegram-bot/backups/' \
    "$STAGE/" /opt/aura-ai/
  # Windows tar often packs modes as 666/777 — harden before the app starts.
  # Skip node_modules trees: a blanket 644 strips +x from .bin/tsx and esbuild,
  # and we no longer reinstall into the live tree before smoke tests.
  echo ">>> Hardening /opt/aura-ai file modes..."
  find /opt/aura-ai -type d \
    -not -path '/opt/aura-ai/node_modules*' \
    -not -path '/opt/aura-ai/telegram-bot/node_modules*' \
    -not -path '/opt/aura-ai/.build-staging*' \
    -exec chmod 755 {} +
  find /opt/aura-ai -type f \
    -not -path '/opt/aura-ai/node_modules*' \
    -not -path '/opt/aura-ai/telegram-bot/node_modules*' \
    -not -path '/opt/aura-ai/.build-staging*' \
    -exec chmod 644 {} +
  # Older deploys may already have stripped +x from the live tree; put it back so
  # smoke tests and any side tooling can still exec esbuild/tsx.
  for nm in /opt/aura-ai/node_modules /opt/aura-ai/node_modules-candidate /opt/aura-ai/telegram-bot/node_modules; do
    if [ -d "$nm" ]; then
      find "$nm" -type d -exec chmod 755 {} +
      find "$nm/.bin" -type f -exec chmod 755 {} + 2>/dev/null || true
      find "$nm" \( -name 'esbuild' -o -name '*.node' -o -name 'node-gyp' \) -type f -exec chmod 755 {} + 2>/dev/null || true
    fi
  done
  find /opt/aura-ai/proxmox-setup -type f -name '*.sh' -exec chmod 750 {} +
  find /opt/aura-ai/hosting -type f \( -name '*.sh' -o -name '*.ps1' \) -exec chmod 750 {} + 2>/dev/null || true
  echo ">>> Verifying installed GeoNames index after rsync..."
  verify_geonames_index /opt/aura-ai/data/geonames/cities.min.json
  echo ">>> Rsync complete ($(test -f /opt/aura-ai/deploy-sha.txt && tr -d '\r\n' < /opt/aura-ai/deploy-sha.txt || echo no-sha))"
  rm -rf "$STAGE"
  if [ -n "$RELEASES_BACKUP" ] && [ -d "$RELEASES_BACKUP" ]; then
    mkdir -p /opt/aura-ai/public/releases
    cp -a "$RELEASES_BACKUP/." /opt/aura-ai/public/releases/
    rm -rf "$RELEASES_BACKUP"
  fi
  if [ -n "$SCENE_ART_BACKUP" ] && [ -d "$SCENE_ART_BACKUP" ]; then
    mkdir -p /opt/aura-ai/public/scene-art
    cp -a "$SCENE_ART_BACKUP/." /opt/aura-ai/public/scene-art/
    rm -rf "$SCENE_ART_BACKUP"
  fi
  mkdir -p /opt/aura-ai/public/scene-art
  # Restored artifacts keep prior modes from backup — re-harden them.
  find /opt/aura-ai/public/releases -type d -exec chmod 755 {} + 2>/dev/null || true
  find /opt/aura-ai/public/releases -type f -exec chmod 644 {} + 2>/dev/null || true
  find /opt/aura-ai/public/scene-art -type d -exec chmod 755 {} + 2>/dev/null || true
  find /opt/aura-ai/public/scene-art -type f -exec chmod 644 {} + 2>/dev/null || true
  if id ubuntu >/dev/null 2>&1; then
    if [ "$(id -u)" -eq 0 ]; then
      chown -R ubuntu:ubuntu /opt/aura-ai
    else
      sudo chown -R ubuntu:ubuntu /opt/aura-ai
    fi
  fi

  # Runs last on purpose: the blanket chmod 644 and the legacy chown above would
  # otherwise undo both of these.
  # Secrets — every one of these is excluded from rsync, so it arrives as an existing
  # file and keeps whatever mode the blanket chmod gave it. systemd reads all three as
  # root before dropping to the aura-ai user, so 600 root:root is safe.
  for secret_file in \
    /opt/aura-ai/.env.local \
    /opt/aura-ai/.env.async-jobs \
    /opt/aura-ai/telegram-bot/.env; do
    if [ -f "$secret_file" ]; then
      chmod 600 "$secret_file"
    fi
  done
  # Database dumps are excluded from rsync but the blanket chmod still walks them,
  # which would leave a full copy of production readable by any local user.
  if [ -d /opt/aura-ai/backups ]; then
    find /opt/aura-ai/backups -type d -exec chmod 700 {} +
    find /opt/aura-ai/backups -type f -exec chmod 600 {} +
  fi
  # The bot runs as aura-ai and writes its SQLite (plus -wal/-shm) in place. Losing
  # that write access puts it in a restart loop on "attempt to write a readonly
  # database", so hand the data directory back.
  if [ -d /opt/aura-ai/telegram-bot/data ]; then
    chown -R aura-ai:aura-ai /opt/aura-ai/telegram-bot/data
    find /opt/aura-ai/telegram-bot/data -type d -exec chmod 750 {} +
    find /opt/aura-ai/telegram-bot/data -type f -exec chmod 640 {} +
  fi
fi

if [ -f /opt/aura-ai/deploy-sha.txt ]; then
  GIT_SHA="$(tr -d '\r\n' < /opt/aura-ai/deploy-sha.txt)"
fi

ENV_FILE="/opt/aura-ai/.env.local"
YUKASSA_SHOP_BACKUP=""
YUKASSA_SECRET_BACKUP=""

if [ -f "$ENV_FILE" ]; then
  YUKASSA_SHOP_BACKUP="$(grep '^YUKASSA_SHOP_ID=' "$ENV_FILE" | head -1 | cut -d= -f2- || true)"
  YUKASSA_SECRET_BACKUP="$(grep '^YUKASSA_SECRET_KEY=' "$ENV_FILE" | head -1 | cut -d= -f2- || true)"
fi

touch "$ENV_FILE"

grep -q '^NEXT_PUBLIC_APP_URL=' "$ENV_FILE" \
  && sed -i 's|^NEXT_PUBLIC_APP_URL=.*|NEXT_PUBLIC_APP_URL=https://zovus.ru|' "$ENV_FILE" \
  || echo 'NEXT_PUBLIC_APP_URL=https://zovus.ru' >> "$ENV_FILE"

grep -q '^COOKIE_SECURE=' "$ENV_FILE" \
  && sed -i 's|^COOKIE_SECURE=.*|COOKIE_SECURE=true|' "$ENV_FILE" \
  || echo 'COOKIE_SECURE=true' >> "$ENV_FILE"

_openrouter_key="$(grep '^OPENROUTER_API_KEY=' "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\r' || true)"
if [ -z "${_openrouter_key//[[:space:]]/}" ]; then
  if [ -n "${OPENROUTER_API_KEY:-}" ]; then
    sed -i '/^OPENROUTER_API_KEY=/d' "$ENV_FILE"
    printf 'OPENROUTER_API_KEY=%s\n' "$OPENROUTER_API_KEY" >> "$ENV_FILE"
  else
    echo "ERROR: OPENROUTER_API_KEY is missing; preserve it in .env.local or supply it in the deploy process environment" >&2
    exit 1
  fi
fi
unset _openrouter_key

grep -q '^OPENROUTER_MODEL=' "$ENV_FILE" \
  && sed -i 's|^OPENROUTER_MODEL=.*|OPENROUTER_MODEL=openai/gpt-4o-mini|' "$ENV_FILE" \
  || echo 'OPENROUTER_MODEL=openai/gpt-4o-mini' >> "$ENV_FILE"

grep -q '^OPENROUTER_HTTPS_PROXY=' "$ENV_FILE" \
  || echo 'OPENROUTER_HTTPS_PROXY=http://91.184.240.82:3128' >> "$ENV_FILE"

# Pin background fact extraction to a cheap model regardless of the
# admin-configured chat model (structured JSON task, no creative writing).
grep -q '^MEMORY_EXTRACT_MODEL=' "$ENV_FILE" \
  || echo 'MEMORY_EXTRACT_MODEL=openai/gpt-4o-mini' >> "$ENV_FILE"

grep -q '^RECAPTCHA_ENABLED=' "$ENV_FILE" \
  || echo 'RECAPTCHA_ENABLED=true' >> "$ENV_FILE"

grep -q '^NEXT_PUBLIC_RECAPTCHA_ENABLED=' "$ENV_FILE" \
  || echo 'NEXT_PUBLIC_RECAPTCHA_ENABLED=true' >> "$ENV_FILE"

# Do not overwrite production keys on every deploy — only seed when missing.
grep -q '^NEXT_PUBLIC_RECAPTCHA_SITE_KEY=' "$ENV_FILE" \
  || echo 'NEXT_PUBLIC_RECAPTCHA_SITE_KEY=' >> "$ENV_FILE"

grep -q '^RECAPTCHA_SECRET_KEY=' "$ENV_FILE" \
  || echo 'RECAPTCHA_SECRET_KEY=' >> "$ENV_FILE"

# OAuth (VK ID, Yandex, Mail.ru) — seed empty keys; never overwrite on deploy.
grep -q '^YANDEX_OAUTH_CLIENT_ID=' "$ENV_FILE" \
  || echo 'YANDEX_OAUTH_CLIENT_ID=' >> "$ENV_FILE"
grep -q '^YANDEX_OAUTH_CLIENT_SECRET=' "$ENV_FILE" \
  || echo 'YANDEX_OAUTH_CLIENT_SECRET=' >> "$ENV_FILE"
grep -q '^VK_CLIENT_ID=' "$ENV_FILE" \
  || echo 'VK_CLIENT_ID=' >> "$ENV_FILE"
grep -q '^VK_CLIENT_PROTECTED_KEY=' "$ENV_FILE" \
  || echo 'VK_CLIENT_PROTECTED_KEY=' >> "$ENV_FILE"
grep -q '^VK_SERVICE_TOKEN=' "$ENV_FILE" \
  || echo 'VK_SERVICE_TOKEN=' >> "$ENV_FILE"

grep -q '^LLM_CONCURRENCY_MAX=' "$ENV_FILE" \
  && sed -i 's|^LLM_CONCURRENCY_MAX=.*|LLM_CONCURRENCY_MAX=25|' "$ENV_FILE" \
  || echo 'LLM_CONCURRENCY_MAX=25' >> "$ENV_FILE"

grep -q '^LLM_QUEUE_TIMEOUT_MS=' "$ENV_FILE" \
  && sed -i 's|^LLM_QUEUE_TIMEOUT_MS=.*|LLM_QUEUE_TIMEOUT_MS=120000|' "$ENV_FILE" \
  || echo 'LLM_QUEUE_TIMEOUT_MS=120000' >> "$ENV_FILE"

grep -q '^TRUST_PROXY=' "$ENV_FILE" \
  && sed -i 's|^TRUST_PROXY=.*|TRUST_PROXY=true|' "$ENV_FILE" \
  || echo 'TRUST_PROXY=true' >> "$ENV_FILE"

grep -q '^DB_POOL_MAX=' "$ENV_FILE" \
  && sed -i 's|^DB_POOL_MAX=.*|DB_POOL_MAX=20|' "$ENV_FILE" \
  || echo 'DB_POOL_MAX=20' >> "$ENV_FILE"

# Stable secret shared with local cron wrappers. Ensure it exists here; rotation
# happens at activation so the still-running process and the file stay in sync
# through the long staging build.
if ! grep -q '^CRON_SECRET=' "$ENV_FILE" || [ -z "$(grep '^CRON_SECRET=' "$ENV_FILE" | cut -d= -f2- | tr -d '[:space:]')" ]; then
  if grep -q '^CRON_SECRET=' "$ENV_FILE"; then
    sed -i "s|^CRON_SECRET=.*|CRON_SECRET=$(openssl rand -hex 24)|" "$ENV_FILE"
  else
    echo "CRON_SECRET=$(openssl rand -hex 24)" >> "$ENV_FILE"
  fi
fi

# AUTH_SECRET — generate once if missing or still a dev placeholder (invalidates sessions on first fix).
_auth_current="$(grep '^AUTH_SECRET=' "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- || true)"
if [ -z "${_auth_current// /}" ] || [ "$_auth_current" = "change-me-to-random-32-char-secret-key" ] || printf '%s' "$_auth_current" | grep -q '^change-me'; then
  _new_auth="$(openssl rand -hex 32)"
  if grep -q '^AUTH_SECRET=' "$ENV_FILE"; then
    sed -i "s|^AUTH_SECRET=.*|AUTH_SECRET=${_new_auth}|" "$ENV_FILE"
  else
    echo "AUTH_SECRET=${_new_auth}" >> "$ENV_FILE"
  fi
  echo "Generated new AUTH_SECRET (existing sessions will need re-login)"
fi
unset _auth_current _new_auth

# Never overwrite real YooKassa keys with placeholders during deploy.
if [ -n "$YUKASSA_SHOP_BACKUP" ] && [ -n "$YUKASSA_SECRET_BACKUP" ] \
  && [ "$YUKASSA_SHOP_BACKUP" != "your-shop-id-here" ] \
  && ! printf '%s' "$YUKASSA_SHOP_BACKUP" | grep -q '^your-'; then
  grep -q '^YUKASSA_SHOP_ID=' "$ENV_FILE" \
    && sed -i "s|^YUKASSA_SHOP_ID=.*|YUKASSA_SHOP_ID=${YUKASSA_SHOP_BACKUP}|" "$ENV_FILE" \
    || echo "YUKASSA_SHOP_ID=${YUKASSA_SHOP_BACKUP}" >> "$ENV_FILE"
  grep -q '^YUKASSA_SECRET_KEY=' "$ENV_FILE" \
    && sed -i "s|^YUKASSA_SECRET_KEY=.*|YUKASSA_SECRET_KEY=${YUKASSA_SECRET_BACKUP}|" "$ENV_FILE" \
    || echo "YUKASSA_SECRET_KEY=${YUKASSA_SECRET_BACKUP}" >> "$ENV_FILE"
fi

cd /opt/aura-ai

echo ">>> Sync Android version (monotonic)..."
node /opt/aura-ai/scripts/sync-android-version-monotonic.mjs || echo "WARN: android version sync skipped"
echo ">>> Verify Android APK ↔ manifest integrity..."
if ! node /opt/aura-ai/scripts/verify-android-release.mjs; then
  echo "WARN: Android release integrity failed — repairing sidecar from APK on disk"
  node /opt/aura-ai/scripts/verify-android-release.mjs --repair || echo "WARN: android release repair skipped"
fi

# rsync --delete above removes stale files; keep only legacy one-offs if needed.
rm -f \
  src/components/NumerologToolHub.tsx \
  src/components/numerolog/NumerologToolResultModal.tsx \
  src/app/api/photo-reading/route.ts

# Install + test + build in a side tree so the live `next start` keeps serving on
# its current node_modules + .next. Stopping for the whole npm ci/build window was
# the multi-minute 502 outage; activation below is the only intentional downtime.
BUILD_STAGING="/opt/aura-ai/.build-staging"
echo ">>> Candidate install/test/build (live app stays up)..."
rm -rf "$BUILD_STAGING"
mkdir -p "$BUILD_STAGING"
rsync -a \
  --exclude='node_modules/' \
  --exclude='node_modules-candidate/' \
  --exclude='node_modules-previous/' \
  --exclude='.next/' \
  --exclude='.next-candidate/' \
  --exclude='.next-previous/' \
  --exclude='.build-staging/' \
  --exclude='logs/' \
  --exclude='backups/' \
  --exclude='telegram-bot/data/' \
  --exclude='telegram-bot/node_modules/' \
  --exclude='.env.local' \
  --exclude='.env.async-jobs' \
  /opt/aura-ai/ "$BUILD_STAGING/"
# NEXT_PUBLIC_* must be present during `next build` (inlined into client bundle).
ln -sfn /opt/aura-ai/.env.local "$BUILD_STAGING/.env.local"
echo ">>> Verifying packaged GeoNames index..."
verify_geonames_index /opt/aura-ai/data/geonames/cities.min.json
set -a
# shellcheck disable=SC1090
source <(grep -E '^(NEXT_PUBLIC_RECAPTCHA_SITE_KEY|NEXT_PUBLIC_RECAPTCHA_ENABLED|NEXT_PUBLIC_APP_URL)=' "$ENV_FILE" | sed 's/\r$//')
set +a
(
  cd "$BUILD_STAGING"
  npm ci --legacy-peer-deps
  echo ">>> Candidate tests..."
  npm test
  # Build beside the active release exactly once. The running process must keep its
  # current .next until every gate passes; replacing it in-place causes
  # ChunkLoadError/blank pages when a later smoke test aborts the deploy.
  rm -rf .next-candidate
  NEXT_DIST_DIR=.next-candidate npm run build
)
# Move artifacts next to the live tree without touching the running release.
rm -rf /opt/aura-ai/.next-candidate /opt/aura-ai/node_modules-candidate
mv "$BUILD_STAGING/.next-candidate" /opt/aura-ai/.next-candidate
mv "$BUILD_STAGING/node_modules" /opt/aura-ai/node_modules-candidate
rm -rf "$BUILD_STAGING"
# Stale generated types under the live .next can break a future in-tree type-check;
# they are not needed at runtime and are regenerated by every candidate build.
rm -rf /opt/aura-ai/.next/types

echo ">>> Launch env check..."
set -a
# shellcheck disable=SC1090
source <(grep -E '^(DATABASE_URL|AUTH_SECRET|OPENROUTER_API_KEY|NEXT_PUBLIC_APP_URL|YUKASSA_SHOP_ID|YUKASSA_SECRET_KEY|RECAPTCHA_SECRET_KEY|RECAPTCHA_ENABLED|CRON_SECRET)=' "$ENV_FILE" | sed 's/\r$//')
set +a
node /opt/aura-ai/scripts/verify-launch-env.mjs

echo ">>> DB migrations (schema_migrations)..."
if [ "${SKIP_MIGRATIONS:-0}" = "1" ]; then
  echo "[skip] SKIP_MIGRATIONS=1 — migrations not run"
else
  if ! grep -q '^DATABASE_URL=' "$ENV_FILE" 2>/dev/null; then
    echo 'DATABASE_URL=postgresql://auraai:auraai_secret@localhost:5432/auraai' >> "$ENV_FILE"
  fi
  set -a
  # shellcheck disable=SC1090
  source <(grep -E '^(DATABASE_URL|OPENROUTER_API_KEY|OPENROUTER_HTTPS_PROXY|MEMORY_EMBED_MODEL)=' "$ENV_FILE" | sed 's/\r$//')
  set +a
  # Every later gate rolls .next back, but nothing rolls a migration back, and only two
  # migrations ship a .down.sql. Take a dump first so a bad schema change is recoverable.
  # Failing here is safe: no schema has changed yet, and the exit trap restores the app.
  if [ -x /opt/aura-ai/proxmox-setup/cron-pg-backup.sh ] || [ -f /opt/aura-ai/proxmox-setup/cron-pg-backup.sh ]; then
    echo ">>> Pre-migrate database dump..."
    if ! bash /opt/aura-ai/proxmox-setup/cron-pg-backup.sh; then
      echo "ERROR: pre-migrate dump failed — refusing to migrate without a recovery point"
      DEPLOY_STATUS="pre_migrate_backup_failed"
      exit 1
    fi
  else
    echo "WARN: cron-pg-backup.sh missing — migrating without a fresh recovery point"
  fi
  node /opt/aura-ai/scripts/migrate.mjs
fi
echo ">>> Natal migration/schema gate..."
node /opt/aura-ai/scripts/verify-natal-deploy-schema.mjs

echo ">>> Memory smoke test..."
# Re-export OPENROUTER_HTTPS_PROXY for the smoke test — embed code falls back to
# a flaky direct connection without it (server IPv6/TLS to openrouter.ai is unreliable).
set -a
# shellcheck disable=SC1090
source <(grep -E '^(DATABASE_URL|OPENROUTER_API_KEY|OPENROUTER_HTTPS_PROXY|MEMORY_EMBED_MODEL)=' "$ENV_FILE" | sed 's/\r$//')
set +a
# Prefer the candidate tree: it is what we are about to activate. Invoke via
# node on the cli entry (not the .bin shim) so a missing +x bit cannot fail us.
_SMOKE_TSX="/opt/aura-ai/node_modules-candidate/tsx/dist/cli.mjs"
if [ ! -f "$_SMOKE_TSX" ]; then
  _SMOKE_TSX="/opt/aura-ai/node_modules/tsx/dist/cli.mjs"
fi
if ! node "$_SMOKE_TSX" /opt/aura-ai/scripts/memory-smoke-test.ts; then
  if [ "${STRICT_MEMORY_SMOKE:-1}" = "1" ]; then
    echo "ERROR: memory smoke failed in strict mode; active build was not touched"
    DEPLOY_STATUS="memory_smoke_failed"
    exit 1
  fi
  echo "WARN: memory smoke failed; candidate may activate, availability health check still gates it"
fi
unset _SMOKE_TSX

echo ">>> Seed admin..."
read_env_var() {
  grep -E "^$1=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | sed 's/\r$//'
}
export DATABASE_URL="$(read_env_var DATABASE_URL)"
export ADMIN_SEED_EMAIL="$(read_env_var ADMIN_SEED_EMAIL)"
export ADMIN_SEED_PASSWORD="$(read_env_var ADMIN_SEED_PASSWORD)"
export ADMIN_SEED_NAME="$(read_env_var ADMIN_SEED_NAME)"
export DATABASE_URL="${DATABASE_URL:-postgresql://auraai:auraai_secret@localhost:5432/auraai}"
export ADMIN_SEED_EMAIL="${ADMIN_SEED_EMAIL:-}"
export ADMIN_SEED_PASSWORD="${ADMIN_SEED_PASSWORD:-}"
export ADMIN_SEED_NAME="${ADMIN_SEED_NAME:-Admin}"
if [ -z "${ADMIN_SEED_PASSWORD// /}" ]; then
  echo "WARN: ADMIN_SEED_PASSWORD is empty — skip admin seed"
else
  node /opt/aura-ai/scripts/seed-admin.mjs || true
fi
unset -f read_env_var

echo ">>> Activating candidate build (brief downtime)..."
# Rotate while the process is about to die: Caddy previously logged the old value
# whenever memory-extract hit the public host during a 502. Crons re-read .env.local.
_new_cron="$(openssl rand -hex 24)"
if grep -q '^CRON_SECRET=' "$ENV_FILE"; then
  sed -i "s|^CRON_SECRET=.*|CRON_SECRET=${_new_cron}|" "$ENV_FILE"
else
  echo "CRON_SECRET=${_new_cron}" >> "$ENV_FILE"
fi
unset _new_cron
echo "Rotated CRON_SECRET for this deploy"
# Only now stop the live process — install/test/build already finished beside it.
sudo systemctl stop aura-ai-async-jobs || true
sudo systemctl stop aura-ai || true
pkill -f 'next-server|next start' 2>/dev/null || true

rm -rf .next-previous node_modules-previous
if [ -d .next ]; then
  mv .next .next-previous
fi
mv .next-candidate .next
if [ -d node_modules ]; then
  mv node_modules node_modules-previous
fi
mv node_modules-candidate node_modules

if ! sudo systemctl start aura-ai; then
  echo "ERROR: service start failed — restoring previous build"
  rm -rf .next
  [ -d .next-previous ] && mv .next-previous .next
  rm -rf node_modules
  [ -d node_modules-previous ] && mv node_modules-previous node_modules
  sudo systemctl start aura-ai
  DEPLOY_STATUS="service_restart_failed"
  exit 1
fi

HEALTHY=0
# Longer window: Next cold-start after .next swap often exceeds 20s under load.
for _ in $(seq 1 45); do
  if candidate_accepts_traffic; then
    HEALTHY=1
    break
  fi
  sleep 1
done

if [ "$HEALTHY" -ne 1 ]; then
  echo "ERROR: candidate failed traffic gate — rolling back"
  sudo systemctl stop aura-ai || true
  rm -rf .next
  [ -d .next-previous ] && mv .next-previous .next
  rm -rf node_modules
  [ -d node_modules-previous ] && mv node_modules-previous node_modules
  sudo systemctl start aura-ai
  DEPLOY_STATUS="health_check_failed"
  exit 1
fi

systemctl is-active aura-ai
curl -sS -o /dev/null -w "register_page=%{http_code}\n" http://127.0.0.1:3000/auth/user/register
curl -sS -o /dev/null -w "matrix_page=%{http_code}\n" http://127.0.0.1:3000/numerology/destiny-matrix

echo ">>> Activating natal async worker..."
# App candidate is already live — worker/cron failures must not roll back .next
# or abort the deploy (historically gpasswd/env sync exited 1 after activation).
set +e
sed -i 's/\r$//' hosting/ensure-async-jobs-user.sh hosting/sync-async-jobs-env.sh hosting/aura-ai.service hosting/aura-ai-async-jobs.service 2>/dev/null || true
sudo bash hosting/ensure-async-jobs-user.sh /opt/aura-ai
_WORKER_ENSURE=$?
_PREV_UNIT_HASH="$(sha256sum /etc/systemd/system/aura-ai.service 2>/dev/null | awk '{print $1}')"
sudo install -D -m 0644 hosting/aura-ai.service /etc/systemd/system/aura-ai.service
sudo install -D -m 0644 hosting/aura-ai-async-jobs.service /etc/systemd/system/aura-ai-async-jobs.service
sudo mkdir -p /var/log/aura-ai
sudo chown aura-ai:aura-ai /var/log/aura-ai
sudo systemctl daemon-reload
_NEW_UNIT_HASH="$(sha256sum /etc/systemd/system/aura-ai.service 2>/dev/null | awk '{print $1}')"
# Skip second app restart when unit file unchanged — halves deploy 502 window for crawlers.
if [ -n "$_PREV_UNIT_HASH" ] && [ "$_PREV_UNIT_HASH" = "$_NEW_UNIT_HASH" ] \
  && curl -fsS http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
  echo "App already healthy; unit unchanged — skip second aura-ai restart"
else
  sudo systemctl restart aura-ai
  for _ in $(seq 1 45); do
    if curl -fsS http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
fi
curl -fsS http://127.0.0.1:3000/api/health >/dev/null
sudo systemctl enable aura-ai-async-jobs
sudo systemctl restart aura-ai-async-jobs
systemctl is-active aura-ai aura-ai-async-jobs
if [ "${_WORKER_ENSURE}" -ne 0 ]; then
  echo "WARN: ensure-async-jobs-user exited ${_WORKER_ENSURE} — app remains active"
fi
unset _WORKER_ENSURE _PREV_UNIT_HASH _NEW_UNIT_HASH
set -e

echo ">>> Installing background crons (memory maintenance + proactive reminders)..."
# Normalize line endings: these scripts may carry CRLF from a Windows checkout,
# which breaks `set -euo pipefail` and other lines under bash.
sed -i 's/\r$//' \
  /opt/aura-ai/proxmox-setup/install-crons.sh \
  /opt/aura-ai/proxmox-setup/cron-proactive-reminders.sh \
  /opt/aura-ai/proxmox-setup/cron-memory-maintenance.sh \
  /opt/aura-ai/proxmox-setup/cron-memory-extract.sh \
  /opt/aura-ai/proxmox-setup/cron-daily-reading-remind.sh \
  /opt/aura-ai/proxmox-setup/cron-reconcile-rune-payments.sh \
  /opt/aura-ai/proxmox-setup/cron-pg-backup.sh \
  /opt/aura-ai/proxmox-setup/cron-cleanup-empty-sessions.sh \
  /opt/aura-ai/proxmox-setup/cron-joint-reading-sweep.sh \
  /opt/aura-ai/proxmox-setup/cron-guest-resume-expire.sh \
  /opt/aura-ai/proxmox-setup/cron-natal-transits.sh \
  /opt/aura-ai/proxmox-setup/cron-reengagement-emails.sh 2>/dev/null || true
bash /opt/aura-ai/proxmox-setup/install-crons.sh
if ! crontab -l 2>/dev/null | grep -Fq "/opt/aura-ai/proxmox-setup/cron-natal-transits.sh"; then
  echo "ERROR: natal transit cron was not installed — rolling back"
  sudo systemctl stop aura-ai || true
  rm -rf .next
  [ -d .next-previous ] && mv .next-previous .next
  rm -rf node_modules
  [ -d node_modules-previous ] && mv node_modules-previous node_modules
  sudo systemctl start aura-ai
  DEPLOY_STATUS="natal_cron_install_failed"
  exit 1
fi
echo "natal_cron_installed=1"

echo ">>> Authenticated natal cron smoke test..."
_CRON_SECRET="$(grep '^CRON_SECRET=' "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\r' | tr -d '[:space:]')"
if [ -z "$_CRON_SECRET" ]; then
  echo "ERROR: CRON_SECRET missing after deploy — rolling back"
  sudo systemctl stop aura-ai || true
  rm -rf .next
  [ -d .next-previous ] && mv .next-previous .next
  rm -rf node_modules
  [ -d node_modules-previous ] && mv node_modules-previous node_modules
  sudo systemctl start aura-ai
  DEPLOY_STATUS="natal_cron_secret_missing"
  exit 1
else
  _CRON_BODY="$(mktemp)"
  _CRON_STATUS="$(curl -sS -m 120 -o "$_CRON_BODY" -w '%{http_code}' \
    -H "x-cron-secret: $_CRON_SECRET" \
    "http://127.0.0.1:3000/api/cron/natal-transits" || printf '000')"
  if ! printf '%s' "$_CRON_STATUS" | grep -qE '^2[0-9][0-9]$'; then
    echo "ERROR: natal cron endpoint failed authentication/health (HTTP $_CRON_STATUS) — rolling back"
    rm -f "$_CRON_BODY"
    sudo systemctl stop aura-ai || true
    rm -rf .next
    [ -d .next-previous ] && mv .next-previous .next
    rm -rf node_modules
    [ -d node_modules-previous ] && mv node_modules-previous node_modules
    sudo systemctl start aura-ai
    DEPLOY_STATUS="natal_cron_probe_failed"
    exit 1
  fi
  if grep -q '"skipped"[[:space:]]*:[[:space:]]*true' "$_CRON_BODY"; then
    echo "natal_cron_endpoint=skipped_feature"
  else
    echo "natal_cron_endpoint=ok"
  fi
  rm -f "$_CRON_BODY"
fi
unset _CRON_SECRET _CRON_BODY _CRON_STATUS

rm -rf .next-previous node_modules-previous
DEPLOY_STATUS="success"
if [ -f /opt/aura-ai/hosting/Caddyfile ]; then
  echo ">>> Sync Caddyfile..."
  sudo cp /opt/aura-ai/hosting/Caddyfile /etc/caddy/Caddyfile
  sudo systemctl reload caddy || sudo systemctl restart caddy
fi

echo "Deploy complete: https://zovus.ru"
