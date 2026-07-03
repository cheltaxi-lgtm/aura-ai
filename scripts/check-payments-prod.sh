#!/usr/bin/env bash
set -euo pipefail
PSQL="docker exec auraai-postgres psql -U auraai -d auraai -t -A -F '|'"
echo "=== rune settings ==="
$PSQL -c "SELECT value FROM platform_settings WHERE key = 'runes';"
echo
echo "=== recent rune purchases ==="
$PSQL -c "SELECT id, user_id, amount, description, payment_id, created_at FROM rune_transactions WHERE type = 'purchase' ORDER BY created_at DESC LIMIT 15;"
echo
echo "=== recent payments ==="
$PSQL -c "SELECT id, user_id, amount, payment_type, status, created_at FROM payments ORDER BY created_at DESC LIMIT 10;"
echo
echo "=== recent users ==="
$PSQL -c "SELECT id, email, rune_balance, total_runes_purchased, updated_at FROM users ORDER BY updated_at DESC NULLS LAST LIMIT 10;"
