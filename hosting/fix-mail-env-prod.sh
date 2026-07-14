#!/usr/bin/env bash
# Deduplicate and normalize mail keys in prod .env.local (preserves SMTP_PASS / RESEND_API_KEY).
set -euo pipefail
ENV="${1:-/opt/aura-ai/.env.local}"

smtp_pass=""
resend_key=""
admin_seed=""
if [[ -f "$ENV" ]]; then
  smtp_pass="$(grep -E '^SMTP_PASS=' "$ENV" | tail -1 | cut -d= -f2- || true)"
  resend_key="$(grep -E '^RESEND_API_KEY=' "$ENV" | tail -1 | cut -d= -f2- || true)"
  admin_seed="$(grep -E '^ADMIN_SEED_EMAIL=' "$ENV" | tail -1 | cut -d= -f2- || true)"
fi
[[ -n "$admin_seed" ]] || admin_seed="cheldriver@yandex.ru"

tmp="$(mktemp)"
grep -v -E '^(EMAIL_FROM|SMTP_HOST|SMTP_PORT|SMTP_SECURE|SMTP_USER|SMTP_PASS|RESEND_API_KEY|MAIL_SUPPORT|MAIL_PRIVACY|MAIL_CLAIMS|MAIL_ADMIN_NOTIFY)=' "$ENV" 2>/dev/null >"$tmp" || true
{
  cat "$tmp"
  echo ""
  echo "# Mail — normalized $(date -Iseconds)"
  echo "EMAIL_FROM=Zovus <noreply@zovus.ru>"
  echo "SMTP_HOST=smtp.yandex.ru"
  echo "SMTP_PORT=465"
  echo "SMTP_SECURE=true"
  echo "SMTP_USER=noreply@zovus.ru"
  [[ -n "$smtp_pass" ]] && echo "SMTP_PASS=${smtp_pass}"
  [[ -n "$resend_key" ]] && echo "RESEND_API_KEY=${resend_key}"
  echo "MAIL_SUPPORT=support@zovus.ru"
  echo "MAIL_PRIVACY=privacy@zovus.ru"
  echo "MAIL_CLAIMS=claims@zovus.ru"
  echo "MAIL_ADMIN_NOTIFY=admin@zovus.ru"
} >"$ENV"
rm -f "$tmp"
systemctl restart aura-ai.service
sleep 2
systemctl is-active aura-ai.service
echo "OK: mail env normalized"
