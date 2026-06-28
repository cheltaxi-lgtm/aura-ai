#!/bin/bash
# Запускать на VM 192.168.1.152 после загрузки /tmp/aura-ai-deploy.tgz
set -euo pipefail

TARBALL="${1:-/tmp/aura-ai-deploy.tgz}"

if [ "${SKIP_EXTRACT:-0}" != "1" ]; then
  sudo tar -xzf "$TARBALL" -C /opt/aura-ai
  sudo chown -R ubuntu:ubuntu /opt/aura-ai
fi

ENV_FILE="/opt/aura-ai/.env.local"
ENV_BACKUP="/tmp/aura-ai-env.local.bak"
YUKASSA_SHOP_BACKUP=""
YUKASSA_SECRET_BACKUP=""

if [ -f "$ENV_FILE" ]; then
  cp "$ENV_FILE" "$ENV_BACKUP"
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

grep -q '^OPENROUTER_API_KEY=' "$ENV_FILE" \
  && sed -i 's|^OPENROUTER_API_KEY=.*|OPENROUTER_API_KEY='"'"'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'"'"'|' "$ENV_FILE" \
  || echo 'OPENROUTER_API_KEY=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' >> "$ENV_FILE"

grep -q '^OPENROUTER_MODEL=' "$ENV_FILE" \
  && sed -i 's|^OPENROUTER_MODEL=.*|OPENROUTER_MODEL=openai/gpt-4o-mini|' "$ENV_FILE" \
  || echo 'OPENROUTER_MODEL=openai/gpt-4o-mini' >> "$ENV_FILE"

grep -q '^RECAPTCHA_ENABLED=' "$ENV_FILE" \
  && sed -i 's|^RECAPTCHA_ENABLED=.*|RECAPTCHA_ENABLED=true|' "$ENV_FILE" \
  || echo 'RECAPTCHA_ENABLED=true' >> "$ENV_FILE"

grep -q '^NEXT_PUBLIC_RECAPTCHA_ENABLED=' "$ENV_FILE" \
  && sed -i 's|^NEXT_PUBLIC_RECAPTCHA_ENABLED=.*|NEXT_PUBLIC_RECAPTCHA_ENABLED=true|' "$ENV_FILE" \
  || echo 'NEXT_PUBLIC_RECAPTCHA_ENABLED=true' >> "$ENV_FILE"

grep -q '^NEXT_PUBLIC_RECAPTCHA_SITE_KEY=' "$ENV_FILE" \
  && sed -i 's|^NEXT_PUBLIC_RECAPTCHA_SITE_KEY=.*|NEXT_PUBLIC_RECAPTCHA_SITE_KEY=6Lf39RQtAAAAAD5KIIHcgqar5rq91CTegKkZVSVn|' "$ENV_FILE" \
  || echo 'NEXT_PUBLIC_RECAPTCHA_SITE_KEY=6Lf39RQtAAAAAD5KIIHcgqar5rq91CTegKkZVSVn' >> "$ENV_FILE"

grep -q '^RECAPTCHA_SECRET_KEY=' "$ENV_FILE" \
  && sed -i 's|^RECAPTCHA_SECRET_KEY=.*|RECAPTCHA_SECRET_KEY=6Lf39RQtAAAAAJLY5jVvvWZvFi95K-F0kQBePoKw|' "$ENV_FILE" \
  || echo 'RECAPTCHA_SECRET_KEY=6Lf39RQtAAAAAJLY5jVvvWZvFi95K-F0kQBePoKw' >> "$ENV_FILE"

grep -q '^LLM_CONCURRENCY_MAX=' "$ENV_FILE" \
  && sed -i 's|^LLM_CONCURRENCY_MAX=.*|LLM_CONCURRENCY_MAX=25|' "$ENV_FILE" \
  || echo 'LLM_CONCURRENCY_MAX=25' >> "$ENV_FILE"

grep -q '^LLM_QUEUE_TIMEOUT_MS=' "$ENV_FILE" \
  && sed -i 's|^LLM_QUEUE_TIMEOUT_MS=.*|LLM_QUEUE_TIMEOUT_MS=120000|' "$ENV_FILE" \
  || echo 'LLM_QUEUE_TIMEOUT_MS=120000' >> "$ENV_FILE"

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
npm ci --legacy-peer-deps
npm run build

echo ">>> Launch env check..."
set -a
# shellcheck disable=SC1090
source <(grep -E '^(DATABASE_URL|AUTH_SECRET|OPENROUTER_API_KEY|NEXT_PUBLIC_APP_URL|YUKASSA_SHOP_ID|YUKASSA_SECRET_KEY|RECAPTCHA_SECRET_KEY|RECAPTCHA_ENABLED)=' "$ENV_FILE" | sed 's/\r$//')
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
  source <(grep -E '^(DATABASE_URL|OPENROUTER_API_KEY|MEMORY_EMBED_MODEL)=' "$ENV_FILE" | sed 's/\r$//')
  set +a
  node /opt/aura-ai/scripts/migrate.mjs
fi

echo ">>> Memory smoke test (gates deploy on retrieval regressions)..."
npx tsx /opt/aura-ai/scripts/memory-smoke-test.ts

echo ">>> Seed admin..."
export DATABASE_URL="${DATABASE_URL:-postgresql://auraai:auraai_secret@localhost:5432/auraai}"
export ADMIN_SEED_EMAIL="${ADMIN_SEED_EMAIL:-cheldriver@yandex.ru}"
export ADMIN_SEED_PASSWORD='gzOyv9Co*74_74'
export ADMIN_SEED_NAME="${ADMIN_SEED_NAME:-Admin}"
node /opt/aura-ai/scripts/seed-admin.mjs || true

sudo systemctl restart aura-ai
sleep 3
systemctl is-active aura-ai
curl -sS -o /dev/null -w "register_page=%{http_code}\n" http://127.0.0.1:3000/auth/user/register

echo ">>> Installing background crons (memory maintenance + proactive reminders)..."
# Normalize line endings: these scripts may carry CRLF from a Windows checkout,
# which breaks `set -euo pipefail` and other lines under bash.
sed -i 's/\r$//' \
  /opt/aura-ai/proxmox-setup/install-crons.sh \
  /opt/aura-ai/proxmox-setup/cron-proactive-reminders.sh \
  /opt/aura-ai/proxmox-setup/cron-memory-maintenance.sh 2>/dev/null || true
bash /opt/aura-ai/proxmox-setup/install-crons.sh || echo "WARN: cron install failed (non-fatal)"

echo "Deploy complete: https://zovus.ru"
