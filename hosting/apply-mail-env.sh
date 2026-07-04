#!/usr/bin/env bash
# Merge mail-related keys into /opt/aura-ai/.env.local (idempotent).
# Usage on prod: bash hosting/apply-mail-env.sh [/opt/aura-ai/.env.local]
set -euo pipefail

ENV_FILE="${1:-/opt/aura-ai/.env.local}"
tmp="$(mktemp)"

declare -A KEYS=(
  [EMAIL_FROM]='Zovus <noreply@zovus.ru>'
  [SMTP_HOST]='smtp.yandex.ru'
  [SMTP_PORT]='465'
  [SMTP_SECURE]='true'
  [SMTP_USER]='noreply@zovus.ru'
  [MAIL_SUPPORT]='support@zovus.ru'
  [MAIL_PRIVACY]='privacy@zovus.ru'
  [MAIL_CLAIMS]='claims@zovus.ru'
  [MAIL_ADMIN_NOTIFY]='admin@zovus.ru'
)

touch "$ENV_FILE"
grep -v -E '^(EMAIL_FROM|SMTP_HOST|SMTP_PORT|SMTP_SECURE|SMTP_USER|MAIL_SUPPORT|MAIL_PRIVACY|MAIL_CLAIMS|MAIL_ADMIN_NOTIFY)=' "$ENV_FILE" >"$tmp" || true
{
  cat "$tmp"
  echo ""
  echo "# Mail (SMTP_PASS or RESEND_API_KEY required for sending)"
  for k in EMAIL_FROM SMTP_HOST SMTP_PORT SMTP_SECURE SMTP_USER MAIL_SUPPORT MAIL_PRIVACY MAIL_CLAIMS MAIL_ADMIN_NOTIFY; do
    echo "${k}=${KEYS[$k]}"
  done
} >"$ENV_FILE"
rm -f "$tmp"
echo "Updated $ENV_FILE (mail keys; add SMTP_PASS or RESEND_API_KEY to enable sending)"
