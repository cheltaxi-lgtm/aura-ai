#!/usr/bin/env bash
set -euo pipefail
cd /opt/aura-ai
set -a
# shellcheck disable=SC1091
source <(grep -E '^(OPENROUTER_API_KEY|OPENROUTER_HTTPS_PROXY)=' .env.local | sed 's/\r$//')
set +a
node scripts/openrouter-vpn/test-or-fetch.mjs
