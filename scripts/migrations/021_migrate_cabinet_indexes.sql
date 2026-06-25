CREATE INDEX IF NOT EXISTS idx_session_memories_user_created
  ON session_memories (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_diary_entries_user
  ON diary_entries (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_achievements_user
  ON user_achievements (user_id);
