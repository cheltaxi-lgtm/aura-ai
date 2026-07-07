#!/usr/bin/env bash
set -euo pipefail
mkdir -p /var/lib/aura-ai/openrouter-vpn
CLIENT_PRIV="$(wg genkey)"
CLIENT_PUB="$(printf '%s' "$CLIENT_PRIV" | wg pubkey)"
PSK="$(wg genpsk)"
cat > /var/lib/aura-ai/openrouter-vpn/client-keys.env <<EOF
CLIENT_PRIV=${CLIENT_PRIV}
CLIENT_PUB=${CLIENT_PUB}
PSK=${PSK}
EOF
chmod 600 /var/lib/aura-ai/openrouter-vpn/client-keys.env
echo "CLIENT_PUB=${CLIENT_PUB}"
echo "PSK=${PSK}"
