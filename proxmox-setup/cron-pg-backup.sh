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

# Prefer host pg_dump; on Beget production Postgres may run in Docker only.
if command -v pg_dump >/dev/null 2>&1; then
  pg_dump "$DATABASE_URL" --no-owner --no-acl | gzip -9 > "$OUT"
elif docker ps --format '{{.Names}}' 2>/dev/null | grep -qx 'auraai-postgres'; then
  docker exec auraai-postgres pg_dump -U auraai --no-owner --no-acl auraai | gzip -9 > "$OUT"
else
  echo "[pg-backup] neither pg_dump nor auraai-postgres container available"
  exit 1
fi
chmod 600 "$OUT"

find "$BACKUP_DIR" -name 'auraai-*.sql.gz' -type f -mtime +"$RETENTION_DAYS" -delete
echo "[pg-backup] wrote $OUT ($(du -h "$OUT" | cut -f1))"
