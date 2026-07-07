#!/usr/bin/env bash
# Rollback OpenRouter VPN split-routing on aura-ai VPS.
# Usage: sudo bash rollback-openrouter-vpn.sh [ROLLBACK_DIR]
set -euo pipefail

ROLLBACK_DIR="${1:-/var/lib/aura-ai/rollback/openrouter-vpn-latest}"
STATE_DIR="/var/lib/aura-ai/openrouter-vpn"
IFACE="${OPENROUTER_VPN_IFACE:-wg-foxdpi}"

echo "=== OpenRouter VPN rollback ==="
echo "Rollback dir: ${ROLLBACK_DIR}"
echo "Interface: ${IFACE}"

if [[ -f "${STATE_DIR}/mode.txt" ]]; then
  IFACE="wg-foxdpi"
  [[ "$(cat "${STATE_DIR}/mode.txt")" == "awg0" ]] && IFACE="awg0"
fi

systemctl stop openrouter-vpn-routes.timer 2>/dev/null || true
systemctl disable openrouter-vpn-routes.timer 2>/dev/null || true
systemctl stop openrouter-vpn-routes.service 2>/dev/null || true

if [[ -f "${STATE_DIR}/openrouter-routes.sh" ]]; then
  OPENROUTER_VPN_IFACE="$IFACE" bash "${STATE_DIR}/openrouter-routes.sh" --clear || true
  sed -i "s/dev ${IFACE}/dev ${IFACE}/g" "${STATE_DIR}/openrouter-routes.sh" 2>/dev/null || true
fi

systemctl stop "wg-quick@${IFACE}" 2>/dev/null || true
systemctl disable "wg-quick@${IFACE}" 2>/dev/null || true
systemctl stop "awg-quick@${IFACE}" 2>/dev/null || true
systemctl disable "awg-quick@${IFACE}" 2>/dev/null || true
wg-quick down "$IFACE" 2>/dev/null || true
awg-quick down "$IFACE" 2>/dev/null || true

for conf in "/etc/wireguard/${IFACE}.conf" "/etc/amnezia/amneziawg/${IFACE}.conf"; do
  if [[ -f "$conf" ]]; then
    mkdir -p "${ROLLBACK_DIR}/removed"
    ts="$(date +%Y%m%d-%H%M%S)"
    mv "$conf" "${ROLLBACK_DIR}/removed/$(basename "$conf").${ts}" 2>/dev/null || true
  fi
done

rm -rf "$STATE_DIR"
rm -f /etc/systemd/system/openrouter-vpn-routes.service /etc/systemd/system/openrouter-vpn-routes.timer
rm -rf /etc/systemd/system/wg-quick@wg-foxdpi.service.d
systemctl daemon-reload

if systemctl is-active --quiet aura-ai; then
  systemctl restart aura-ai
fi

echo "=== Rollback complete on aura-ai ==="
if [[ -f "${ROLLBACK_DIR}/peer-public-key.txt" ]]; then
  echo "Remove FOXDPI peer manually if needed: $(cat "${ROLLBACK_DIR}/peer-public-key.txt")"
fi
