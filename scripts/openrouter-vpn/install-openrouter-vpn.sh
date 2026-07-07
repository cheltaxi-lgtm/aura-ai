#!/usr/bin/env bash
# Install AmneziaWG client + OpenRouter split routing on aura-ai VPS.
# Requires env: SWEDEN_SSH_PASS (or pre-created /root/.openrouter-vpn/client.env)
set -euo pipefail

STATE_DIR="/var/lib/aura-ai/openrouter-vpn"
ROLLBACK_DIR="/var/lib/aura-ai/rollback/openrouter-vpn-$(date +%Y%m%d-%H%M%S)"
ROLLBACK_LINK="/var/lib/aura-ai/rollback/openrouter-vpn-latest"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLIENT_IP="${CLIENT_IP:-100.88.221.177}"
SWEDEN_HOST="${SWEDEN_HOST:-91.184.240.82}"
SWEDEN_PORT="${SWEDEN_PORT:-9911}"
SWEDEN_TUNNEL="${SWEDEN_TUNNEL:-10.8.0.1}"
SERVER_PUB="${SERVER_PUB:-bkfkmi527P1ZWVVLFEp394Zv3BqO/utfzH5rfEVRwRE=}"

mkdir -p "$ROLLBACK_DIR" "$STATE_DIR"
ln -sfn "$ROLLBACK_DIR" "$ROLLBACK_LINK"

echo "=== Snapshot (rollback point) ==="
{
  echo "# created $(date -Is)"
  ip route show
} > "${ROLLBACK_DIR}/ip-routes.txt"
ip rule list > "${ROLLBACK_DIR}/ip-rules.txt"
ip -br link > "${ROLLBACK_DIR}/interfaces.txt"
cp /etc/resolv.conf "${ROLLBACK_DIR}/resolv.conf" 2>/dev/null || true
cp "${SCRIPT_DIR}/rollback-openrouter-vpn.sh" "${ROLLBACK_DIR}/rollback-openrouter-vpn.sh"
echo "$ROLLBACK_DIR" > "${STATE_DIR}/rollback-dir.txt"

echo "=== Install amneziawg ==="
export DEBIAN_FRONTEND=noninteractive
modprobe amneziawg 2>/dev/null || true
if ! lsmod | grep -q amneziawg; then
  apt-get update -qq
  apt-get install -y -qq git build-essential linux-headers-"$(uname -r)" wireguard-tools curl dnsutils sshpass
  rm -rf /tmp/amneziawg-build
  git clone --depth 1 https://github.com/amnezia-vpn/amneziawg-linux-kernel-module /tmp/amneziawg-build
  make -C /tmp/amneziawg-build/src -s
  make -C /tmp/amneziawg-build/src install -s
  depmod -a
  echo amneziawg > /etc/modules-load.d/amneziawg.conf
  modprobe amneziawg
fi

if ! command -v awg >/dev/null; then
  rm -rf /tmp/amneziawg-tools
  git clone --depth 1 https://github.com/amnezia-vpn/amneziawg-tools /tmp/amneziawg-tools
  make -C /tmp/amneziawg-tools/src -s
  make -C /tmp/amneziawg-tools/src install -s
fi

echo "=== Generate client keys ==="
CLIENT_PRIV="$(awg genkey)"
CLIENT_PUB="$(printf '%s' "$CLIENT_PRIV" | awg pubkey)"
PSK="$(awg genpsk)"
echo "$CLIENT_PUB" > "${ROLLBACK_DIR}/peer-public-key.txt"

echo "=== Register peer on Sweden server ==="
if [[ -z "${SWEDEN_SSH_PASS:-}" ]]; then
  echo "SWEDEN_SSH_PASS missing" >&2
  exit 1
fi
REMOTE="
set -e
CONF=/etc/amnezia/amneziawg/awg0.conf
cp \"\$CONF\" \"\${CONF}.bak.aura-ai-\$(date +%Y%m%d-%H%M%S)\"
grep -q '${CLIENT_PUB}' \"\$CONF\" || cat >> \"\$CONF\" <<EOF

[Peer]
# aura-ai openrouter $(date -Is)
PublicKey = ${CLIENT_PUB}
PresharedKey = ${PSK}
AllowedIPs = ${CLIENT_IP}/32
EOF
awg syncconf awg0 <(awg-quick strip awg0)
echo peer_added_ok
"
sshpass -p "$SWEDEN_SSH_PASS" ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=12 "root@${SWEDEN_HOST}" "$REMOTE"

mkdir -p /etc/amnezia/amneziawg
cat > /etc/amnezia/amneziawg/awg0.conf <<EOF
[Interface]
Address = ${CLIENT_IP}/32
PrivateKey = ${CLIENT_PRIV}
Table = off
Jc = 4
Jmin = 10
Jmax = 50
S1 = 120
S2 = 20
H1 = 141022066
H2 = 1576286278
H3 = 615451713
H4 = 2140420893
I1 = <r 2><b 0x8580000100010000000002646c06676f6f676c6503636f6d0000010001c00c000100010000105a00044d583737>

[Peer]
PublicKey = ${SERVER_PUB}
PresharedKey = ${PSK}
AllowedIPs = 0.0.0.0/0
Endpoint = ${SWEDEN_HOST}:${SWEDEN_PORT}
PersistentKeepalive = 25
EOF
chmod 600 /etc/amnezia/amneziawg/awg0.conf

awg-quick down awg0 2>/dev/null || true
awg-quick up awg0
systemctl enable awg-quick@awg0

install -m 755 "${SCRIPT_DIR}/openrouter-routes.sh" "${STATE_DIR}/openrouter-routes.sh"
install -m 755 "${SCRIPT_DIR}/rollback-openrouter-vpn.sh" /usr/local/sbin/rollback-openrouter-vpn.sh

cat > /etc/systemd/system/openrouter-vpn-routes.service <<'UNIT'
[Unit]
Description=Refresh OpenRouter split routes via awg0
After=network-online.target awg-quick@awg0.service
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

echo "=== Verify OpenRouter ==="
sleep 2
KEY="$(grep -E '^OPENROUTER_API_KEY=' /opt/aura-ai/.env.local 2>/dev/null | head -1 | cut -d= -f2- | tr -d "'")"
HTTP_CODE="$(curl -s -o /tmp/or-test.json -w '%{http_code}' --max-time 15 \
  -X POST https://openrouter.ai/api/v1/chat/completions \
  -H "Authorization: Bearer ${KEY}" \
  -H 'Content-Type: application/json' \
  -d '{"model":"openai/gpt-4o-mini","messages":[{"role":"user","content":"Say OK"}],"max_tokens":5}')"
echo "openrouter_chat_http=${HTTP_CODE}"
head -c 200 /tmp/or-test.json || true
echo

systemctl restart aura-ai || true
echo "=== Installed. Rollback: sudo bash /usr/local/sbin/rollback-openrouter-vpn.sh ==="
echo "Rollback snapshot: ${ROLLBACK_DIR}"
