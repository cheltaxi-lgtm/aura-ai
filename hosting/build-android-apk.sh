#!/usr/bin/env bash
# Build Capacitor Android release APK and publish to public/releases/zovus-latest.apk
# Usage: bash hosting/build-android-apk.sh [/opt/aura-ai]
set -euo pipefail

APP_ROOT="${1:-$(cd "$(dirname "$0")/.." && pwd)}"
ANDROID_HOME="${ANDROID_HOME:-/opt/android-sdk}"
APK_OUT="${APP_ROOT}/public/releases/zovus-latest.apk"
CMDLINE_TOOLS="${ANDROID_HOME}/cmdline-tools/latest"
ENV_FILE="${APP_ROOT}/.env.local"
DEFAULT_KEYSTORE="${ANDROID_SECRETS_DIR:-/opt/secrets}/zovus-release.jks"

export ANDROID_HOME
export PATH="${PATH}:${CMDLINE_TOOLS}/bin:${ANDROID_HOME}/platform-tools"

load_keystore_env() {
  if [ -f "${ENV_FILE}" ]; then
    set -a
    # shellcheck disable=SC1090
    source <(grep -E '^(ANDROID_(KEYSTORE_|KEY_|VERSION_)|ANDROID_REINSTALL_BELOW_CODE|VK_ANDROID_)' "${ENV_FILE}" 2>/dev/null | sed 's/\r$//') || true
    set +a
  fi
  ANDROID_KEYSTORE_PATH="${ANDROID_KEYSTORE_PATH:-${DEFAULT_KEYSTORE}}"
  ANDROID_KEY_ALIAS="${ANDROID_KEY_ALIAS:-zovus}"
}

verify_release_apk() {
  local apk="$1"
  if [ ! -f "${apk}" ]; then
    echo "ERROR: APK missing at ${apk}"
    return 1
  fi
  local apksigner=""
  if [ -n "${ANDROID_HOME:-}" ] && [ -d "${ANDROID_HOME}/build-tools" ]; then
    apksigner="$(find "${ANDROID_HOME}/build-tools" -name apksigner -type f 2>/dev/null | sort -V | tail -1 || true)"
  fi
  if [ -n "${apksigner}" ] && [ -x "${apksigner}" ]; then
    "${apksigner}" verify --print-certs "${apk}" >/dev/null
    echo ">>> Verified release signature (apksigner)"
    return 0
  fi
  if jarsigner -verify "${apk}" >/dev/null 2>&1; then
    echo ">>> Verified release signature (jarsigner)"
    return 0
  fi
  echo "ERROR: APK is not signed — refusing to publish ${apk}"
  return 1
}

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
MANIFEST="${APP_ROOT}/public/releases/android-version.json"

load_keystore_env

# Production server builds must never publish a debug-signed APK.
if [ "${REQUIRE_RELEASE_SIGNING:-0}" = "1" ] || [ "${APP_ROOT}" = "/opt/aura-ai" ]; then
  REQUIRE_RELEASE_SIGNING=1
fi

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
upsert_env "ANDROID_REINSTALL_BELOW_CODE" "${ANDROID_REINSTALL_BELOW_CODE:-13}"

cd "${APP_ROOT}/mobile"
npm ci
npx cap sync android

cd android
chmod +x gradlew

KEYSTORE_PROPS="${APP_ROOT}/mobile/android/keystore.properties"
APK_SRC=""
HAS_KEYSTORE=0
if [ -n "${ANDROID_KEYSTORE_PATH:-}" ] && [ -f "${ANDROID_KEYSTORE_PATH}" ] \
  && [ -n "${ANDROID_KEYSTORE_PASSWORD:-}" ] \
  && [ -n "${ANDROID_KEY_ALIAS:-}" ] \
  && [ -n "${ANDROID_KEY_PASSWORD:-}" ]; then
  HAS_KEYSTORE=1
  cat > "${KEYSTORE_PROPS}" <<EOF
storeFile=${ANDROID_KEYSTORE_PATH}
storePassword=${ANDROID_KEYSTORE_PASSWORD}
keyAlias=${ANDROID_KEY_ALIAS}
keyPassword=${ANDROID_KEY_PASSWORD}
EOF
  echo ">>> Building signed release APK (keystore ${ANDROID_KEYSTORE_PATH})..."
  ./gradlew assembleRelease --no-daemon
  APK_SRC="app/build/outputs/apk/release/app-release.apk"
elif [ "${REQUIRE_RELEASE_SIGNING}" = "1" ]; then
  rm -f "${KEYSTORE_PROPS}"
  echo "ERROR: Release keystore not configured."
  echo "Run: bash hosting/ensure-android-release-keystore.sh ${APP_ROOT}"
  exit 1
else
  rm -f "${KEYSTORE_PROPS}"
  echo ">>> WARN: release keystore not configured — building debug APK (local dev only)"
  ./gradlew assembleDebug --no-daemon
  APK_SRC="app/build/outputs/apk/debug/app-debug.apk"
fi

if [ "${HAS_KEYSTORE}" = "1" ]; then
  verify_release_apk "${APK_SRC}"
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
