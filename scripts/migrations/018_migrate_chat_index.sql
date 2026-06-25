-- Chat thread lookup index (owner + character + time)
CREATE INDEX IF NOT EXISTS idx_chat_messages_owner_character
  ON chat_messages (owner_user_id, character_id, created_at);
