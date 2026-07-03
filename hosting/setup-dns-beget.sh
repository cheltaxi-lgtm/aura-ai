#!/usr/bin/env bash
# Update zovus.ru A records on Beget DNS (+ optional Yandex Mail records).
# Usage:
#   BEGET_LOGIN=... BEGET_PASSWORD=... ./hosting/setup-dns-beget.sh 217.12.37.32
set -euo pipefail

NEW_IP="${1:?New server public IP required}"
FQDN="zovus.ru"
WWW="www.zovus.ru"
YANDEX_VERIFY="${YANDEX_WEBMASTER_VERIFICATION:-7902ba7dfdb76ac3}"
LOGIN="${BEGET_LOGIN:?Set BEGET_LOGIN}"
PASS="${BEGET_PASSWORD:?Set BEGET_PASSWORD}"

beget_api() {
  curl -sG "https://api.beget.com/api/dns/${1}" \
    --data-urlencode "login=${LOGIN}" \
    --data-urlencode "passwd=${PASS}" \
    --data-urlencode 'input_format=json' \
    --data-urlencode 'output_format=json' \
    --data-urlencode "input_data=${2}"
}

echo "=== A + Yandex verify TXT ${FQDN} -> ${NEW_IP} ==="
resp=$(beget_api changeRecords "{\"fqdn\":\"${FQDN}\",\"records\":{\"A\":[{\"priority\":10,\"value\":\"${NEW_IP}\"}],\"TXT\":[{\"priority\":10,\"value\":\"yandex-verification: ${YANDEX_VERIFY}\"}]}}")
echo "$resp" | head -c 300
echo
echo "$resp" | grep -q '"status":"success"' || { echo "DNS failed for ${FQDN}"; exit 1; }

echo "=== A ${WWW} -> ${NEW_IP} ==="
resp=$(beget_api changeRecords "{\"fqdn\":\"${WWW}\",\"records\":{\"A\":[{\"priority\":10,\"value\":\"${NEW_IP}\"}]}}")
echo "$resp" | head -c 300
echo
echo "$resp" | grep -q '"status":"success"' || { echo "DNS failed for ${WWW}"; exit 1; }

echo "=== Optional Yandex Mail (uncomment in Beget panel if using Yandex 360) ==="
cat <<'DNS'
MX  @  10  mx.yandex.net.
TXT @     v=spf1 redirect=_spf.yandex.net
DNS

for i in $(seq 1 12); do
  got=$(dig +short "$FQDN" @ns1.beget.com | head -1)
  if [ "$got" = "$NEW_IP" ]; then
    echo "DNS propagated: ${FQDN} -> ${got}"
    exit 0
  fi
  echo "wait $i: ${got:-empty}"
  sleep 10
done
echo "WARN: DNS not propagated yet — may take up to 30 min"
