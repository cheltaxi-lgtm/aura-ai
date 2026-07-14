#!/usr/bin/env bash
set -euo pipefail
PASS="${1:?pass}"
ENV=/opt/aura-ai/.env.local
tmp="$(mktemp)"
grep -v -E '^(EMAIL_FROM|SMTP_USER|SMTP_PASS)=' "$ENV" >"$tmp" || true
{
  cat "$tmp"
  echo 'EMAIL_FROM=Zovus <noreply@zovus.ru>'
  echo 'SMTP_USER=cheldriver@yandex.ru'
  echo "SMTP_PASS=${PASS}"
} >"$ENV"
rm -f "$tmp"
systemctl restart aura-ai.service
sleep 2
cd /opt/aura-ai && node scripts/test-smtp.mjs cheldriver@yandex.ru
