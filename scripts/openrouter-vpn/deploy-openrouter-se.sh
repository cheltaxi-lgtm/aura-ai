#!/usr/bin/env bash
# Point Zovus prod OpenRouter proxy to Sweden VPS and restart aura-ai.
set -euo pipefail
cd /opt/aura-ai

PROXY_URL="${OPENROUTER_HTTPS_PROXY:-http://91.184.240.82:3128}"

if grep -q '^OPENROUTER_HTTPS_PROXY=' .env.local 2>/dev/null; then
  sed -i "s|^OPENROUTER_HTTPS_PROXY=.*|OPENROUTER_HTTPS_PROXY=${PROXY_URL}|" .env.local
else
  echo "OPENROUTER_HTTPS_PROXY=${PROXY_URL}" >> .env.local
fi

mkdir -p /var/lib/aura-ai/openrouter-vpn
echo "primary=se-proxy" > /var/lib/aura-ai/openrouter-vpn/mode.txt
echo "fallback=direct-ipv4" >> /var/lib/aura-ai/openrouter-vpn/mode.txt

systemctl restart aura-ai
sleep 3
systemctl is-active aura-ai

echo "=== env ==="
grep '^OPENROUTER_HTTPS_PROXY=' .env.local

echo "=== proxy check from this host ==="
curl -s -o /dev/null -w "via_se_proxy:%{http_code}\n" --max-time 15 \
  -x "${PROXY_URL}" https://openrouter.ai/api/v1/models || true
