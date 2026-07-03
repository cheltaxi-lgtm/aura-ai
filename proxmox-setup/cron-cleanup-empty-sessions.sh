#!/bin/bash
# Nightly cleanup of abandoned empty consultation stubs.
set -euo pipefail
cd /opt/aura-ai || exit 1
export PATH="/usr/bin:/usr/local/bin:$PATH"
set -a
# shellcheck disable=SC1090
source <(grep -E '^DATABASE_URL=' .env.local | sed 's/\r$//')
set +a
exec /usr/bin/node scripts/cleanup-empty-sessions.mjs "${1:-500}"
