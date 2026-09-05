CREATE TABLE IF NOT EXISTS bot_reminder_delivery (
  telegram_user_id INTEGER NOT NULL REFERENCES bot_users(telegram_user_id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  state TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 1,
  retry_at INTEGER NOT NULL DEFAULT 0,
  suppress_until INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (telegram_user_id, kind)
);
