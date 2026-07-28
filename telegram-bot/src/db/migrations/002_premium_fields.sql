ALTER TABLE bot_users ADD COLUMN timezone_offset_minutes INTEGER;
ALTER TABLE bot_users ADD COLUMN consent_version TEXT;
ALTER TABLE bot_users ADD COLUMN voice_mode TEXT DEFAULT 'text_voice';
ALTER TABLE bot_users ADD COLUMN ref_code TEXT;
ALTER TABLE bot_users ADD COLUMN invited_by INTEGER;
ALTER TABLE bot_users ADD COLUMN referral_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bot_users ADD COLUMN bonus_spreads INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bot_users ADD COLUMN last_active_at TEXT;
ALTER TABLE bot_users ADD COLUMN streak_grace_used INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bot_users ADD COLUMN unsubscribed_at TEXT;
ALTER TABLE bot_users ADD COLUMN timezone_asked_at TEXT;

ALTER TABLE bot_guest_sessions ADD COLUMN deck_id TEXT DEFAULT 'tarot-veronika';
ALTER TABLE bot_guest_sessions ADD COLUMN teaser_seed TEXT;
ALTER TABLE bot_guest_sessions ADD COLUMN collage_cache_key TEXT;
ALTER TABLE bot_guest_sessions ADD COLUMN plain_token_prefix TEXT;
ALTER TABLE bot_guest_sessions ADD COLUMN expired_at TEXT;

CREATE TABLE IF NOT EXISTS bot_schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bot_llm_usage (
  telegram_user_id INTEGER NOT NULL,
  day TEXT NOT NULL,
  calls INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (telegram_user_id, day)
);

CREATE TABLE IF NOT EXISTS bot_tts_usage (
  telegram_user_id INTEGER NOT NULL,
  day TEXT NOT NULL,
  calls INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (telegram_user_id, day)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_ref_code ON bot_users(ref_code);
