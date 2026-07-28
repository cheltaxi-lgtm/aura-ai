CREATE TABLE IF NOT EXISTS bot_spread_claims (
  telegram_user_id INTEGER NOT NULL,
  question_hash TEXT NOT NULL,
  local_date TEXT NOT NULL,
  session_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (telegram_user_id, question_hash, local_date)
);

CREATE INDEX IF NOT EXISTS idx_spread_claims_session
  ON bot_spread_claims(session_id);
