#!/bin/bash
# Point zovus.ru DNS (Beget) -> NPM public IP, proxy -> aura-ai VM :3000, issue SSL.
set -euo pipefail

PUBLIC_IP="${PUBLIC_IP:-88.205.135.252}"
BACKEND="${BACKEND:-192.168.1.152}"
BACKEND_PORT="${BACKEND_PORT:-3000}"
FQDN="zovus.ru"
WWW="www.zovus.ru"
DB=/opt/homeserver/npm/data/database.sqlite
PROXY_ID="${PROXY_ID:-61}"
CONF="/opt/homeserver/npm/data/nginx/proxy_host/${PROXY_ID}.conf"
SSL_DIR="/opt/homeserver/npm/data/custom_ssl/zovus-le"
ACME=/home/ubuntu/.acme.sh/acme.sh
ACME_CONF=/home/ubuntu/.acme.sh/account.conf

[ -f "$ACME_CONF" ] || { echo "Missing $ACME_CONF"; exit 1; }
# shellcheck source=/dev/null
source "$ACME_CONF"
BEGET_USER="${SAVED_Beget_Username:?}"
BEGET_PASS="${SAVED_Beget_Password:?}"

beget_api() {
  local method="$1"
  local data="$2"
  curl -sG "https://api.beget.com/api/dns/${method}" \
    --data-urlencode "login=${BEGET_USER}" \
    --data-urlencode "passwd=${BEGET_PASS}" \
    --data-urlencode 'input_format=json' \
    --data-urlencode 'output_format=json' \
    --data-urlencode "input_data=${data}"
}

echo "=== Beget: current DNS for ${FQDN} ==="
beget_api getData "{\"fqdn\":\"${FQDN}\"}" | head -c 600
echo

echo "=== Beget: set A ${FQDN} -> ${PUBLIC_IP} ==="
resp=$(beget_api changeRecords "{\"fqdn\":\"${FQDN}\",\"records\":{\"A\":[{\"priority\":10,\"value\":\"${PUBLIC_IP}\"}]}}")
echo "$resp" | head -c 400
echo
echo "$resp" | grep -q '"status":"success"' || { echo "Beget DNS failed for ${FQDN}"; exit 1; }

echo "=== Beget: set A ${WWW} -> ${PUBLIC_IP} ==="
resp=$(beget_api changeRecords "{\"fqdn\":\"${WWW}\",\"records\":{\"A\":[{\"priority\":10,\"value\":\"${PUBLIC_IP}\"}]}}")
echo "$resp" | head -c 400
echo
echo "$resp" | grep -q '"status":"success"' || { echo "Beget DNS failed for ${WWW}"; exit 1; }

echo "=== Wait DNS (Beget NS) ==="
for i in $(seq 1 18); do
  got=$(dig +short "$FQDN" @ns1.beget.com | head -1)
  if [ "$got" = "$PUBLIC_IP" ]; then
    echo "DNS OK: ${FQDN} -> ${got}"
    break
  fi
  echo "attempt $i: ${got:-empty}"
  sleep 10
done

echo "=== Backend health ==="
curl -sf "http://${BACKEND}:${BACKEND_PORT}/api/health" | head -c 120
echo

NOW=$(date '+%Y-%m-%d %H:%M:%S')
if sudo sqlite3 "$DB" "SELECT id FROM proxy_host WHERE domain_names LIKE '%zovus.ru%' AND is_deleted=0;" | grep -q .; then
  echo "NPM proxy for zovus.ru already exists"
else
  echo "=== NPM: insert proxy_host #${PROXY_ID} ==="
  sudo sqlite3 "$DB" "INSERT INTO proxy_host (
    created_on, modified_on, owner_user_id, is_deleted, domain_names,
    forward_host, forward_port, access_list_id, certificate_id,
    ssl_forced, caching_enabled, block_exploits, advanced_config, meta,
    allow_websocket_upgrade, http2_support, forward_scheme, enabled,
    locations, hsts_enabled, hsts_subdomains, trust_forwarded_proto
  ) VALUES (
    '$NOW', '$NOW', 1, 0, '[\"${FQDN}\", \"${WWW}\"]',
    '${BACKEND}', ${BACKEND_PORT}, 0, 0,
    0, 0, 1, '', '{\"letsencrypt_agree\": true, \"dns_challenge\": false}',
    1, 1, 'http', 1,
    '[]', 0, 0, 1
  );"
fi

echo "=== NPM: write nginx conf ${CONF} ==="
sudo mkdir -p "$SSL_DIR"
sudo tee "$CONF" > /dev/null <<EOF
server {
  set \$forward_scheme http;
  set \$server         "${BACKEND}";
  set \$port           ${BACKEND_PORT};

  listen 80;
  listen [::]:80;

  server_name ${FQDN} ${WWW};

  include conf.d/include/letsencrypt-acme-challenge.conf;

  access_log /data/logs/proxy-host-${PROXY_ID}_access.log proxy;
  error_log /data/logs/proxy-host-${PROXY_ID}_error.log warn;

  location / {
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection \$http_connection;
    proxy_http_version 1.1;
    include conf.d/include/proxy.conf;
  }

  include /data/nginx/custom/server_proxy[.]conf;
}
EOF

sudo docker exec npm nginx -t
sudo docker exec npm nginx -s reload

code=$(curl -s -o /dev/null -w '%{http_code}' -H "Host: ${FQDN}" "http://127.0.0.1/api/health")
echo "npm_http_health=${code}"

echo "=== Issue LE cert (DNS Beget) ==="
export Beget_Username="$BEGET_USER" Beget_Password="$BEGET_PASS"
"$ACME" --issue --dns dns_beget -d "$FQDN" -d "$WWW" --dnssleep 120 --force

CERT_DIR="/home/ubuntu/.acme.sh/${FQDN}_ecc"
sudo cp "$CERT_DIR/fullchain.cer" "$SSL_DIR/fullchain.pem"
sudo cp "$CERT_DIR/${FQDN}.key" "$SSL_DIR/privkey.pem"

echo "=== NPM: enable HTTPS ==="
sudo tee "$CONF" > /dev/null <<EOF
server {
  set \$forward_scheme http;
  set \$server         "${BACKEND}";
  set \$port           ${BACKEND_PORT};

  listen 80;
  listen [::]:80;
  listen 443 ssl;
  listen [::]:443 ssl;

  server_name ${FQDN} ${WWW};

  include conf.d/include/letsencrypt-acme-challenge.conf;
  include conf.d/include/ssl-cache.conf;
  include conf.d/include/ssl-ciphers.conf;
  ssl_certificate /data/custom_ssl/zovus-le/fullchain.pem;
  ssl_certificate_key /data/custom_ssl/zovus-le/privkey.pem;

  access_log /data/logs/proxy-host-${PROXY_ID}_access.log proxy;
  error_log /data/logs/proxy-host-${PROXY_ID}_error.log warn;

  location / {
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection \$http_connection;
    proxy_http_version 1.1;
    include conf.d/include/proxy.conf;
  }

  include /data/nginx/custom/server_proxy[.]conf;
}
EOF

sudo docker exec npm nginx -t
sudo docker exec npm nginx -s reload

echo "=== Done ==="
curl -sI -H "Host: ${FQDN}" "http://127.0.0.1/api/health" | head -3
dig +short "$FQDN" @1.1.1.1 || true
