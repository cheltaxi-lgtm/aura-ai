#!/usr/bin/env bash
# Deploy OpenRouter Latvia proxy support on prod Zovus VPS.
set -euo pipefail
cd /opt/aura-ai

PROXY_URL="${OPENROUTER_HTTPS_PROXY:-http://45.156.20.127:3128}"

if grep -q '^OPENROUTER_HTTPS_PROXY=' .env.local 2>/dev/null; then
  sed -i "s|^OPENROUTER_HTTPS_PROXY=.*|OPENROUTER_HTTPS_PROXY=${PROXY_URL}|" .env.local
else
  echo "OPENROUTER_HTTPS_PROXY=${PROXY_URL}" >> .env.local
fi

npm install --no-audit --no-fund
npm run build

mkdir -p /var/lib/aura-ai/openrouter-vpn
echo "primary=lv-proxy" > /var/lib/aura-ai/openrouter-vpn/mode.txt
echo "fallback=wg-foxdpi" >> /var/lib/aura-ai/openrouter-vpn/mode.txt

systemctl restart aura-ai
sleep 3
systemctl is-active aura-ai
