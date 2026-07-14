#!/usr/bin/env bash
set -euo pipefail
ENV="${1:-/opt/aura-ai/.env.local}"
PASS="${2:?SMTP_PASS required}"
SMTP_USER="${3:-cheldriver@yandex.ru}"
EMAIL_FROM="${4:-Zovus <${SMTP_USER}>}"
tmp="$(mktemp)"
grep -v -E '^(EMAIL_FROM|SMTP_HOST|SMTP_PORT|SMTP_SECURE|SMTP_USER|SMTP_PASS|RESEND_API_KEY)=' "$ENV" >"$tmp" || true
{
  cat "$tmp"
  echo ""
  echo "# Mail — Yandex SMTP"
  echo "EMAIL_FROM=${EMAIL_FROM}"
  echo "SMTP_HOST=smtp.yandex.ru"
  echo "SMTP_PORT=465"
  echo "SMTP_SECURE=true"
  echo "SMTP_USER=${SMTP_USER}"
  echo "SMTP_PASS=${PASS}"
  echo "MAIL_SUPPORT=support@zovus.ru"
  echo "MAIL_PRIVACY=privacy@zovus.ru"
  echo "MAIL_CLAIMS=claims@zovus.ru"
  echo "MAIL_ADMIN_NOTIFY=admin@zovus.ru"
} >"$ENV"
rm -f "$tmp"
systemctl restart aura-ai.service
sleep 3
systemctl is-active aura-ai.service
