#!/usr/bin/env bash
# HTTP proxy for OpenRouter egress (Sweden VPS). Allow only Zovus prod IP.
set -euo pipefail

ZOVUS_IP="${ZOVUS_IP:-217.12.37.32}"
PROXY_PORT="${PROXY_PORT:-3128}"

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq tinyproxy

mkdir -p /var/log/tinyproxy /run/tinyproxy
chown tinyproxy:tinyproxy /var/log/tinyproxy /run/tinyproxy 2>/dev/null || true

cat > /etc/tinyproxy/tinyproxy.conf <<EOF
User tinyproxy
Group tinyproxy
Port ${PROXY_PORT}
Listen 0.0.0.0
Timeout 600
DefaultErrorFile "/usr/share/tinyproxy/tinyproxy.html"
StatFile "/usr/share/tinyproxy/stats.html"
LogFile "/var/log/tinyproxy/tinyproxy.log"
LogLevel Info
PidFile "/run/tinyproxy/tinyproxy.pid"
MaxClients 32
MinSpareServers 2
MaxSpareServers 8
StartServers 2
MaxRequestsPerChild 0
Allow ${ZOVUS_IP}
ViaProxyName "tinyproxy"
ConnectPort 443
ConnectPort 80
EOF

systemctl enable tinyproxy
systemctl restart tinyproxy

if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  ufw allow from "${ZOVUS_IP}" to any port "${PROXY_PORT}" proto tcp comment "zovus-openrouter" 2>/dev/null || true
fi

# Also allow via iptables if ufw inactive (common on VPS images)
if command -v iptables >/dev/null 2>&1; then
  iptables -C INPUT -p tcp --dport "${PROXY_PORT}" -s "${ZOVUS_IP}" -j ACCEPT 2>/dev/null \
    || iptables -I INPUT -p tcp --dport "${PROXY_PORT}" -s "${ZOVUS_IP}" -j ACCEPT
fi

echo "=== tinyproxy status ==="
systemctl is-active tinyproxy
ss -ltnp | grep ":${PROXY_PORT}" || true

echo "=== OpenRouter from Sweden ==="
curl -s -o /dev/null -w "direct_or:%{http_code}\n" --max-time 10 https://openrouter.ai/api/v1/models

PUB_IP=$(curl -s --max-time 5 https://api.ipify.org || hostname -I | awk '{print $1}')
echo "=== Done. Zovus: OPENROUTER_HTTPS_PROXY=http://${PUB_IP}:${PROXY_PORT} ==="
