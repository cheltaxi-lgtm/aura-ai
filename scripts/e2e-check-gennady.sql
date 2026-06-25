SELECT ua.id, ua.email, ua.name, ua.profile_user_id, u.name AS profile_name
FROM user_accounts ua
LEFT JOIN users u ON u.id = ua.profile_user_id
WHERE ua.email ILIKE '%gamer_club%' OR u.name ILIKE '%gennad%';

SELECT id, character_name, created_at, context_data->>'type' AS typ
FROM history
WHERE user_id IN (
  SELECT profile_user_id FROM user_accounts WHERE email ILIKE '%gamer_club%'
)
ORDER BY created_at DESC
LIMIT 5;
