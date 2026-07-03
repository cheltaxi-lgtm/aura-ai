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
CURRENT_CODE="$(grep -E 'versionCode [0-9]+' "${GRADLE}" | head -1 | grep -Eo '[0-9]+' || echo "1")"
NEW_CODE="$((CURRENT_CODE + 1))"
CURRENT_NAME="$(grep -E 'versionName "' "${GRADLE}" | head -1 | sed -E 's/.*versionName "([^"]+)".*/\1/')"
NEW_NAME="${ANDROID_VERSION_NAME:-${CURRENT_NAME}}"

sed -i "s/versionCode ${CURRENT_CODE}/versionCode ${NEW_CODE}/" "${GRADLE}"
sed -i "s/versionName \"${CURRENT_NAME}\"/versionName \"${NEW_NAME}\"/" "${GRADLE}"
echo ">>> Android versionCode ${CURRENT_CODE} -> ${NEW_CODE} (${NEW_NAME})"

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
./gradlew assembleDebug --no-daemon

mkdir -p "${APP_ROOT}/public/releases"
cp -f app/build/outputs/apk/debug/app-debug.apk "${APK_OUT}"
ls -lh "${APK_OUT}"
echo "APK ready: ${APK_OUT}"

# Next.js picks up new public/ files after restart (runtime cache).
if systemctl is-active --quiet aura-ai 2>/dev/null; then
  systemctl restart aura-ai
  echo "Restarted aura-ai to serve updated APK"
fi
