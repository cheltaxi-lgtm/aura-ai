\pset border 2
\x on
SELECT id, user_id, character_key, intention, spread_type, spread_id, cards, status, created_at, updated_at
FROM sessions
WHERE spread_id = 'single' AND created_at::date = CURRENT_DATE
ORDER BY created_at DESC
LIMIT 5;
