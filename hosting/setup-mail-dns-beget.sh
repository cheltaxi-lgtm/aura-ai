#!/usr/bin/env bash
# Configure zovus.ru mail on Beget (DNS + optional Resend DKIM).
# Prefer: python3 hosting/setup-beget-mail.py (mailboxes + env in one step).
#
# Usage:
#   BEGET_LOGIN=... BEGET_PASSWORD=... ./hosting/setup-mail-dns-beget.sh
#   APP_IP=217.12.37.32  — A record for site (default)
#
# Optional:
#   RESEND_DKIM_VALUE='...'  — TXT for resend._domainkey (from Resend dashboard)
#   MAIL_PROVIDER=beget|yandex  — default beget (mx1.beget.com)
set -euo pipefail

FQDN="zovus.ru"
APP_IP="${APP_IP:-217.12.37.32}"
YANDEX_VERIFY="${YANDEX_WEBMASTER_VERIFICATION:-7902ba7dfdb76ac3}"
MAIL_PROVIDER="${MAIL_PROVIDER:-beget}"
LOGIN="${BEGET_LOGIN:?Set BEGET_LOGIN}"
PASS="${BEGET_PASSWORD:?Set BEGET_PASSWORD}"
DMARC_RUA="${DMARC_RUA:-mailto:admin@zovus.ru}"

beget_api() {
  curl -sG "https://api.beget.com/api/dns/${1}" \
    --data-urlencode "login=${LOGIN}" \
    --data-urlencode "passwd=${PASS}" \
    --data-urlencode 'input_format=json' \
    --data-urlencode 'output_format=json' \
    --data-urlencode "input_data=${2}"
}

if [ "${MAIL_PROVIDER}" = "yandex" ]; then
  MX_JSON='[{"priority":10,"value":"mx.yandex.net."}]'
  SPF='v=spf1 include:_spf.yandex.net include:amazonses.com ~all'
else
  MX_JSON='[{"priority":10,"value":"mx1.beget.com."},{"priority":20,"value":"mx2.beget.com."}]'
  SPF='v=spf1 include:_spf.beget.com include:amazonses.com ~all'
fi

YANDEX_TXT="yandex-verification: ${YANDEX_VERIFY}"
DMARC="v=DMARC1; p=quarantine; rua=${DMARC_RUA}; fo=1"

echo "=== A + MX + TXT ${FQDN} (single changeRecords) ==="
payload=$(printf '{"fqdn":"%s","records":{"A":[{"priority":10,"value":"%s"}],"MX":%s,"TXT":[{"priority":10,"value":"%s"},{"priority":20,"value":"%s"}]}}' \
  "${FQDN}" "${APP_IP}" "${MX_JSON}" "${YANDEX_TXT}" "${SPF}")
resp=$(beget_api changeRecords "${payload}")
echo "$resp" | head -c 500; echo
echo "$resp" | grep -q '"status":"success"' || { echo "DNS update failed for ${FQDN}"; exit 1; }

echo "=== A www.${FQDN} ==="
resp=$(beget_api changeRecords "{\"fqdn\":\"www.${FQDN}\",\"records\":{\"A\":[{\"priority\":10,\"value\":\"${APP_IP}\"}]}}")
echo "$resp" | head -c 300; echo

echo "=== DMARC _dmarc.${FQDN} ==="
resp=$(beget_api changeRecords "{\"fqdn\":\"_dmarc.${FQDN}\",\"records\":{\"TXT\":[{\"priority\":10,\"value\":\"${DMARC}\"}]}}")
echo "$resp" | head -c 300; echo

if [ -n "${RESEND_DKIM_VALUE:-}" ]; then
  echo "=== Resend DKIM resend._domainkey.${FQDN} ==="
  resp=$(beget_api changeRecords "{\"fqdn\":\"resend._domainkey.${FQDN}\",\"records\":{\"TXT\":[{\"priority\":10,\"value\":\"${RESEND_DKIM_VALUE}\"}]}}")
  echo "$resp" | head -c 400; echo
fi

echo "Done. Mailboxes: run python3 hosting/setup-beget-mail.py"
echo "Verify: dig A MX TXT ${FQDN} +short"
