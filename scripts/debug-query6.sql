\pset border 2
SELECT id, role, LEFT(content, 120) AS content_preview, created_at
FROM chat_messages
WHERE session_id = '06c3190c-d928-4e23-a36a-23fd91f88b60'
ORDER BY created_at DESC
LIMIT 5;

SELECT COUNT(*) AS total_messages_today
FROM chat_messages cm
JOIN sessions s ON s.id = cm.session_id
WHERE s.user_id = '2383df09-bb04-444d-9672-b9f3afd8c34c'
  AND cm.created_at > NOW() - INTERVAL '2 hours';
