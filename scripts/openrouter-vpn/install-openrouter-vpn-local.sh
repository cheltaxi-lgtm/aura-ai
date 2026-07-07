#!/usr/bin/env bash
# Install wg-foxdpi on aura-ai VPS (peer must already exist on home router wg0).
set -euo pipefail

STATE_DIR="/var/lib/aura-ai/openrouter-vpn"
ROLLBACK_DIR="/var/lib/aura-ai/rollback/openrouter-vpn-$(date +%Y%m%d-%H%M%S)"
ROLLBACK_LINK="/var/lib/aura-ai/rollback/openrouter-vpn-latest"
SCRIPT_DIR="/tmp/openrouter-vpn"
WG_ENDPOINT="${WG_ENDPOINT:-kharitonov.keenetic.pro:51821}"
FOXDPI_SERVER_PUB="${FOXDPI_SERVER_PUB:-7UBIsiAC8XHoiOYoDfkuk3Kv1PqAyz0MZlA3jmEHV08=}"
CLIENT_IP="${CLIENT_IP:-10.66.66.8}"

mkdir -p "$ROLLBACK_DIR" "$STATE_DIR"
ln -sfn "$ROLLBACK_DIR" "$ROLLBACK_LINK"

echo "=== Snapshot (rollback point) ==="
ip route show > "${ROLLBACK_DIR}/ip-routes.txt"
ip rule list > "${ROLLBACK_DIR}/ip-rules.txt"
ip -br link > "${ROLLBACK_DIR}/interfaces.txt"
cp "${SCRIPT_DIR}/rollback-openrouter-vpn.sh" "${ROLLBACK_DIR}/rollback-openrouter-vpn.sh"
echo "$ROLLBACK_DIR" > "${STATE_DIR}/rollback-dir.txt"

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq wireguard-tools curl dnsutils

if [[ ! -f "${STATE_DIR}/client-keys.env" ]]; then
  echo "=== Generate WG keys ==="
  CLIENT_PRIV="$(wg genkey)"
  CLIENT_PUB="$(printf '%s' "$CLIENT_PRIV" | wg pubkey)"
  PSK="$(wg genpsk)"
  cat > "${STATE_DIR}/client-keys.env" <<EOF
CLIENT_PRIV=${CLIENT_PRIV}
CLIENT_PUB=${CLIENT_PUB}
PSK=${PSK}
EOF
  echo "$CLIENT_PUB" > "${ROLLBACK_DIR}/peer-public-key.txt"
  chmod 600 "${STATE_DIR}/client-keys.env"
  echo "PEER_PUB=${CLIENT_PUB}"
  echo "PSK=${PSK}"
else
  # shellcheck disable=SC1091
  source "${STATE_DIR}/client-keys.env"
  echo "$CLIENT_PUB" > "${ROLLBACK_DIR}/peer-public-key.txt"
fi

# shellcheck disable=SC1091
source "${STATE_DIR}/client-keys.env"

mkdir -p /etc/wireguard
cat > /etc/wireguard/wg-foxdpi.conf <<EOF
[Interface]
Address = ${CLIENT_IP}/32
PrivateKey = ${CLIENT_PRIV}
Table = off

[Peer]
PublicKey = ${FOXDPI_SERVER_PUB}
PresharedKey = ${PSK}
Endpoint = ${WG_ENDPOINT}
AllowedIPs = 0.0.0.0/0
PersistentKeepalive = 25
EOF
chmod 600 /etc/wireguard/wg-foxdpi.conf

wg-quick down wg-foxdpi 2>/dev/null || true
wg-quick up wg-foxdpi

mkdir -p /etc/systemd/system/wg-quick@wg-foxdpi.service.d
cat > /etc/systemd/system/wg-quick@wg-foxdpi.service.d/override.conf <<'EOF'
[Service]
Environment=WG_ENDPOINT_RESOLUTION=ipv4
EOF
systemctl enable wg-quick@wg-foxdpi

install -m 755 "${SCRIPT_DIR}/openrouter-routes.sh" "${STATE_DIR}/openrouter-routes.sh"
install -m 755 "${SCRIPT_DIR}/rollback-openrouter-vpn.sh" /usr/local/sbin/rollback-openrouter-vpn.sh

cat > /etc/systemd/system/openrouter-vpn-routes.service <<'UNIT'
[Unit]
Description=Refresh OpenRouter split routes via wg-foxdpi
After=network-online.target wg-quick@wg-foxdpi.service
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/var/lib/aura-ai/openrouter-vpn/openrouter-routes.sh
UNIT

cat > /etc/systemd/system/openrouter-vpn-routes.timer <<'UNIT'
[Unit]
Description=Refresh OpenRouter routes every 10 minutes

[Timer]
OnBootSec=30s
OnUnitActiveSec=10min
Persistent=true

[Install]
WantedBy=timers.target
UNIT

systemctl daemon-reload
systemctl enable --now openrouter-vpn-routes.timer
bash "${STATE_DIR}/openrouter-routes.sh"

echo "=== Verify tunnel ==="
sleep 2
wg show wg-foxdpi
curl -s --max-time 10 --interface wg-foxdpi https://ifconfig.me || true
echo

echo "=== Verify OpenRouter ==="
KEY="$(grep -E '^OPENROUTER_API_KEY=' /opt/aura-ai/.env.local 2>/dev/null | head -1 | cut -d= -f2- | tr -d "'")"
HTTP_CODE="$(curl -s -o /tmp/or-test.json -w '%{http_code}' --max-time 20 \
  -X POST https://openrouter.ai/api/v1/chat/completions \
  -H "Authorization: Bearer ${KEY}" \
  -H 'Content-Type: application/json' \
  -H 'HTTP-Referer: https://zovus.ru' \
  -H 'X-Title: Zovus' \
  -d '{"model":"openai/gpt-4o-mini","messages":[{"role":"user","content":"Say OK"}],"max_tokens":5}')"
echo "openrouter_chat_http=${HTTP_CODE}"
head -c 200 /tmp/or-test.json || true
echo

systemctl restart aura-ai || true
echo "MODE=wg0" > "${STATE_DIR}/mode.txt"
echo "=== Installed. Rollback: sudo bash /usr/local/sbin/rollback-openrouter-vpn.sh ==="
