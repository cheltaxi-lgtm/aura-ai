#!/bin/bash
# Запускать на VM 192.168.1.152 после загрузки /tmp/aura-ai-deploy.tgz
set -euo pipefail

TARBALL="${1:-/tmp/aura-ai-deploy.tgz}"

if [ "${SKIP_EXTRACT:-0}" != "1" ]; then
  sudo tar -xzf "$TARBALL" -C /opt/aura-ai
  sudo chown -R ubuntu:ubuntu /opt/aura-ai
fi

ENV_FILE="/opt/aura-ai/.env.local"
touch "$ENV_FILE"

grep -q '^NEXT_PUBLIC_APP_URL=' "$ENV_FILE" \
  && sed -i 's|^NEXT_PUBLIC_APP_URL=.*|NEXT_PUBLIC_APP_URL=http://192.168.1.152:3000|' "$ENV_FILE" \
  || echo 'NEXT_PUBLIC_APP_URL=http://192.168.1.152:3000' >> "$ENV_FILE"

grep -q '^COOKIE_SECURE=' "$ENV_FILE" \
  && sed -i 's|^COOKIE_SECURE=.*|COOKIE_SECURE=false|' "$ENV_FILE" \
  || echo 'COOKIE_SECURE=false' >> "$ENV_FILE"

grep -q '^OPENROUTER_API_KEY=' "$ENV_FILE" \
  && sed -i 's|^OPENROUTER_API_KEY=.*|OPENROUTER_API_KEY='"'"'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'"'"'|' "$ENV_FILE" \
  || echo 'OPENROUTER_API_KEY=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' >> "$ENV_FILE"

grep -q '^OPENROUTER_MODEL=' "$ENV_FILE" \
  && sed -i 's|^OPENROUTER_MODEL=.*|OPENROUTER_MODEL=openai/gpt-4o-mini|' "$ENV_FILE" \
  || echo 'OPENROUTER_MODEL=openai/gpt-4o-mini' >> "$ENV_FILE"

grep -q '^RECAPTCHA_ENABLED=' "$ENV_FILE" \
  && sed -i 's|^RECAPTCHA_ENABLED=.*|RECAPTCHA_ENABLED=false|' "$ENV_FILE" \
  || echo 'RECAPTCHA_ENABLED=false' >> "$ENV_FILE"

grep -q '^NEXT_PUBLIC_RECAPTCHA_ENABLED=' "$ENV_FILE" \
  && sed -i 's|^NEXT_PUBLIC_RECAPTCHA_ENABLED=.*|NEXT_PUBLIC_RECAPTCHA_ENABLED=false|' "$ENV_FILE" \
  || echo 'NEXT_PUBLIC_RECAPTCHA_ENABLED=false' >> "$ENV_FILE"

grep -q '^NEXT_PUBLIC_RECAPTCHA_SITE_KEY=' "$ENV_FILE" \
  && sed -i 's|^NEXT_PUBLIC_RECAPTCHA_SITE_KEY=.*|NEXT_PUBLIC_RECAPTCHA_SITE_KEY=6Lf39RQtAAAAAD5KIIHcgqar5rq91CTegKkZVSVn|' "$ENV_FILE" \
  || echo 'NEXT_PUBLIC_RECAPTCHA_SITE_KEY=6Lf39RQtAAAAAD5KIIHcgqar5rq91CTegKkZVSVn' >> "$ENV_FILE"

grep -q '^RECAPTCHA_SECRET_KEY=' "$ENV_FILE" \
  && sed -i 's|^RECAPTCHA_SECRET_KEY=.*|RECAPTCHA_SECRET_KEY=6Lf39RQtAAAAAJLY5jVvvWZvFi95K-F0kQBePoKw|' "$ENV_FILE" \
  || echo 'RECAPTCHA_SECRET_KEY=6Lf39RQtAAAAAJLY5jVvvWZvFi95K-F0kQBePoKw' >> "$ENV_FILE"

cd /opt/aura-ai
npm install
npm run build

echo ">>> DB migrate admin..."
docker exec -i auraai-postgres psql -U auraai -d auraai < /opt/aura-ai/scripts/migrate-admin.sql 2>/dev/null || true

echo ">>> DB migrate schema..."
docker exec -i auraai-postgres psql -U auraai -d auraai < /opt/aura-ai/scripts/migrate-schema.sql 2>/dev/null || true

echo ">>> DB migrate profile fields..."
docker exec -i auraai-postgres psql -U auraai -d auraai < /opt/aura-ai/scripts/migrate-profile-fields.sql 2>/dev/null || true

echo ">>> DB migrate unlimited users..."
docker exec -i auraai-postgres psql -U auraai -d auraai < /opt/aura-ai/scripts/migrate-unlimited-users.sql 2>/dev/null || true

echo ">>> DB migrate TTS settings..."
docker exec -i auraai-postgres psql -U auraai -d auraai < /opt/aura-ai/scripts/migrate-tts-settings.sql 2>/dev/null || true

echo ">>> DB migrate TTS enabled flag..."
docker exec -i auraai-postgres psql -U auraai -d auraai < /opt/aura-ai/scripts/migrate-tts-enabled.sql 2>/dev/null || true

echo ">>> DB migrate visual settings..."
docker exec -i auraai-postgres psql -U auraai -d auraai < /opt/aura-ai/scripts/migrate-visual-settings.sql 2>/dev/null || true

echo ">>> DB migrate runes..."
docker exec -i auraai-postgres psql -U auraai -d auraai < /opt/aura-ai/scripts/migrate-runes.sql 2>/dev/null || true

echo ">>> DB migrate runes settings..."
docker exec -i auraai-postgres psql -U auraai -d auraai < /opt/aura-ai/scripts/migrate-runes-settings.sql 2>/dev/null || true

echo ">>> DB migrate rate limits..."
docker exec -i auraai-postgres psql -U auraai -d auraai < /opt/aura-ai/scripts/migrate-rate-limits.sql 2>/dev/null || true

echo ">>> DB migrate AI model sync..."
docker exec -i auraai-postgres psql -U auraai -d auraai < /opt/aura-ai/scripts/migrate-ai-deepseek-sync.sql 2>/dev/null || true

echo ">>> DB migrate session memories..."
docker exec -i auraai-postgres psql -U auraai -d auraai < /opt/aura-ai/scripts/migrate-session-memories.sql 2>/dev/null || true

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

echo "Deploy complete: http://192.168.1.152:3000"
