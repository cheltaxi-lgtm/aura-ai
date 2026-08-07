#!/usr/bin/env bash
# Run hd-repair-meta-reports.sql against the production DB (reads DATABASE_URL
# from the live .env.local). One-off repair — safe to re-run (idempotent).
set -euo pipefail
APP_DIR="${DEPLOY_DIR:-/opt/aura-ai}"
SQL_FILE="${1:-/tmp/hd-repair-meta-reports.sql}"

DBURL="$(grep -E '^DATABASE_URL=' "$APP_DIR/.env.local" | head -1 | cut -d= -f2- | tr -d '\r')"
[ -n "$DBURL" ] || { echo "DATABASE_URL not found in $APP_DIR/.env.local" >&2; exit 1; }

psql "$DBURL" -v ON_ERROR_STOP=1 -f "$SQL_FILE"
