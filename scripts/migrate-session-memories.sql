CREATE TABLE IF NOT EXISTS session_memories (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  character_key   TEXT NOT NULL,
  session_date    TIMESTAMPTZ NOT NULL DEFAULT now(),
  topic_summary   TEXT NOT NULL,
  key_cards       TEXT[] NOT NULL DEFAULT '{}',
  prediction      TEXT NOT NULL,
  mood            TEXT,
  outcome_rating  INTEGER CHECK (outcome_rating BETWEEN 1 AND 5),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_session_memories_user
  ON session_memories (user_id, character_key, session_date DESC);
