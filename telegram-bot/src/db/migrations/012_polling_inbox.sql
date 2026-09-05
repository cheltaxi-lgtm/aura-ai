CREATE TABLE IF NOT EXISTS bot_update_inbox (
  update_id INTEGER PRIMARY KEY,
  user_key TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  received_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS bot_update_inbox_queue ON bot_update_inbox(status, update_id);
CREATE TABLE IF NOT EXISTS bot_polling_cursor (
  id INTEGER PRIMARY KEY CHECK(id = 1), offset INTEGER NOT NULL, last_accepted_at TEXT NOT NULL
);
