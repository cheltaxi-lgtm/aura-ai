#!/usr/bin/env bash
# Build EnvironmentFile for aura-ai-async-jobs from .env.local.
# Shared keys: hosting/async-jobs-shared.env.keys (single source of truth).
# Worker must NOT read .env.local — only this minimal file (mode 600).
set -euo pipefail

APP_ROOT="${1:-/opt/aura-ai}"
SRC="${APP_ROOT}/.env.local"
DEST="${APP_ROOT}/.env.async-jobs"
KEYS_FILE="${APP_ROOT}/hosting/async-jobs-shared.env.keys"
DEFAULT_SE_PROXY="http://91.184.240.82:3128"

if [ ! -f "$SRC" ]; then
  echo "ERROR: missing ${SRC}" >&2
  exit 1
fi

value_of() {
  local key="$1"
  grep -E "^${key}=" "$SRC" | tail -n1 | cut -d= -f2- | tr -d '\r' || true
}

umask 077
{
  DATABASE_URL="$(value_of DATABASE_URL)"
  ASYNC_JOB_WORKER_SECRET="$(value_of ASYNC_JOB_WORKER_SECRET)"
  [ -n "$DATABASE_URL" ] || { echo "ERROR: DATABASE_URL missing in ${SRC}" >&2; exit 1; }
  [ -n "$ASYNC_JOB_WORKER_SECRET" ] || { echo "ERROR: ASYNC_JOB_WORKER_SECRET is missing in ${SRC}" >&2; exit 1; }

  printf 'DATABASE_URL=%s\n' "$DATABASE_URL"
  printf 'ASYNC_JOB_WORKER_SECRET=%s\n' "$ASYNC_JOB_WORKER_SECRET"
  printf 'ASYNC_JOB_APP_URL=http://127.0.0.1:3000\n'

  if [ -f "$KEYS_FILE" ]; then
    while IFS= read -r line || [ -n "$line" ]; do
      line="$(printf '%s' "$line" | tr -d '\r')"
      case "$line" in
        ""|\#*) continue ;;
      esac
      key="$(printf '%s' "$line" | awk '{print $1}')"
      [ -n "$key" ] || continue
      val="$(value_of "$key")"
      if [ -n "$val" ]; then
        printf '%s=%s\n' "$key" "$val"
      fi
    done <"$KEYS_FILE"
  else
    echo "WARN: missing ${KEYS_FILE}; writing minimal defaults only" >&2
  fi

  # Defaults when unset in .env.local
  if [ -z "$(value_of DB_POOL_MAX_WORKER)" ]; then
    printf 'DB_POOL_MAX_WORKER=5\n'
  fi
  if [ -z "$(value_of ASYNC_REPORT_CONCURRENCY)" ]; then
    printf 'ASYNC_REPORT_CONCURRENCY=2\n'
  fi
  # Sweden egress — required; direct openrouter.ai from Beget times out.
  if [ -z "$(value_of OPENROUTER_HTTPS_PROXY)" ]; then
    printf 'OPENROUTER_HTTPS_PROXY=%s\n' "$DEFAULT_SE_PROXY"
  fi
} >"$DEST"

if id aura-ai >/dev/null 2>&1; then
  chown aura-ai:aura-ai "$DEST"
fi
chmod 600 "$DEST"

# Drift guard: fail loud if OpenRouter key present without proxy (common footgun).
if grep -q '^OPENROUTER_API_KEY=.' "$DEST" && ! grep -q '^OPENROUTER_HTTPS_PROXY=.' "$DEST"; then
  echo "ERROR: OPENROUTER_API_KEY set but OPENROUTER_HTTPS_PROXY missing in ${DEST}" >&2
  exit 1
fi

echo "Wrote ${DEST} (shared keys from ${KEYS_FILE})"
