#!/usr/bin/env bash
# Build Capacitor Android debug APK and publish to public/releases/zovus-latest.apk
# Usage: bash hosting/build-android-apk.sh [/opt/aura-ai]
set -euo pipefail

APP_ROOT="${1:-$(cd "$(dirname "$0")/.." && pwd)}"
ANDROID_HOME="${ANDROID_HOME:-/opt/android-sdk}"
APK_OUT="${APP_ROOT}/public/releases/zovus-latest.apk"
CMDLINE_TOOLS="${ANDROID_HOME}/cmdline-tools/latest"

export ANDROID_HOME
export PATH="${PATH}:${CMDLINE_TOOLS}/bin:${ANDROID_HOME}/platform-tools"

ensure_java() {
  if command -v java >/dev/null 2>&1; then
    java -version
    return
  fi
  echo ">>> Installing OpenJDK 21..."
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get install -y openjdk-21-jdk unzip curl
}

ensure_android_sdk() {
  if [ -x "${CMDLINE_TOOLS}/bin/sdkmanager" ]; then
    return
  fi
  echo ">>> Bootstrapping Android SDK to ${ANDROID_HOME}..."
  mkdir -p "${ANDROID_HOME}/cmdline-tools"
  tmp="$(mktemp -d)"
  curl -fsSL "https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip" -o "${tmp}/cmdline.zip"
  unzip -q "${tmp}/cmdline.zip" -d "${tmp}/cmdline"
  rm -rf "${CMDLINE_TOOLS}"
  mv "${tmp}/cmdline/cmdline-tools" "${CMDLINE_TOOLS}"
  rm -rf "${tmp}"
  yes | sdkmanager --licenses >/dev/null || true
  sdkmanager "platform-tools" "platforms;android-36" "build-tools;36.0.0"
}

echo ">>> App root: ${APP_ROOT}"
ensure_java
ensure_android_sdk

GRADLE="${APP_ROOT}/mobile/android/app/build.gradle"
ENV_FILE="${APP_ROOT}/.env.local"
MANIFEST="${APP_ROOT}/public/releases/android-version.json"

# versionCode source of truth: the max of every place a code can live.
# build.gradle gets overwritten by each deploy from the dev machine, so on its
# own it can go backwards and produce duplicate versionCodes (two different
# APKs with the same number => installed apps never see the update).
# .env.local and public/releases/ both survive deploys, so including them
# guarantees the counter is strictly monotonic.
GRADLE_CODE="$(grep -E 'versionCode [0-9]+' "${GRADLE}" | head -1 | grep -Eo '[0-9]+' || echo "0")"
ENV_CODE="$(grep -E '^ANDROID_VERSION_CODE=' "${ENV_FILE}" 2>/dev/null | head -1 | cut -d= -f2 | tr -dc '0-9' || true)"
MANIFEST_CODE="$(grep -Eo '"versionCode":[[:space:]]*[0-9]+' "${MANIFEST}" 2>/dev/null | grep -Eo '[0-9]+' || true)"
BASE_CODE="${GRADLE_CODE:-0}"
for c in "${ENV_CODE:-0}" "${MANIFEST_CODE:-0}"; do
  if [ "${c:-0}" -gt "${BASE_CODE}" ]; then BASE_CODE="${c}"; fi
done
NEW_CODE="$((BASE_CODE + 1))"

CURRENT_NAME="$(grep -E 'versionName "' "${GRADLE}" | head -1 | sed -E 's/.*versionName "([^"]+)".*/\1/')"
NEW_NAME="${ANDROID_VERSION_NAME:-${CURRENT_NAME}}"

sed -i -E "s/versionCode [0-9]+/versionCode ${NEW_CODE}/" "${GRADLE}"
sed -i -E "s/versionName \"[^\"]+\"/versionName \"${NEW_NAME}\"/" "${GRADLE}"
echo ">>> Android versionCode ${BASE_CODE} -> ${NEW_CODE} (${NEW_NAME}) [gradle=${GRADLE_CODE} env=${ENV_CODE:-none} manifest=${MANIFEST_CODE:-none}]"

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

upsert_env "ANDROID_VERSION_CODE" "${NEW_CODE}"
upsert_env "ANDROID_VERSION_NAME" "${NEW_NAME}"
if [ -n "${ANDROID_RELEASE_NOTES:-}" ]; then
  upsert_env "ANDROID_RELEASE_NOTES" "${ANDROID_RELEASE_NOTES}"
fi
if [ -n "${ANDROID_MIN_VERSION_CODE:-}" ]; then
  upsert_env "ANDROID_MIN_VERSION_CODE" "${ANDROID_MIN_VERSION_CODE}"
fi

cd "${APP_ROOT}/mobile"
npm ci
npx cap sync android

cd android
chmod +x gradlew

KEYSTORE_PROPS="${APP_ROOT}/mobile/android/keystore.properties"
APK_SRC=""
if [ -n "${ANDROID_KEYSTORE_PATH:-}" ] && [ -f "${ANDROID_KEYSTORE_PATH}" ] \
  && [ -n "${ANDROID_KEYSTORE_PASSWORD:-}" ] \
  && [ -n "${ANDROID_KEY_ALIAS:-}" ] \
  && [ -n "${ANDROID_KEY_PASSWORD:-}" ]; then
  cat > "${KEYSTORE_PROPS}" <<EOF
storeFile=${ANDROID_KEYSTORE_PATH}
storePassword=${ANDROID_KEYSTORE_PASSWORD}
keyAlias=${ANDROID_KEY_ALIAS}
keyPassword=${ANDROID_KEY_PASSWORD}
EOF
  echo ">>> Building signed release APK..."
  ./gradlew assembleRelease --no-daemon
  APK_SRC="app/build/outputs/apk/release/app-release.apk"
else
  echo ">>> WARN: release keystore not configured — building debug APK"
  ./gradlew assembleDebug --no-daemon
  APK_SRC="app/build/outputs/apk/debug/app-debug.apk"
fi

mkdir -p "${APP_ROOT}/public/releases"
cp -f "${APK_SRC}" "${APK_OUT}"
node "${APP_ROOT}/scripts/write-android-release-manifest.mjs"
ls -lh "${APK_OUT}"
echo "APK ready: ${APK_OUT}"

# Next.js picks up new public/ files after restart (runtime cache).
if systemctl is-active --quiet aura-ai 2>/dev/null; then
  systemctl restart aura-ai
  echo "Restarted aura-ai to serve updated APK"
fi
