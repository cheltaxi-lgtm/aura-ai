#!/bin/bash
set -euo pipefail
BOT_DIR=/opt/aura-ai/telegram-bot
test -d "$BOT_DIR" || { echo "missing $BOT_DIR"; exit 1; }
if [[ ! -f "$BOT_DIR/.env" ]] || ! grep -qE '^TELEGRAM_BOT_TOKEN=.' "$BOT_DIR/.env"; then
  if [[ -f /opt/aura-ai/hosting/restore-bot-env-on-server.sh ]]; then
    sed -i 's/\r$//' /opt/aura-ai/hosting/restore-bot-env-on-server.sh
    bash /opt/aura-ai/hosting/restore-bot-env-on-server.sh
  else
    echo "missing $BOT_DIR/.env — run wire-telegram-env first"; exit 1
  fi
fi
# Ensure site bridge keys exist without wiping the file
grep -qE '^SITE_INTERNAL_BASE_URL=' "$BOT_DIR/.env" || echo 'SITE_INTERNAL_BASE_URL=http://127.0.0.1:3000' >> "$BOT_DIR/.env"
grep -qE '^BOT_REQUIRE_SITE_ACCOUNT=' "$BOT_DIR/.env" || echo 'BOT_REQUIRE_SITE_ACCOUNT=true' >> "$BOT_DIR/.env"
id -u aura-ai >/dev/null 2>&1 || useradd --system --home /opt/aura-ai --shell /usr/sbin/nologin aura-ai
mkdir -p /var/log/aura-ai "$BOT_DIR/data" "$BOT_DIR/backups"
chown -R aura-ai:aura-ai "$BOT_DIR/data" "$BOT_DIR/backups" /var/log/aura-ai
# Bot needs read on package + .env; write on sqlite/data.
chown -R aura-ai:aura-ai "$BOT_DIR"
# Keep parent tree traversable for aura-ai
chmod 750 "$BOT_DIR" || true
chmod 640 "$BOT_DIR/.env" || true
cp /opt/aura-ai/hosting/zovus-telegram-bot.service /etc/systemd/system/zovus-telegram-bot.service
sed -i 's/\r$//' /etc/systemd/system/zovus-telegram-bot.service
cd "$BOT_DIR"
# npm cache under /opt/aura-ai must be writable by aura-ai (deploy may leave root-owned .npm).
mkdir -p /opt/aura-ai/.npm
chown -R aura-ai:aura-ai /opt/aura-ai/.npm || true
sudo -u aura-ai npm install --cache /opt/aura-ai/.npm
# Deploy/tarball can strip +x from esbuild → tsx TransformError / frozen handlers.
find "$BOT_DIR/node_modules/@esbuild" "$BOT_DIR/node_modules/esbuild" \
  /opt/aura-ai/node_modules/@esbuild /opt/aura-ai/node_modules/esbuild \
  -type f -name esbuild -exec chmod +x {} + 2>/dev/null || true
systemctl daemon-reload
systemctl enable zovus-telegram-bot.service
systemctl restart zovus-telegram-bot.service
for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS --max-time 2 http://127.0.0.1:8787/health >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
systemctl is-active zovus-telegram-bot.service || true
curl -fsS http://127.0.0.1:8787/health
echo
# site keys presence
for k in TELEGRAM_BOT_TOKEN BOT_INTERNAL_BASE_URL BOT_INTERNAL_SECRET NEXT_PUBLIC_TELEGRAM_BOT_USERNAME; do
  if grep -qE "^${k}=." /opt/aura-ai/.env.local; then echo "site $k=SET"; else echo "site $k=MISSING"; fi
done
docker exec auraai-postgres psql -U auraai -d auraai -tAc "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='user_telegram_identities');"
systemctl restart aura-ai.service
sleep 2
systemctl is-active aura-ai.service
curl -fsS -o /dev/null -w "site_health=%{http_code}\n" http://127.0.0.1:3000/api/health || true
echo install_bot_ok
