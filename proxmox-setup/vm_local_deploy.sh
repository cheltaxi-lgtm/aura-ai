#!/bin/bash
# Запускать на VM 192.168.1.152 после загрузки /tmp/aura-ai-deploy.tgz
set -euo pipefail

TARBALL="${1:-/tmp/aura-ai-deploy.tgz}"
RELEASES_BACKUP=""
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

trap 'log_deploy "${DEPLOY_STATUS}"' EXIT

if [ -f "$TARBALL" ]; then
  if [ -d "/opt/aura-ai/public/releases" ]; then
    RELEASES_BACKUP="$(mktemp -d)"
    cp -a /opt/aura-ai/public/releases/. "$RELEASES_BACKUP/"
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
    --exclude='public/releases/' \
    --exclude='.next/' \
    --exclude='.next-candidate/' \
    --exclude='.next-previous/' \
    --exclude='node_modules/' \
    --exclude='logs/' \
    "$STAGE/" /opt/aura-ai/
  echo ">>> Verifying installed GeoNames index after rsync..."
  verify_geonames_index /opt/aura-ai/data/geonames/cities.min.json
  echo ">>> Rsync complete ($(test -f /opt/aura-ai/deploy-sha.txt && tr -d '\r\n' < /opt/aura-ai/deploy-sha.txt || echo no-sha))"
  rm -rf "$STAGE"
  if [ -n "$RELEASES_BACKUP" ] && [ -d "$RELEASES_BACKUP" ]; then
    mkdir -p /opt/aura-ai/public/releases
    cp -a "$RELEASES_BACKUP/." /opt/aura-ai/public/releases/
    rm -rf "$RELEASES_BACKUP"
  fi
  if id ubuntu >/dev/null 2>&1; then
    if [ "$(id -u)" -eq 0 ]; then
      chown -R ubuntu:ubuntu /opt/aura-ai
    else
      sudo chown -R ubuntu:ubuntu /opt/aura-ai
    fi
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
  || echo 'OPENROUTER_HTTPS_PROXY=http://45.156.20.127:3128' >> "$ENV_FILE"

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

# Stable secret shared with proactive-reminder crons. Generated once, preserved
# across deploys (never overwrite an existing value).
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

# rsync --delete above removes stale files; keep only legacy one-offs if needed.
rm -f \
  src/components/NumerologToolHub.tsx \
  src/components/numerolog/NumerologToolResultModal.tsx \
  src/app/api/photo-reading/route.ts

npm ci --legacy-peer-deps
echo ">>> Verifying packaged GeoNames index..."
verify_geonames_index /opt/aura-ai/data/geonames/cities.min.json
set -a
# NEXT_PUBLIC_* must be present during `next build` (inlined into client bundle).
# shellcheck disable=SC1090
source <(grep -E '^(NEXT_PUBLIC_RECAPTCHA_SITE_KEY|NEXT_PUBLIC_RECAPTCHA_ENABLED|NEXT_PUBLIC_APP_URL)=' "$ENV_FILE" | sed 's/\r$//')
set +a
# Run the complete test suite before building or touching the active release.
# A failure leaves the currently running .next directory untouched.
echo ">>> Candidate tests..."
npm test

# Build beside the active release exactly once. The running process must keep its current
# .next directory until every gate passes; replacing it in-place causes
# ChunkLoadError/blank pages when a later smoke test aborts the deploy.
rm -rf .next-candidate
NEXT_DIST_DIR=.next-candidate npm run build

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
if ! npx tsx /opt/aura-ai/scripts/memory-smoke-test.ts; then
  if [ "${STRICT_MEMORY_SMOKE:-1}" = "1" ]; then
    echo "ERROR: memory smoke failed in strict mode; active build was not touched"
    DEPLOY_STATUS="memory_smoke_failed"
    exit 1
  fi
  echo "WARN: memory smoke failed; candidate may activate, availability health check still gates it"
fi

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

echo ">>> Activating candidate build..."
rm -rf .next-previous
if [ -d .next ]; then
  mv .next .next-previous
fi
mv .next-candidate .next

if ! sudo systemctl restart aura-ai; then
  echo "ERROR: service restart failed — restoring previous build"
  rm -rf .next
  [ -d .next-previous ] && mv .next-previous .next
  sudo systemctl restart aura-ai
  DEPLOY_STATUS="service_restart_failed"
  exit 1
fi

HEALTHY=0
for _ in $(seq 1 20); do
  if curl -fsS http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
    HEALTHY=1
    break
  fi
  sleep 1
done

if [ "$HEALTHY" -ne 1 ]; then
  echo "ERROR: candidate failed health check — rolling back"
  sudo systemctl stop aura-ai || true
  rm -rf .next
  [ -d .next-previous ] && mv .next-previous .next
  sudo systemctl start aura-ai
  DEPLOY_STATUS="health_check_failed"
  exit 1
fi

systemctl is-active aura-ai
curl -sS -o /dev/null -w "register_page=%{http_code}\n" http://127.0.0.1:3000/auth/user/register

echo ">>> Activating natal async worker..."
sed -i 's/\r$//' hosting/ensure-async-jobs-user.sh hosting/sync-async-jobs-env.sh 2>/dev/null || true
sudo bash hosting/ensure-async-jobs-user.sh /opt/aura-ai
sudo install -D -m 0644 hosting/aura-ai-async-jobs.service /etc/systemd/system/aura-ai-async-jobs.service
sudo mkdir -p /var/log/aura-ai
sudo chown aura-ai:aura-ai /var/log/aura-ai
sudo systemctl daemon-reload
sudo systemctl enable aura-ai-async-jobs
sudo systemctl restart aura-ai-async-jobs
systemctl is-active aura-ai-async-jobs

echo ">>> Installing background crons (memory maintenance + proactive reminders)..."
# Normalize line endings: these scripts may carry CRLF from a Windows checkout,
# which breaks `set -euo pipefail` and other lines under bash.
sed -i 's/\r$//' \
  /opt/aura-ai/proxmox-setup/install-crons.sh \
  /opt/aura-ai/proxmox-setup/cron-proactive-reminders.sh \
  /opt/aura-ai/proxmox-setup/cron-memory-maintenance.sh \
  /opt/aura-ai/proxmox-setup/cron-daily-reading-remind.sh \
  /opt/aura-ai/proxmox-setup/cron-reconcile-rune-payments.sh \
  /opt/aura-ai/proxmox-setup/cron-pg-backup.sh \
  /opt/aura-ai/proxmox-setup/cron-cleanup-empty-sessions.sh \
  /opt/aura-ai/proxmox-setup/cron-joint-reading-sweep.sh \
  /opt/aura-ai/proxmox-setup/cron-natal-transits.sh \
  /opt/aura-ai/proxmox-setup/cron-reengagement-emails.sh 2>/dev/null || true
bash /opt/aura-ai/proxmox-setup/install-crons.sh
if ! crontab -l 2>/dev/null | grep -Fq "/opt/aura-ai/proxmox-setup/cron-natal-transits.sh"; then
  echo "ERROR: natal transit cron was not installed — rolling back"
  sudo systemctl stop aura-ai || true
  rm -rf .next
  [ -d .next-previous ] && mv .next-previous .next
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

rm -rf .next-previous
DEPLOY_STATUS="success"
echo "Deploy complete: https://zovus.ru"
