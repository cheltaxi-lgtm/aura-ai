ALTER TABLE session_memories
  ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES sessions(id) ON DELETE SET NULL;

-- Unique index for upsert by session_id (partial — matches ON CONFLICT inference)
DROP INDEX IF EXISTS idx_session_memories_session_id;
DROP INDEX IF EXISTS idx_session_memories_session_unique;
CREATE UNIQUE INDEX idx_session_memories_session_unique
  ON session_memories (session_id)
  WHERE session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_session_memories_user_created
  ON session_memories (user_id, created_at DESC);
