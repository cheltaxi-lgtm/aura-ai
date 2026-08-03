ALTER TABLE bot_guest_sessions ADD COLUMN quota_day TEXT;

UPDATE bot_guest_sessions
SET quota_day = substr(created_at, 1, 10)
WHERE quota_day IS NULL OR quota_day = '';

CREATE INDEX IF NOT EXISTS idx_sessions_user_quota_day
  ON bot_guest_sessions(telegram_user_id, quota_day);
