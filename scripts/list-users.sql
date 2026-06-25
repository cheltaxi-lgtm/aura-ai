SELECT u.id, u.name, ua.email, u.astro_meta->>'lastTripletDrawAt' AS anchor
FROM users u
LEFT JOIN user_accounts ua ON ua.profile_user_id = u.id
ORDER BY u.created_at DESC
LIMIT 30;
