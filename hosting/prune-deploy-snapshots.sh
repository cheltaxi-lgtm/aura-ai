#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-/opt/aura-ai-deploy-snapshots}"
KEEP="${2:-3}"
MODE="${3:---dry-run}"

if ! [[ "$KEEP" =~ ^[0-9]+$ ]] || [ "$KEEP" -lt 2 ] || [ "$KEEP" -gt 20 ]; then
  echo "Refusing snapshot retention outside 2..20: $KEEP" >&2
  exit 2
fi
if [ "$MODE" != "--dry-run" ] && [ "$MODE" != "--apply" ]; then
  echo "Mode must be --dry-run or --apply" >&2
  exit 2
fi

if [ ! -d "$ROOT" ]; then
  echo "Snapshot root does not exist: $ROOT" >&2
  exit 2
fi
ROOT="$(readlink -f "$ROOT")"
if [ -z "$ROOT" ] || [ "$ROOT" = "/" ]; then
  echo "Refusing unsafe snapshot root" >&2
  exit 2
fi
if [ "$MODE" = "--apply" ] && [ "$ROOT" != "/opt/aura-ai-deploy-snapshots" ]; then
  echo "Refusing destructive mode outside /opt/aura-ai-deploy-snapshots: $ROOT" >&2
  exit 2
fi

mapfile -d '' SNAPSHOTS < <(
  find "$ROOT" -mindepth 1 -maxdepth 1 -type d -name 'release-*' -printf '%T@ %p\0' \
    | sort -z -nr \
    | cut -z -d ' ' -f 2-
)

if [ "${#SNAPSHOTS[@]}" -le "$KEEP" ]; then
  echo "Snapshot retention: ${#SNAPSHOTS[@]} present, keeping all"
  exit 0
fi

for ((index = KEEP; index < ${#SNAPSHOTS[@]}; index += 1)); do
  candidate="${SNAPSHOTS[$index]}"
  resolved="$(readlink -f "$candidate")"
  if [ "$(dirname "$resolved")" != "$ROOT" ] || [[ "$(basename "$resolved")" != release-* ]]; then
    echo "Refusing unsafe snapshot path: $candidate" >&2
    exit 2
  fi
  if [ "$MODE" = "--apply" ]; then
    rm -rf -- "$resolved"
    echo "Removed old deploy snapshot: $resolved"
  else
    echo "Would remove old deploy snapshot: $resolved"
  fi
done
