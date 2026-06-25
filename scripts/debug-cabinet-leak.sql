-- Debug cross-cabinet chat leak
SELECT ua.id AS account_id, ua.email, ua.name AS account_name, ua.profile_user_id, u.name AS profile_name
FROM user_accounts ua
LEFT JOIN users u ON u.id = ua.profile_user_id
WHERE ua.name ILIKE '%anigil%'
   OR ua.name ILIKE '%gennad%'
   OR u.name ILIKE '%anigil%'
   OR u.name ILIKE '%gennad%'
   OR ua.email ILIKE '%gamer_club%'
ORDER BY ua.created_at;

-- Duplicate profile links
SELECT profile_user_id, COUNT(*) AS accounts, array_agg(name ORDER BY created_at) AS account_names
FROM user_accounts
WHERE profile_user_id IS NOT NULL
GROUP BY profile_user_id
HAVING COUNT(*) > 1;

-- Chat mentioning Gennady or Anigilyator with session owner
SELECT cm.id, cm.character_id, cm.role, LEFT(cm.content, 80) AS preview, cm.created_at,
       s.user_id AS session_profile_id, u.name AS session_owner_name
FROM chat_messages cm
JOIN sessions s ON s.id = cm.session_id
LEFT JOIN users u ON u.id = s.user_id
WHERE cm.content ILIKE '%гennad%'
   OR cm.content ILIKE '%gennad%'
   OR cm.content ILIKE '%anigil%'
   OR cm.content ILIKE '%анигил%'
   OR cm.content ILIKE '%геннад%'
ORDER BY cm.created_at DESC
LIMIT 20;
