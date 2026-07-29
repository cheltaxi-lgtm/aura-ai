#!/bin/bash
# Wire Telegram + bot-internal secrets on Beget. Values never echoed.
# Usage: bash wire-telegram-env-on-server.sh <path-to-token-file>
set -euo pipefail

SITE_ENV=/opt/aura-ai/.env.local
BOT_DIR=/opt/aura-ai/telegram-bot
BOT_ENV="$BOT_DIR/.env"
TOKEN_FILE="${1:-}"

if [[ ! -f "$SITE_ENV" ]]; then
  echo "ERROR: missing $SITE_ENV" >&2
  exit 1
fi
if [[ -z "$TOKEN_FILE" || ! -f "$TOKEN_FILE" ]]; then
  echo "ERROR: token file required" >&2
  exit 1
fi

TG_TOKEN="$(tr -d '\r\n' < "$TOKEN_FILE")"
if [[ ! "$TG_TOKEN" =~ ^[0-9]+:[A-Za-z0-9_-]+$ ]]; then
  echo "ERROR: token file does not look like a bot token" >&2
  exit 1
fi

# Reuse existing internal secret if present, else generate.
if grep -qE '^BOT_INTERNAL_SECRET=.' "$SITE_ENV" 2>/dev/null; then
  INTERNAL="$(grep -E '^BOT_INTERNAL_SECRET=' "$SITE_ENV" | head -1 | cut -d= -f2- | tr -d '\r')"
else
  INTERNAL="$(openssl rand -hex 32)"
fi

upsert_site() {
  local key="$1" val="$2"
  if grep -qE "^${key}=" "$SITE_ENV"; then
    sed -i "s|^${key}=.*|${key}=${val}|" "$SITE_ENV"
  else
    printf '\n%s=%s\n' "$key" "$val" >> "$SITE_ENV"
  fi
}

upsert_site "TELEGRAM_BOT_TOKEN" "$TG_TOKEN"
upsert_site "NEXT_PUBLIC_TELEGRAM_BOT_USERNAME" "zovus_card_bot"
upsert_site "TELEGRAM_AUTH_MAX_AGE_SEC" "86400"
upsert_site "BOT_INTERNAL_BASE_URL" "http://127.0.0.1:8787"
upsert_site "BOT_INTERNAL_SECRET" "$INTERNAL"

mkdir -p "$BOT_DIR" /var/log/aura-ai /opt/aura-ai/backups

# Pull optional keys from site env for bot LLM/TTS (no print).
read_site() {
  local key="$1"
  grep -E "^${key}=" "$SITE_ENV" | head -1 | cut -d= -f2- | tr -d '\r' || true
}

OPENROUTER="$(read_site OPENROUTER_API_KEY)"
TTS_KEY="$(read_site BOT_TTS_API_KEY)"
[[ -z "$TTS_KEY" ]] && TTS_KEY="$OPENROUTER"

umask 077
cat > "$BOT_ENV" <<EOF
TELEGRAM_BOT_TOKEN=${TG_TOKEN}
ZOVUS_SITE_URL=https://zovus.ru
BOT_CTA_TARGET_URL=https://zovus.ru
BOT_MODE=polling
BOT_HTTP_ALWAYS=true
BOT_WEBHOOK_PORT=8787
BOT_USERNAME=zovus_card_bot
BOT_INTERNAL_SECRET=${INTERNAL}
BOT_SESSION_TTL_HOURS=168
BOT_ENABLED=true
BOT_DAY_CARD_ENABLED=true
BOT_REMINDERS_ENABLED=true
BOT_RITUAL_REVEAL_ENABLED=true
BOT_TTS_ENABLED=true
BOT_LLM_ENABLED=true
BOT_SHARE_CARD_ENABLED=true
OPENROUTER_API_KEY=${OPENROUTER}
BOT_TTS_API_KEY=${TTS_KEY}
EOF
chmod 600 "$BOT_ENV" "$SITE_ENV"

# Presence only
for k in TELEGRAM_BOT_TOKEN NEXT_PUBLIC_TELEGRAM_BOT_USERNAME BOT_INTERNAL_BASE_URL BOT_INTERNAL_SECRET; do
  if grep -qE "^${k}=." "$SITE_ENV"; then echo "site $k=SET"; else echo "site $k=MISSING"; fi
done
for k in TELEGRAM_BOT_TOKEN BOT_INTERNAL_SECRET BOT_WEBHOOK_PORT; do
  if grep -qE "^${k}=." "$BOT_ENV"; then echo "bot $k=SET"; else echo "bot $k=MISSING"; fi
done
echo "wired_ok"
