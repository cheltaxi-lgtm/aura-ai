CREATE TABLE IF NOT EXISTS bot_user_erasure (
  operation_id TEXT NOT NULL,
  telegram_user_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  completed_at TEXT,
  PRIMARY KEY (operation_id, telegram_user_id)
);
CREATE INDEX IF NOT EXISTS bot_user_erasure_active ON bot_user_erasure(telegram_user_id, status);
