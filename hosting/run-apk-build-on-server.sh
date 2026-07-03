#!/usr/bin/env bash
set -euo pipefail
cd /opt/aura-ai
sed -i 's/versionCode [0-9]\+/versionCode 5/' mobile/android/app/build.gradle
sed -i 's/versionName "[^"]*"/versionName "1.0.5"/' mobile/android/app/build.gradle
export ANDROID_VERSION_NAME=1.0.5
export ANDROID_RELEASE_NOTES='Исправлена установка обновлений, улучшена нижняя навигация'
bash hosting/build-android-apk.sh /opt/aura-ai
curl -sf http://127.0.0.1:3000/api/app/android-version
