#!/bin/bash
# Honest PRO flags after productization deploy + smoke.
set -euo pipefail
ENV=/opt/aura-ai/.env.local
set_kv() {
  local key="$1" val="$2"
  if grep -qE "^${key}=" "$ENV"; then
    sed -i "s|^${key}=.*|${key}=${val}|" "$ENV"
  else
    printf '%s=%s\n' "$key" "$val" >> "$ENV"
  fi
}
set_kv PRO_MODULE_ENABLED true
set_kv PRO_AI_ENABLED true
set_kv PRO_BILLING_MODE live
set_kv PRO_DELIVERY_ENABLED true
set_kv PRO_DIALOG_MODE_MAX c
set_kv PRO_CRISIS_GATE_ENABLED true
# No product code yet — keep dark
set_kv PRO_PORTAL_ENABLED false
set_kv PRO_FOLLOWUP_ENABLED false
set_kv PRO_TRANSCRIPTS_ENABLED false
set_kv PRO_VISION_ENABLED false
set_kv PRO_TTS_ENABLED false

systemctl restart aura-ai
sleep 5
for i in 1 2 3 4 5 6 7 8 9 10; do
  curl -fsS -m 3 http://127.0.0.1:3000/api/health >/dev/null && break
  sleep 2
done

echo "=== FLAGS ==="
grep -E '^PRO_' "$ENV"
echo "=== SMOKE ==="
for u in \
  "https://zovus.ru/api/health" \
  "https://zovus.ru/api/pro/health" \
  "https://zovus.ru/api/platform/features" \
  "https://zovus.ru/zovus-pro" \
  "https://zovus.ru/offer-pro" \
  "https://zovus.ru/auth" \
  "https://zovus.ru/pro" \
  "https://zovus.ru/admin/pro"
 do
  code=$(curl -sS -m 12 -o /tmp/b -w "%{http_code}" -L --max-redirs 2 "$u" || echo err)
  echo "$code $u"
 done
echo "=== FEATURES snippet ==="
curl -sS -m 8 https://zovus.ru/api/platform/features | tr ',' '\n' | grep -E 'proModule|expertReg' || true
echo "=== AUTH has Практик? ==="
curl -sS -m 8 https://zovus.ru/auth | grep -o 'Практик' | head -1 || echo "MISSING"
echo "=== ZOVUS-PRO title ==="
curl -sS -m 8 https://zovus.ru/zovus-pro | grep -oE '<title>[^<]+</title>' | head -1
systemctl is-active aura-ai aura-ai-async-jobs zovus-telegram-bot
echo "ROLLBACK=/opt/aura-ai-rollbacks/latest"
echo DONE
