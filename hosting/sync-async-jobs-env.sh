#!/usr/bin/env bash
# Build a minimal EnvironmentFile for the natal async worker (no LLM/OAuth secrets).
# DATABASE_URL is required for claim/reaper — accepted residual blast radius if aura-ai is compromised.
set -euo pipefail

APP_ROOT="${1:-/opt/aura-ai}"
SRC="${APP_ROOT}/.env.local"
DEST="${APP_ROOT}/.env.async-jobs"

if [ ! -f "$SRC" ]; then
  echo "ERROR: missing ${SRC}" >&2
  exit 1
fi

value_of() {
  local key="$1"
  grep -E "^${key}=" "$SRC" | tail -n1 | cut -d= -f2-
}

umask 077
{
  DATABASE_URL="$(value_of DATABASE_URL)"
  ASYNC_JOB_WORKER_SECRET="$(value_of ASYNC_JOB_WORKER_SECRET)"
  [ -n "$DATABASE_URL" ] || { echo "ERROR: DATABASE_URL missing in ${SRC}" >&2; exit 1; }
  [ -n "$ASYNC_JOB_WORKER_SECRET" ] || { echo "ERROR: ASYNC_JOB_WORKER_SECRET missing in ${SRC}" >&2; exit 1; }

  printf 'DATABASE_URL=%s\n' "$DATABASE_URL"
  # Variable name must match for deploy secret-scan (dynamic printf allowlist).
  printf 'ASYNC_JOB_WORKER_SECRET=%s\n' "$ASYNC_JOB_WORKER_SECRET"
  printf 'ASYNC_JOB_APP_URL=http://127.0.0.1:3000\n'

  for key in ASYNC_JOB_POLL_MS ASYNC_JOB_CONCURRENCY ASYNC_JOB_REQUEST_TIMEOUT_MS ASYNC_JOB_STALE_RUNNING_MS ASYNC_JOB_TIMEOUT_GRACE_MS; do
    val="$(value_of "$key")"
    if [ -n "$val" ]; then
      printf '%s=%s\n' "$key" "$val"
    fi
  done
} >"$DEST"

if id aura-ai >/dev/null 2>&1; then
  chown aura-ai:aura-ai "$DEST"
fi
chmod 600 "$DEST"
echo "Wrote ${DEST}"
