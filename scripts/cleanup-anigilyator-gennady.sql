DELETE FROM chat_messages cm
USING sessions s, users u
WHERE cm.session_id = s.id
  AND s.user_id = u.id
  AND u.name ILIKE 'Anigilyator'
  AND cm.role = 'user'
  AND cm.content ILIKE 'ГЕННАДИЙ,%';
