#!/bin/bash
# Apply SEO redirects (HTTP→HTTPS, www→apex) to NPM zovus.ru proxy host.
# Run on homeserver (NPM host), not on aura-ai VM.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONF="/opt/homeserver/npm/data/nginx/proxy_host/61.conf"
REDIRECTS="$SCRIPT_DIR/npm_zovus_seo_redirects.conf"
MARKER="# >>> zovus-seo-redirects >>>"

if [ ! -f "$CONF" ]; then
  echo "Missing $CONF — adjust PROXY_ID if not 61"
  exit 1
fi

if grep -q "$MARKER" "$CONF"; then
  echo "SEO redirects already present in $CONF"
else
  sudo sed -i "/error_log.*proxy-host-61_error.log/r $REDIRECTS" "$CONF"
  sudo sed -i "1i $MARKER" "$REDIRECTS" 2>/dev/null || true
  # Prepend marker comment after insert — simpler: tee block at top of server
  echo "Insert redirects manually from npm_zovus_seo_redirects.conf into NPM Advanced config"
  echo "Or paste block after error_log line in $CONF"
fi

sudo docker exec npm nginx -t
sudo docker exec npm nginx -s reload
echo "NPM reloaded. Verify:"
echo "  curl -sI http://zovus.ru/ | grep -i location"
echo "  curl -sI https://www.zovus.ru/ | grep -i location"
