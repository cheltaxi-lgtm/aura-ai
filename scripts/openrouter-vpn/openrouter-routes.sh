#!/usr/bin/env bash
# Split-route openrouter.ai via VPN interface (wg-foxdpi or awg0).
set -euo pipefail

IFACE="${OPENROUTER_VPN_IFACE:-wg-foxdpi}"
HOSTS=(openrouter.ai)
STATE_DIR="/var/lib/aura-ai/openrouter-vpn"
ROUTE_FILE="${STATE_DIR}/active-routes.txt"

mkdir -p "$STATE_DIR"

clear_routes() {
  if [[ -f "$ROUTE_FILE" ]]; then
    while read -r ip; do
      [[ -z "$ip" ]] && continue
      ip route del "${ip}/32" dev "$IFACE" 2>/dev/null || true
    done < "$ROUTE_FILE"
    : > "$ROUTE_FILE"
  fi
}

if [[ "${1:-}" == "--clear" ]]; then
  clear_routes
  exit 0
fi

if ! ip link show "$IFACE" >/dev/null 2>&1; then
  echo "${IFACE} down" >&2
  exit 1
fi

TMP="$(mktemp)"
trap 'rm -f "$TMP" "${TMP}.uniq"' EXIT

for host in "${HOSTS[@]}"; do
  dig +short A "$host" @1.1.1.1 2>/dev/null | grep -E '^[0-9.]+$' >> "$TMP" || true
  dig +short A "$host" @8.8.8.8 2>/dev/null | grep -E '^[0-9.]+$' >> "$TMP" || true
done

sort -u "$TMP" > "${TMP}.uniq"
clear_routes

while read -r ip; do
  [[ -z "$ip" ]] && continue
  ip route replace "${ip}/32" dev "$IFACE"
  echo "$ip" >> "$ROUTE_FILE"
done < "${TMP}.uniq"

echo "iface=${IFACE} routes=$(wc -l < "$ROUTE_FILE" | tr -d ' ')"
