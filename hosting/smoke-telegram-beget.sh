#!/bin/bash
set -euo pipefail
echo "services: $(systemctl is-active aura-ai) $(systemctl is-active zovus-telegram-bot)"
ss -lntp | grep -E '3000|8787' || true
curl -fsS http://127.0.0.1:8787/health; echo
curl -fsS http://127.0.0.1:3000/api/health; echo
code=$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/api/auth/telegram/status || true)
echo "tg_status_http=$code"
SECRET="$(grep '^BOT_INTERNAL_SECRET=' /opt/aura-ai/.env.local | cut -d= -f2- | tr -d '\r')"
iv=$(curl -sS -m 5 -o /tmp/iv2.txt -w '%{http_code}' -X POST http://127.0.0.1:8787/internal/receipt/verify \
  -H 'Content-Type: application/json' \
  -H "X-Bot-Internal-Secret: ${SECRET}" \
  -d '{"token":"zg_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}')
echo "internal_verify_http=$iv body=$(cat /tmp/iv2.txt)"
docker exec auraai-postgres psql -U auraai -d auraai -tAc "SELECT to_regclass('public.user_telegram_identities');"
grep -R --include='*.js' -l 'zovus_card_bot' /opt/aura-ai/.next/static 2>/dev/null | head -3 || echo "WARN: zovus_card_bot not found in .next/static (rebuild may be needed for Login Widget)"
for k in TELEGRAM_BOT_TOKEN NEXT_PUBLIC_TELEGRAM_BOT_USERNAME BOT_INTERNAL_BASE_URL BOT_INTERNAL_SECRET; do
  grep -qE "^${k}=." /opt/aura-ai/.env.local && echo "site $k=SET" || echo "site $k=MISSING"
done
