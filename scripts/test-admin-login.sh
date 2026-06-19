#!/bin/bash
set -euo pipefail
COOKIE=/tmp/admin-test.cookies
rm -f "$COOKIE"
curl -sS -c "$COOKIE" -X POST http://127.0.0.1:3000/api/auth/admin/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"cheldriver@yandex.ru","password":"gzOyv9Co*74_74"}'
echo
curl -sS -b "$COOKIE" http://127.0.0.1:3000/api/auth/me
echo
