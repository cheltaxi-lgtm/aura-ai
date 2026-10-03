#!/usr/bin/env bash
# Keep the host-only database private even for an older Docker port mapping.
# Only our named chains are managed; application/SSH/HTTP rules are untouched.
set -euo pipefail

mapfile -t ingress_interfaces < <({ ip -o -4 route show default; ip -o -6 route show default; } | awk '{for(i=1;i<=NF;i++) if($i=="dev") print $(i+1)}' | sort -u)
if [ "${#ingress_interfaces[@]}" -eq 0 ]; then
  echo "postgres ingress guard: no default interface; refusing an unverified setup" >&2
  exit 1
fi

for tool in iptables ip6tables; do
  command -v "$tool" >/dev/null
  chain="ZOVUS-PG-INGRESS"
  "$tool" -w -t raw -nL "$chain" >/dev/null 2>&1 || "$tool" -w -t raw -N "$chain"
  for interface in "${ingress_interfaces[@]}"; do
    [[ "$interface" =~ ^[a-zA-Z0-9_.:-]+$ ]] || exit 1
    if ! "$tool" -w -t raw -C "$chain" -i "$interface" -p tcp --dport 5432 -j DROP 2>/dev/null; then
      "$tool" -w -t raw -A "$chain" -i "$interface" -p tcp --dport 5432 -j DROP
    fi
  done
  # Run before Docker DNAT and its terminal ACCEPT rules. Insert first before
  # removing any older duplicate, so repairing order never opens the port.
  "$tool" -w -t raw -I PREROUTING 1 -j "$chain"
  mapfile -t older_jumps < <("$tool" -w -t raw -S PREROUTING | awk -v chain="$chain" '
    $1=="-A" {position++}
    $1=="-A" && $2=="PREROUTING" && $3=="-j" && $4==chain {if(found++) print position}
  ' | sort -rn)
  for position in "${older_jumps[@]}"; do
    "$tool" -w -t raw -D PREROUTING "$position"
  done
done
echo "postgres ingress guard: IPv4/IPv6 external TCP 5432 blocked; loopback preserved"
