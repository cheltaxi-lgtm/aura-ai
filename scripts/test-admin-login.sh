#!/bin/bash
# Local smoke only — never commit real credentials.
# Usage: ADMIN_EMAIL=... ADMIN_PASSWORD=... ./scripts/test-admin-login.sh
set -euo pipefail

: "${ADMIN_EMAIL:?Set ADMIN_EMAIL}"
: "${ADMIN_PASSWORD:?Set ADMIN_PASSWORD}"

COOKIE=/tmp/admin-test.cookies
rm -f "$COOKIE"
curl -sS -c "$COOKIE" -X POST http://127.0.0.1:3000/api/auth/admin/login \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"${ADMIN_EMAIL}\",\"password\":\"${ADMIN_PASSWORD}\"}"
echo
curl -sS -b "$COOKIE" http://127.0.0.1:3000/api/auth/me
echo
