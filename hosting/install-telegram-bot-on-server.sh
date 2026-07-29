#!/bin/bash
set -euo pipefail
BOT_DIR=/opt/aura-ai/telegram-bot
test -d "$BOT_DIR" || { echo "missing $BOT_DIR"; exit 1; }
test -f "$BOT_DIR/.env" || { echo "missing $BOT_DIR/.env — run wire-telegram-env first"; exit 1; }
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
sudo -u aura-ai npm install
systemctl daemon-reload
systemctl enable zovus-telegram-bot.service
systemctl restart zovus-telegram-bot.service
sleep 3
systemctl is-active zovus-telegram-bot.service
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
