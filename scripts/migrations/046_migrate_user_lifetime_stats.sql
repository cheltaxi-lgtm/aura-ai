-- Lifetime cabinet stats: survive "Очистить все данные" (purge).
CREATE TABLE IF NOT EXISTS user_lifetime_stats (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  total_sessions INT NOT NULL DEFAULT 0,
  total_cards INT NOT NULL DEFAULT 0,
  master_counts JSONB NOT NULL DEFAULT '{}',
  backfilled_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One row per consultation session — not deleted on cabinet purge.
CREATE TABLE IF NOT EXISTS user_lifetime_session_snapshots (
  session_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  character_key TEXT NOT NULL,
  cards_count INT NOT NULL DEFAULT 0,
  PRIMARY KEY (session_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_lifetime_snapshots_user
  ON user_lifetime_session_snapshots (user_id);
