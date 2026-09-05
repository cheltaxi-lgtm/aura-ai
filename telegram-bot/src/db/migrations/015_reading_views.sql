CREATE TABLE IF NOT EXISTS bot_reading_views (
  id TEXT PRIMARY KEY, telegram_user_id INTEGER NOT NULL,
  data TEXT NOT NULL, updated_at TEXT NOT NULL,
  FOREIGN KEY(telegram_user_id) REFERENCES bot_users(telegram_user_id) ON DELETE CASCADE
);
