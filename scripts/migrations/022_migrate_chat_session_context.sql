-- Per-session LLM context lookup (session + character + time)
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_character_created
  ON chat_messages (session_id, character_id, created_at ASC);
