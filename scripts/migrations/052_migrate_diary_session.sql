-- Link diary entries to consultation sessions (one entry per session).
ALTER TABLE diary_entries
  ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES sessions(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_diary_entries_user_session
  ON diary_entries (user_id, session_id)
  WHERE session_id IS NOT NULL;
