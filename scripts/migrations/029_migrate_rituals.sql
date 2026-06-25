-- Ritual sessions
CREATE TABLE IF NOT EXISTS rituals (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  character_key    TEXT NOT NULL,
  ritual_type      TEXT NOT NULL
    CHECK (ritual_type IN (
      'love','money','protection','luck','release'
    )),
  status           TEXT NOT NULL DEFAULT 'questions'
    CHECK (status IN (
      'questions',
      'spread',
      'payment',
      'generating',
      'completed',
      'reviewed'
    )),

  answers          JSONB DEFAULT '[]',
  cards            JSONB DEFAULT '[]',
  moon_phase       TEXT,
  moon_sign        TEXT,

  ritual_time      TEXT,
  ritual_place     TEXT,
  ritual_items     JSONB DEFAULT '[]',
  ritual_steps     JSONB DEFAULT '[]',
  ritual_words     TEXT,
  ritual_word_of_power TEXT,
  ritual_forbids   JSONB DEFAULT '[]',
  ritual_signs     JSONB DEFAULT '[]',

  rune_cost        INTEGER NOT NULL DEFAULT 0,
  payment_status   TEXT NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('free','pending','paid')),
  transaction_id   UUID REFERENCES rune_transactions(id),

  outcome_text     TEXT,
  outcome_rating   INTEGER CHECK (outcome_rating BETWEEN 1 AND 5),
  outcome_shared   BOOLEAN DEFAULT FALSE,
  remind_at        TIMESTAMPTZ,
  reminded_at      TIMESTAMPTZ,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ritual_outcomes_public (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ritual_type      TEXT NOT NULL,
  character_key    TEXT NOT NULL,
  outcome_text     TEXT NOT NULL,
  outcome_rating   INTEGER NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rituals_user
  ON rituals (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_rituals_remind
  ON rituals (remind_at)
  WHERE status = 'completed' AND reminded_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_ritual_outcomes_type
  ON ritual_outcomes_public (ritual_type, character_key);

CREATE TABLE IF NOT EXISTS notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  data       JSONB DEFAULT '{}',
  read       BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications (user_id, created_at DESC)
  WHERE read = FALSE;

ALTER TABLE rituals
  ADD COLUMN IF NOT EXISTS ritual_word_of_power_transcription TEXT;
