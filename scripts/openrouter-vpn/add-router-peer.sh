#!/usr/bin/env bash
set -euo pipefail
CLIENT_PUB="${1:?pubkey}"
PSK="${2:?psk}"
CLIENT_IP="${3:-10.66.66.8}"
CONF=/etc/wireguard/wg0.conf
sudo cp "$CONF" "${CONF}.bak.aura-ai-$(date +%Y%m%d-%H%M%S)"
if sudo grep -q "$CLIENT_PUB" "$CONF"; then
  echo peer_exists
else
  sudo tee -a "$CONF" >/dev/null <<EOF

[Peer]
# aura-ai zovus openrouter $(date -Is)
PublicKey = ${CLIENT_PUB}
PresharedKey = ${PSK}
AllowedIPs = ${CLIENT_IP}/32
PersistentKeepalive = 25
EOF
fi
sudo wg syncconf wg0 <(sudo wg-quick strip wg0)
sudo bash /opt/router-dashboard/scripts/apply_wg0_vpn_egress.sh
echo peer_added_ok
