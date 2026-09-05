CREATE TABLE IF NOT EXISTS bot_paid_operations (
  id TEXT PRIMARY KEY, telegram_user_id INTEGER NOT NULL,
  kind TEXT NOT NULL, input_hash TEXT NOT NULL, input TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', result TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  FOREIGN KEY(telegram_user_id) REFERENCES bot_users(telegram_user_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS bot_paid_operations_resume ON bot_paid_operations(telegram_user_id, kind, input_hash, status);
