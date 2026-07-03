#!/usr/bin/env bash
# Build and publish a signed release APK on the production server.
set -euo pipefail

APP_ROOT="${1:-/opt/aura-ai}"
export REQUIRE_RELEASE_SIGNING=1

bash "${APP_ROOT}/hosting/ensure-android-release-keystore.sh" "${APP_ROOT}"
bash "${APP_ROOT}/hosting/build-android-apk.sh" "${APP_ROOT}"

curl -sf "http://127.0.0.1:3000/api/app/android-version" | head -c 400
echo ""
