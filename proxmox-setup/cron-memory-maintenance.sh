#!/bin/bash
# Daily long-term memory maintenance (re-embed facts stored without a vector).
# Installed in the ubuntu user's crontab; survives deploys because it lives in
# the repo. See proxmox-setup/install-memory-cron.sh for installation.
set -euo pipefail
cd /opt/aura-ai || exit 1
export PATH="/usr/bin:/usr/local/bin:$PATH"
set -a
# shellcheck disable=SC1090
source <(grep -E '^(DATABASE_URL|OPENROUTER_API_KEY|MEMORY_EMBED_MODEL)=' .env.local | sed 's/\r$//')
set +a
exec /usr/bin/node scripts/memory-maintenance.mjs "${1:-500}"
