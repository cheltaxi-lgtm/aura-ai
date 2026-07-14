\pset border 2
\x on
SELECT id, character_key, intention, spread_type, spread_id, cards, status, created_at, updated_at
FROM sessions
WHERE user_id = '2383df09-bb04-444d-9672-b9f3afd8c34c' AND updated_at::date = CURRENT_DATE
ORDER BY updated_at DESC
LIMIT 10;
