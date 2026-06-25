#!/bin/bash
# Apply NPM timeouts for zovus.ru (run on homeserver 192.168.1.50)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
sudo python3 "$SCRIPT_DIR/patch_npm_61.py"
sudo python3 "$SCRIPT_DIR/update_npm_db_61.py"
sudo docker exec npm nginx -t
sudo docker exec npm nginx -s reload
grep -E 'proxy_read_timeout|client_max_body_size' /opt/homeserver/npm/data/nginx/proxy_host/61.conf
echo "Done."
