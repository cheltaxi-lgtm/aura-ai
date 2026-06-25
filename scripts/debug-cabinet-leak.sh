#!/bin/bash
set -euo pipefail
PSQL="docker exec -i auraai-postgres psql -U auraai -d auraai"

echo "=== Accounts ==="
$PSQL -c "
SELECT ua.name AS account_name, ua.email, ua.profile_user_id, u.name AS profile_name
FROM user_accounts ua
LEFT JOIN users u ON u.id = ua.profile_user_id
WHERE ua.name ILIKE '%anigil%' OR ua.name ILIKE '%gennad%'
   OR u.name ILIKE '%anigil%' OR u.name ILIKE '%gennad%'
ORDER BY ua.created_at;
"

echo "=== Duplicate profile links ==="
$PSQL -c "
SELECT profile_user_id, COUNT(*) AS cnt, array_agg(name ORDER BY created_at) AS accounts
FROM user_accounts WHERE profile_user_id IS NOT NULL
GROUP BY profile_user_id HAVING COUNT(*) > 1;
"

echo "=== Sessions per profile ==="
$PSQL -c "
SELECT u.name, s.id AS session_id, s.created_at,
       (SELECT COUNT(*) FROM chat_messages cm WHERE cm.session_id = s.id) AS msgs
FROM sessions s
JOIN users u ON u.id = s.user_id
WHERE u.name ILIKE '%anigil%' OR u.name ILIKE '%gennad%'
ORDER BY s.created_at DESC
LIMIT 20;
"

echo "=== Gennady/Anigilyator chat snippets ==="
$PSQL -c "
SELECT u.name AS owner, cm.character_id, cm.role, LEFT(cm.content, 60) AS preview, cm.created_at
FROM chat_messages cm
JOIN sessions s ON s.id = cm.session_id
LEFT JOIN users u ON u.id = s.user_id
WHERE cm.content ILIKE '%gennad%' OR cm.content ILIKE '%anigil%'
   OR cm.content ILIKE '%геннад%' OR cm.content ILIKE '%анигил%'
ORDER BY cm.created_at DESC
LIMIT 15;
"
