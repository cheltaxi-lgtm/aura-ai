#!/bin/bash
# Daily PostgreSQL backup with 14-day rotation.
set -euo pipefail

REPO="/opt/aura-ai"
ENV_FILE="${REPO}/.env.local"
BACKUP_DIR="${REPO}/backups/pg"
RETENTION_DAYS="${PG_BACKUP_RETENTION_DAYS:-14}"

mkdir -p "$BACKUP_DIR"

if [ ! -f "$ENV_FILE" ]; then
  echo "[pg-backup] missing $ENV_FILE"
  exit 1
fi

DATABASE_URL="$(grep '^DATABASE_URL=' "$ENV_FILE" | head -1 | cut -d= -f2- | sed 's/\r$//')"
if [ -z "${DATABASE_URL// /}" ]; then
  echo "[pg-backup] DATABASE_URL not set"
  exit 1
fi

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="${BACKUP_DIR}/auraai-${STAMP}.sql.gz"

export PGPASSWORD=""
pg_dump "$DATABASE_URL" --no-owner --no-acl | gzip -9 > "$OUT"
chmod 600 "$OUT"

find "$BACKUP_DIR" -name 'auraai-*.sql.gz' -type f -mtime +"$RETENTION_DAYS" -delete
echo "[pg-backup] wrote $OUT ($(du -h "$OUT" | cut -f1))"
