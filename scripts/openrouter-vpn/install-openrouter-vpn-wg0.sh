#!/usr/bin/env bash
# Install WireGuard client to FOXDPI + split-route OpenRouter on aura-ai VPS.
set -euo pipefail

STATE_DIR="/var/lib/aura-ai/openrouter-vpn"
ROLLBACK_DIR="/var/lib/aura-ai/rollback/openrouter-vpn-$(date +%Y%m%d-%H%M%S)"
ROLLBACK_LINK="/var/lib/aura-ai/rollback/openrouter-vpn-latest"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FOXDPI_HOST="${FOXDPI_HOST:-91.184.240.82}"
FOXDPI_WG_PORT="${FOXDPI_WG_PORT:-51821}"
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
apt-get install -y -qq wireguard-tools curl dnsutils sshpass

echo "=== Generate WG keys ==="
CLIENT_PRIV="$(wg genkey)"
CLIENT_PUB="$(printf '%s' "$CLIENT_PRIV" | wg pubkey)"
PSK="$(wg genpsk)"
echo "$CLIENT_PUB" > "${ROLLBACK_DIR}/peer-public-key.txt"

if [[ -z "${FOXDPI_SSH_PASS:-}" ]]; then
  echo "FOXDPI_SSH_PASS missing" >&2
  exit 1
fi

echo "=== Register peer on FOXDPI wg0 ==="
REMOTE="
set -e
CONF=/etc/wireguard/wg0.conf
cp \"\$CONF\" \"\${CONF}.bak.aura-ai-\$(date +%Y%m%d-%H%M%S)\"
grep -q '${CLIENT_PUB}' \"\$CONF\" || cat >> \"\$CONF\" <<EOF

[Peer]
# aura-ai zovus openrouter $(date -Is)
PublicKey = ${CLIENT_PUB}
PresharedKey = ${PSK}
AllowedIPs = ${CLIENT_IP}/32
PersistentKeepalive = 25
EOF
wg syncconf wg0 <(wg-quick strip wg0)
echo peer_added_ok
"
sshpass -p "$FOXDPI_SSH_PASS" ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=12 "root@${FOXDPI_HOST}" "$REMOTE"

mkdir -p /etc/wireguard
cat > /etc/wireguard/wg-foxdpi.conf <<EOF
[Interface]
Address = ${CLIENT_IP}/32
PrivateKey = ${CLIENT_PRIV}
Table = off

[Peer]
PublicKey = ${FOXDPI_SERVER_PUB}
PresharedKey = ${PSK}
Endpoint = ${FOXDPI_HOST}:${FOXDPI_WG_PORT}
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
  -d '{"model":"openai/gpt-4o-mini","messages":[{"role":"user","content":"Say OK"}],"max_tokens":5}')"
echo "openrouter_chat_http=${HTTP_CODE}"
head -c 200 /tmp/or-test.json || true
echo

systemctl restart aura-ai || true
echo "MODE=wg0" > "${STATE_DIR}/mode.txt"
echo "=== Installed via FOXDPI wg0. Rollback: sudo bash /usr/local/sbin/rollback-openrouter-vpn.sh ==="
echo "Rollback snapshot: ${ROLLBACK_DIR}"
