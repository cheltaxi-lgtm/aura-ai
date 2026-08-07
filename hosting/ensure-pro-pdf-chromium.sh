#!/usr/bin/env bash
# Install Chromium for Pro PDF rendering (Beget/Debian). Idempotent.
set -euo pipefail
APP_DIR="${1:-/opt/aura-ai}"
ENV_FILE="$APP_DIR/.env.local"

if command -v chromium-browser >/dev/null 2>&1; then
  CHROME="$(command -v chromium-browser)"
elif command -v chromium >/dev/null 2>&1; then
  CHROME="$(command -v chromium)"
elif [ -x /usr/bin/chromium-browser ]; then
  CHROME=/usr/bin/chromium-browser
elif [ -x /usr/bin/chromium ]; then
  CHROME=/usr/bin/chromium
else
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq chromium-browser || apt-get install -y -qq chromium
  CHROME="$(command -v chromium-browser || command -v chromium || true)"
fi

if [ -z "${CHROME:-}" ] || [ ! -x "$CHROME" ]; then
  echo "Chromium not found after install attempt" >&2
  exit 1
fi

echo "Chromium: $CHROME"

if [ -f "$ENV_FILE" ]; then
  if grep -q '^PRO_PDF_CHROMIUM_PATH=' "$ENV_FILE"; then
    sed -i "s|^PRO_PDF_CHROMIUM_PATH=.*|PRO_PDF_CHROMIUM_PATH=$CHROME|" "$ENV_FILE"
  else
    echo "PRO_PDF_CHROMIUM_PATH=$CHROME" >> "$ENV_FILE"
  fi
  if ! grep -q '^PRO_PDF_ENABLED=' "$ENV_FILE"; then
    echo "PRO_PDF_ENABLED=true" >> "$ENV_FILE"
  else
    sed -i 's/^PRO_PDF_ENABLED=.*/PRO_PDF_ENABLED=true/' "$ENV_FILE"
  fi
fi

echo "PRO_PDF_ENABLED wired in $ENV_FILE"
