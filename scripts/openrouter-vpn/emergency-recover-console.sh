#!/usr/bin/env bash
# EMERGENCY: run from hosting console (VNC/serial) if SSH to aura-ai is dead after VPN experiment.
set -euo pipefail

echo "=== Emergency network recovery ==="
systemctl stop awg-quick@awg0 wg-quick@wg-foxdpi openrouter-vpn-routes.timer 2>/dev/null || true
systemctl disable awg-quick@awg0 wg-quick@wg-foxdpi openrouter-vpn-routes.timer 2>/dev/null || true
awg-quick down awg0 2>/dev/null || true
wg-quick down wg-foxdpi 2>/dev/null || true
ip link del awg0 2>/dev/null || true
ip link del wg-foxdpi 2>/dev/null || true

if [[ -f /var/lib/aura-ai/openrouter-vpn/active-routes.txt ]]; then
  while read -r ip; do
    [[ -z "$ip" ]] && continue
    ip route del "${ip}/32" 2>/dev/null || true
  done < /var/lib/aura-ai/openrouter-vpn/active-routes.txt
fi

rm -f /etc/amnezia/amneziawg/awg0.conf /etc/wireguard/wg-foxdpi.conf
systemctl daemon-reload
systemctl restart aura-ai 2>/dev/null || true

echo "=== Done. Test: ip route; curl -sI https://openrouter.ai | head -3 ==="
