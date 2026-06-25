-- Diary, achievements, daily energy readings
CREATE TABLE IF NOT EXISTS diary_entries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  character_key TEXT NOT NULL,
  entry_text    TEXT NOT NULL,
  cards         TEXT[] DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_diary_user
  ON diary_entries (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS user_achievements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement TEXT NOT NULL,
  earned_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, achievement)
);

CREATE TABLE IF NOT EXISTS daily_readings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  character_key TEXT NOT NULL,
  reading_text  TEXT NOT NULL,
  reading_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  UNIQUE(user_id, reading_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_readings_user_date
  ON daily_readings (user_id, reading_date DESC);

ALTER TABLE rune_transactions DROP CONSTRAINT IF EXISTS rune_transactions_type_check;

ALTER TABLE rune_transactions
  ADD CONSTRAINT rune_transactions_type_check
  CHECK (type IN ('purchase', 'spend', 'bonus', 'refund', 'daily_bonus', 'achievement'));
