#!/usr/bin/env bash
# Ensure release keystore exists before building a production APK.
set -euo pipefail

APP_ROOT="${1:-$(cd "$(dirname "$0")/.." && pwd)}"
bash "${APP_ROOT}/hosting/generate-release-keystore.sh" "${APP_ROOT}"
