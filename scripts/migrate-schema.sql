-- Aura — догоняющая миграция схемы (сессии, чат, influencers, users)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- users + history (онбординг)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  gender TEXT NOT NULL CHECK (gender IN ('male', 'female')),
  birth_date DATE NOT NULL,
  zodiac TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  character_name TEXT NOT NULL,
  context_data JSONB NOT NULL DEFAULT '{}',
  free_question_count INT NOT NULL DEFAULT 0,
  is_paid BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_history_user ON history(user_id);

-- influencers
CREATE TABLE IF NOT EXISTS influencers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  telegram_link TEXT,
  custom_prompt TEXT,
  balance NUMERIC(12, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS influencer_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  influencer_id UUID NOT NULL REFERENCES influencers(id) ON DELETE CASCADE,
  session_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_influencer_clicks ON influencer_clicks(influencer_id);

-- sessions
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS influencer_token TEXT;

-- payments extras
ALTER TABLE payments ADD COLUMN IF NOT EXISTS order_id TEXT UNIQUE;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS yoomoney_operation_id TEXT UNIQUE;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS influencer_id UUID REFERENCES influencers(id);

-- bloggers link to influencers
ALTER TABLE bloggers ADD COLUMN IF NOT EXISTS influencer_id UUID REFERENCES influencers(id);

-- user_accounts profile link
ALTER TABLE user_accounts ADD COLUMN IF NOT EXISTS profile_user_id UUID REFERENCES users(id);

-- chat image column
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS image_url TEXT;
