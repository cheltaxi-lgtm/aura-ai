#!/usr/bin/env bash
# Configure zovus.ru mail DNS on Beget: Yandex 360 MX + SPF + DMARC + Resend transactional.
#
# Usage:
#   BEGET_LOGIN=... BEGET_PASSWORD=... ./hosting/setup-mail-dns-beget.sh
#
# Optional:
#   RESEND_DKIM_VALUE='...'  — TXT for resend._domainkey (from Resend dashboard)
#   DMARC_RUA=mailto:admin@zovus.ru
set -euo pipefail

FQDN="zovus.ru"
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

echo "=== MX Yandex 360 for ${FQDN} ==="
resp=$(beget_api changeRecords "{\"fqdn\":\"${FQDN}\",\"records\":{\"MX\":[{\"priority\":10,\"value\":\"mx.yandex.net.\"}]}}")
echo "$resp" | head -c 400; echo
echo "$resp" | grep -q '"status":"success"' || { echo "MX update failed"; exit 1; }

echo "=== SPF (Yandex + Resend) ==="
SPF='v=spf1 include:_spf.yandex.net include:amazonses.com ~all'
resp=$(beget_api changeRecords "{\"fqdn\":\"${FQDN}\",\"records\":{\"TXT\":[{\"priority\":10,\"value\":\"${SPF}\"}]}}")
echo "$resp" | head -c 400; echo
echo "$resp" | grep -q '"status":"success"' || { echo "SPF update failed"; exit 1; }

echo "=== DMARC _dmarc.${FQDN} ==="
DMARC="v=DMARC1; p=quarantine; rua=${DMARC_RUA}; fo=1"
resp=$(beget_api changeRecords "{\"fqdn\":\"_dmarc.${FQDN}\",\"records\":{\"TXT\":[{\"priority\":10,\"value\":\"${DMARC}\"}]}}")
echo "$resp" | head -c 400; echo
echo "$resp" | grep -q '"status":"success"' || { echo "DMARC update failed"; exit 1; }

if [ -n "${RESEND_DKIM_VALUE:-}" ]; then
  echo "=== Resend DKIM resend._domainkey.${FQDN} ==="
  resp=$(beget_api changeRecords "{\"fqdn\":\"resend._domainkey.${FQDN}\",\"records\":{\"TXT\":[{\"priority\":10,\"value\":\"${RESEND_DKIM_VALUE}\"}]}}")
  echo "$resp" | head -c 400; echo
  echo "$resp" | grep -q '"status":"success"' || { echo "Resend DKIM failed"; exit 1; }
else
  echo "SKIP Resend DKIM — set RESEND_DKIM_VALUE from https://resend.com/domains"
fi

cat <<'MAILBOXES'

=== Create mailboxes in Yandex 360 (Connect domain zovus.ru) ===
  noreply@zovus.ru   — SMTP app password → SMTP_USER/SMTP_PASS in .env.local
  support@zovus.ru   — support team inbox
  privacy@zovus.ru   — alias → support
  claims@zovus.ru    — alias → support
  admin@zovus.ru     — ops alerts (MAIL_ADMIN_NOTIFY)

=== App env (.env.local on server) ===
  RESEND_API_KEY=re_...          # preferred transactional
  EMAIL_FROM=Zovus <noreply@zovus.ru>
  SMTP_HOST=smtp.yandex.ru
  SMTP_PORT=465
  SMTP_USER=noreply@zovus.ru
  SMTP_PASS=<app-password>
  MAIL_SUPPORT=support@zovus.ru
  MAIL_ADMIN_NOTIFY=admin@zovus.ru

MAILBOXES

echo "Done. Verify: dig MX ${FQDN} +short && dig TXT ${FQDN} +short"
