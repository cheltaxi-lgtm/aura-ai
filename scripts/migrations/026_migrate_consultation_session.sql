-- Consultation session model: status lifecycle + active session index
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed'));

CREATE INDEX IF NOT EXISTS idx_sessions_active
  ON sessions (user_id, character_key, status, updated_at DESC);
