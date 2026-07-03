-- Joint reading invites: async paired spread for two users
CREATE TABLE IF NOT EXISTS joint_readings (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token                 TEXT UNIQUE NOT NULL,
  initiator_user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  initiator_name        TEXT,
  partner_name          TEXT,
  spread_id             TEXT NOT NULL DEFAULT 'love-7',
  intent_slug           TEXT NOT NULL DEFAULT 'sovmestimost-pary',
  status                TEXT NOT NULL DEFAULT 'pending_partner'
    CHECK (status IN ('pending_partner', 'partner_done', 'completed', 'expired')),
  initiator_session_id  TEXT,
  initiator_reading     TEXT,
  initiator_cards       JSONB DEFAULT '[]'::jsonb,
  initiator_character   TEXT,
  partner_user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  partner_session_id    TEXT,
  partner_reading       TEXT,
  partner_cards         JSONB DEFAULT '[]'::jsonb,
  partner_character     TEXT,
  combined_reading      TEXT,
  rune_charged          BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at            TIMESTAMPTZ NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_joint_readings_token ON joint_readings (token);
CREATE INDEX IF NOT EXISTS idx_joint_readings_initiator ON joint_readings (initiator_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_joint_readings_partner ON joint_readings (partner_user_id, created_at DESC)
  WHERE partner_user_id IS NOT NULL;

-- Daily reminder preferences (email + in-app hour)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS notification_prefs JSONB NOT NULL DEFAULT '{
    "dailyEmail": true,
    "dailyInApp": true,
    "reminderHourUtc": 6
  }'::jsonb;

CREATE TABLE IF NOT EXISTS daily_reminder_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sent_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  channel    TEXT NOT NULL CHECK (channel IN ('in_app', 'email')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, sent_date, channel)
);

CREATE INDEX IF NOT EXISTS idx_daily_reminder_log_date ON daily_reminder_log (sent_date);
