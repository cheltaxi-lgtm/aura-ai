#!/usr/bin/env bash
# One-time provisioning of the Android release signing keystore on the server.
# Stores the keystore outside the deploy tree and writes credentials to .env.local.
#
# Usage: bash hosting/generate-release-keystore.sh [/opt/aura-ai]
set -euo pipefail

APP_ROOT="${1:-$(cd "$(dirname "$0")/.." && pwd)}"
ENV_FILE="${APP_ROOT}/.env.local"
SECRETS_DIR="${ANDROID_SECRETS_DIR:-/opt/secrets}"
KEYSTORE="${ANDROID_KEYSTORE_PATH:-${SECRETS_DIR}/zovus-release.jks}"
ALIAS="${ANDROID_KEY_ALIAS:-zovus}"

upsert_env() {
  local key="$1"
  local value="$2"
  touch "${ENV_FILE}"
  if grep -q "^${key}=" "${ENV_FILE}" 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${value}|" "${ENV_FILE}"
  else
    echo "${key}=${value}" >> "${ENV_FILE}"
  fi
}

if [ -f "${KEYSTORE}" ]; then
  if grep -q '^ANDROID_KEYSTORE_PASSWORD=.' "${ENV_FILE}" \
    && grep -q '^ANDROID_KEY_PASSWORD=.' "${ENV_FILE}" \
    && grep -q '^ANDROID_KEY_ALIAS=.' "${ENV_FILE}"; then
    echo ">>> Release keystore and credentials already exist: ${KEYSTORE}"
    exit 0
  fi
  echo "ERROR: Release keystore exists but its credentials are missing from ${ENV_FILE}."
  echo "Restore the credentials or archive the unusable keystore before provisioning a new key."
  exit 1
fi

if ! command -v keytool >/dev/null 2>&1; then
  echo "ERROR: keytool not found — install OpenJDK (e.g. apt install openjdk-21-jdk)"
  exit 1
fi

mkdir -p "${SECRETS_DIR}"
chmod 700 "${SECRETS_DIR}"

STORE_PASS="$(openssl rand -base64 24 | tr -d '/+=' | head -c 32)"
KEY_PASS="${STORE_PASS}"

echo ">>> Generating release keystore at ${KEYSTORE} (alias ${ALIAS})..."
keytool -genkeypair -v \
  -keystore "${KEYSTORE}" \
  -alias "${ALIAS}" \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -storepass "${STORE_PASS}" \
  -keypass "${KEY_PASS}" \
  -dname "CN=Zovus, OU=Mobile, O=Zovus, L=Moscow, ST=Moscow, C=RU"

chmod 600 "${KEYSTORE}"

upsert_env "ANDROID_KEYSTORE_PATH" "${KEYSTORE}"
upsert_env "ANDROID_KEYSTORE_PASSWORD" "${STORE_PASS}"
upsert_env "ANDROID_KEY_ALIAS" "${ALIAS}"
upsert_env "ANDROID_KEY_PASSWORD" "${KEY_PASS}"

SHA256="$(
  node "${APP_ROOT}/scripts/print-android-cert-sha.mjs" \
    --keystore "${KEYSTORE}" \
    --alias "${ALIAS}" \
    --storepass "${STORE_PASS}" \
    | grep 'SHA-256 (colonless' | sed -E 's/.*: //' | tr -d '\r\n'
)"

if [ -n "${SHA256}" ]; then
  upsert_env "ANDROID_ASSETLINKS_SHA256" "${SHA256}"
  echo ">>> ANDROID_ASSETLINKS_SHA256=${SHA256}"
fi

echo ">>> Release keystore ready. BACK UP ${KEYSTORE} and .env.local credentials offline."
echo ">>> Users on old debug-signed builds must uninstall before installing the release-signed APK."
