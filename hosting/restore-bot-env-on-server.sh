#!/bin/bash
set -euo pipefail
SITE_ENV=/opt/aura-ai/.env.local
BOT_ENV=/opt/aura-ai/telegram-bot/.env
test -f "$SITE_ENV"

read_site() {
  grep -E "^${1}=" "$SITE_ENV" | head -1 | cut -d= -f2- | tr -d '\r' || true
}

TG_TOKEN="$(read_site TELEGRAM_BOT_TOKEN)"
INTERNAL="$(read_site BOT_INTERNAL_SECRET)"
OPENROUTER="$(read_site OPENROUTER_API_KEY)"
TTS_KEY="$(read_site BOT_TTS_API_KEY)"
[[ -z "$TTS_KEY" ]] && TTS_KEY="$OPENROUTER"

if [[ -z "$TG_TOKEN" || -z "$INTERNAL" ]]; then
  echo "ERROR: missing TELEGRAM_BOT_TOKEN or BOT_INTERNAL_SECRET in site env" >&2
  exit 1
fi

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
SITE_INTERNAL_BASE_URL=http://127.0.0.1:3000
BOT_REQUIRE_SITE_ACCOUNT=true
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

chown aura-ai:aura-ai "$BOT_ENV"
chmod 640 "$BOT_ENV"
wc -c "$BOT_ENV" | awk '{print "bot_env_bytes="$1}'
grep -E '^(TELEGRAM_BOT_TOKEN|BOT_INTERNAL_SECRET|SITE_INTERNAL_BASE_URL|BOT_REQUIRE_SITE_ACCOUNT)=' "$BOT_ENV" | sed 's/=.*/=SET/'

# Bot deps live outside the site npm tree and are excluded from rsync — heal if wiped.
if [ ! -d /opt/aura-ai/telegram-bot/node_modules/grammy ]; then
  echo ">>> telegram-bot node_modules missing — npm ci"
  (cd /opt/aura-ai/telegram-bot && npm ci --legacy-peer-deps) || echo "WARN: bot npm ci failed"
  chown -R aura-ai:aura-ai /opt/aura-ai/telegram-bot/node_modules 2>/dev/null || true
fi

systemctl reset-failed zovus-telegram-bot.service || true
systemctl daemon-reload || true
systemctl restart zovus-telegram-bot.service
_BOT_OK=0
for i in 1 2 3 4 5 6 7 8 9 10 11 12 15; do
  if curl -fsS --max-time 2 http://127.0.0.1:8787/health >/dev/null 2>&1; then
    _BOT_OK=1
    break
  fi
  sleep 1
done
systemctl is-active zovus-telegram-bot.service || true
if [ "$_BOT_OK" -eq 1 ]; then
  curl -fsS --max-time 2 http://127.0.0.1:8787/health || true
  echo
else
  echo "WARN: bot health not ready after env restore (site deploy continues)"
fi
unset _BOT_OK

CODE=$(curl -sS -o /tmp/bot-resolve.json -w '%{http_code}' -X POST http://127.0.0.1:3000/api/internal/bot/resolve \
  -H 'Content-Type: application/json' \
  -H "X-Bot-Internal-Secret: ${INTERNAL}" \
  -d '{"telegram_user_id":1}' || printf '000')
echo "resolve_http=${CODE}"
python3 - <<'PY' || true
import json
try:
  d=json.load(open("/tmp/bot-resolve.json"))
  print("resolve", {k: d.get(k) for k in ("ok", "linked", "error", "needsOnboarding")})
  print("has_linkUrl", bool(d.get("linkUrl")))
except Exception as e:
  print("resolve_parse_error", e)
PY
tail -n 12 /var/log/aura-ai/telegram-bot.log || true
echo restore_bot_env_ok
