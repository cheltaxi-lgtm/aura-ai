#!/usr/bin/env bash
# Apply Module A Android env vars on production VM (.env.local).
# Run on VM: bash /opt/aura-ai/scripts/apply-module-a-env.sh
set -euo pipefail

ENV_FILE="${1:-/opt/aura-ai/.env.local}"
BASE_URL="${NEXT_PUBLIC_APP_URL:-https://zovus.ru}"

upsert() {
  local key="$1"
  local value="$2"
  if grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
  else
    echo "${key}=${value}" >> "$ENV_FILE"
  fi
}

touch "$ENV_FILE"

upsert "ANDROID_VERSION_CODE" "${ANDROID_VERSION_CODE:-1}"
upsert "ANDROID_VERSION_NAME" "${ANDROID_VERSION_NAME:-1.0.0}"
upsert "ANDROID_MIN_VERSION_CODE" "${ANDROID_MIN_VERSION_CODE:-1}"
upsert "ANDROID_APK_URL" "${ANDROID_APK_URL:-${BASE_URL}/releases/zovus-latest.apk}"
upsert "NEXT_PUBLIC_ANDROID_APK_URL" "${NEXT_PUBLIC_ANDROID_APK_URL:-${BASE_URL}/releases/zovus-latest.apk}"
upsert "ANDROID_RELEASE_NOTES" "${ANDROID_RELEASE_NOTES:-Официальное приложение Zovus для Android}"
upsert "NEXT_PUBLIC_GITHUB_REPO" "${NEXT_PUBLIC_GITHUB_REPO:-cheltaxi-lgtm/aura-ai}"

if [ -n "${ANDROID_ASSETLINKS_SHA256:-}" ]; then
  upsert "ANDROID_ASSETLINKS_SHA256" "$ANDROID_ASSETLINKS_SHA256"
fi

echo "Module A env applied to $ENV_FILE"
grep -E '^ANDROID_|^NEXT_PUBLIC_ANDROID|^NEXT_PUBLIC_GITHUB_REPO=' "$ENV_FILE" | sed 's/=.*/=***/'
