ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS character_key TEXT,
  ADD COLUMN IF NOT EXISTS intention TEXT,
  ADD COLUMN IF NOT EXISTS spread_type TEXT,
  ADD COLUMN IF NOT EXISTS cards JSONB;

CREATE INDEX IF NOT EXISTS idx_sessions_user_character
  ON sessions (user_id, character_key, updated_at DESC);
