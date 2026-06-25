-- Tag chat messages with profile owner; enables per-user cabinet filtering
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_chat_messages_owner ON chat_messages(owner_user_id);

-- Remove cross-user contamination already stored under Anigilyator sessions
DELETE FROM chat_messages cm
USING sessions s, users u
WHERE cm.session_id = s.id
  AND s.user_id = u.id
  AND u.name ILIKE 'Anigilyator'
  AND cm.role = 'assistant'
  AND (
    cm.content ILIKE 'ГЕННАДИЙ,%'
    OR cm.content ILIKE 'ГЕННАДИЙ.%'
    OR cm.content ILIKE 'Gennad%'
    OR cm.content ILIKE 'Gennady%'
  );

-- Backfill owner for remaining messages in owned sessions
UPDATE chat_messages cm
SET owner_user_id = s.user_id
FROM sessions s
WHERE cm.session_id = s.id
  AND cm.owner_user_id IS NULL
  AND s.user_id IS NOT NULL;
