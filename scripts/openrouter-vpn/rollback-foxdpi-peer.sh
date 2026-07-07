#!/usr/bin/env bash
# Remove aura-ai VPN peer from FOXDPI (run ON FOXDPI router as root).
set -euo pipefail

PEER_PUB="${1:-}"
if [[ -z "$PEER_PUB" && -f /var/lib/aura-ai/openrouter-vpn/peer-public-key.txt ]]; then
  PEER_PUB="$(cat /var/lib/aura-ai/openrouter-vpn/peer-public-key.txt)"
fi
[[ -z "$PEER_PUB" ]] && { echo "Usage: $0 <peer-public-key>"; exit 1; }

for conf in /etc/wireguard/wg0.conf /etc/amnezia/amneziawg/awg0.conf; do
  [[ -f "$conf" ]] || continue
  cp "$conf" "${conf}.bak.rollback-$(date +%Y%m%d-%H%M%S)"
  awk -v pub="$PEER_PUB" '
    BEGIN {skip=0}
    /^\[Peer\]/ { if (skip) skip=0; buf=$0 ORS; inpeer=1; peerbuf=buf; next }
    inpeer { peerbuf=peerbuf $0 ORS; if ($0 ~ "^PublicKey = " pub) {skip=1; inpeer=0; peerbuf=""}; if ($0 ~ /^\[/) { if (!skip) printf "%s", peerbuf; inpeer=0; skip=0; print $0; peerbuf=$0 ORS } next }
    !inpeer { print }
    END { if (inpeer && !skip) printf "%s", peerbuf }
  ' "$conf" > "${conf}.tmp" && mv "${conf}.tmp" "$conf"
done

wg syncconf wg0 <(wg-quick strip wg0) 2>/dev/null || true
awg syncconf awg0 <(awg-quick strip awg0) 2>/dev/null || true
ip rule del from 100.88.221.177/32 lookup main pref 90 2>/dev/null || true
iptables -t nat -D POSTROUTING -s 100.88.221.177/32 -o eth0 -j MASQUERADE 2>/dev/null || true
iptables -t mangle -D PREROUTING -i awg0 -s 100.88.221.177/32 -j MARK --set-mark 0xca6c 2>/dev/null || true
echo "FOXDPI peer cleanup done for ${PEER_PUB}"
