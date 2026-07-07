#!/usr/bin/env bash
PID=$(systemctl show aura-ai -p MainPID --value)
echo "pid=$PID"
tr '\0' '\n' < "/proc/${PID}/environ" | grep OPENROUTER || echo "NO_OPENROUTER_ENV"
echo "---routes---"
ip route | grep wg-foxdpi || echo "NO_WG_ROUTES"
bash /var/lib/aura-ai/openrouter-vpn/openrouter-routes.sh 2>/dev/null || true
ip route | grep wg-foxdpi | head -5
