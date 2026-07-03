#!/usr/bin/env bash
# Roll back /opt/aura-ai to a previous deploy snapshot (no OpenRouter / secret edits).
#
# Usage:
#   bash hosting/rollback-deploy.sh              # list snapshots
#   bash hosting/rollback-deploy.sh list
#   bash hosting/rollback-deploy.sh restore <name>
set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/aura-ai}"
SNAP_DIR="${DEPLOY_SNAPSHOT_DIR:-/opt/aura-ai-deploy-snapshots}"
SERVICE="${DEPLOY_SERVICE:-aura-ai}"

mkdir -p "${SNAP_DIR}"

list_snapshots() {
  ls -1dt "${SNAP_DIR}"/*/ 2>/dev/null | while read -r dir; do
    base="$(basename "${dir%/}")"
    meta="${dir}/META.txt"
    if [ -f "${meta}" ]; then
      echo "${base}  $(tr '\n' ' ' < "${meta}")"
    else
      echo "${base}"
    fi
  done
}

save_snapshot() {
  local label="${1:-manual}"
  local stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  local dest="${SNAP_DIR}/${stamp}-${label}"
  echo ">>> Saving snapshot ${dest}"
  mkdir -p "${dest}"
  tar -czf "${dest}/aura-ai.tgz" \
    -C "$(dirname "${APP_ROOT}")" \
    --exclude=node_modules \
    --exclude=.next \
    "$(basename "${APP_ROOT}")"
  {
    echo "created_utc=${stamp}"
    echo "label=${label}"
    echo "app_root=${APP_ROOT}"
    echo "version_code=$(grep -Eo 'versionCode [0-9]+' "${APP_ROOT}/mobile/android/app/build.gradle" 2>/dev/null | awk '{print $2}' || echo unknown)"
  } > "${dest}/META.txt"
  echo ">>> Snapshot saved: ${dest}"
}

restore_snapshot() {
  local name="$1"
  local src="${SNAP_DIR}/${name}"
  local tgz="${src}/aura-ai.tgz"
  if [ ! -f "${tgz}" ]; then
    echo "ERROR: snapshot not found: ${name}"
    exit 1
  fi
  echo ">>> Restoring ${name} -> ${APP_ROOT}"
  systemctl stop "${SERVICE}" || true
  local backup="${SNAP_DIR}/pre-restore-$(date -u +%Y%m%dT%H%M%SZ)"
  save_snapshot "pre-restore" >/dev/null
  rm -rf "${APP_ROOT}.rollback-staging"
  mkdir -p "${APP_ROOT}.rollback-staging"
  tar -xzf "${tgz}" -C "${APP_ROOT}.rollback-staging"
  rsync -a --delete "${APP_ROOT}.rollback-staging/$(basename "${APP_ROOT}")/" "${APP_ROOT}/"
  rm -rf "${APP_ROOT}.rollback-staging"
  cd "${APP_ROOT}"
  npm ci
  npm run build
  systemctl restart "${SERVICE}"
  sleep 2
  systemctl is-active "${SERVICE}"
  curl -sS -o /dev/null -w "health=%{http_code}\n" http://127.0.0.1:3000/api/health
  echo ">>> Rollback complete from ${name}"
}

cmd="${1:-list}"
case "${cmd}" in
  list)
    list_snapshots
    ;;
  save)
    save_snapshot "${2:-manual}"
    ;;
  restore)
    if [ -z "${2:-}" ]; then
      echo "Usage: bash hosting/rollback-deploy.sh restore <snapshot-name>"
      exit 1
    fi
    restore_snapshot "$2"
    ;;
  *)
    echo "Usage: bash hosting/rollback-deploy.sh [list|save [label]|restore <name>]"
    exit 1
    ;;
esac
