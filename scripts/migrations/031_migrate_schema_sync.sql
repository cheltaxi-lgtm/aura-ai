-- Idempotent schema sync: brings older databases to match src/lib/schema.sql (2026-06)
-- Safe to re-run. No DROP TABLE / DROP COLUMN / TRUNCATE.

-- === users ===
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS starter_runes_granted BOOLEAN NOT NULL DEFAULT FALSE;

-- === sessions (consultation model + chat meta) ===
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS character_key TEXT,
  ADD COLUMN IF NOT EXISTS intention TEXT,
  ADD COLUMN IF NOT EXISTS spread_type TEXT,
  ADD COLUMN IF NOT EXISTS cards JSONB,
  ADD COLUMN IF NOT EXISTS awaiting_context BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sessions_status_check'
  ) THEN
    ALTER TABLE sessions
      ADD CONSTRAINT sessions_status_check
      CHECK (status IN ('active', 'completed'));
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_sessions_user_character
  ON sessions (user_id, character_key, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_sessions_active
  ON sessions (user_id, character_key, status, updated_at DESC);

-- === session_memories ===
ALTER TABLE session_memories
  ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES sessions(id) ON DELETE SET NULL;

DROP INDEX IF EXISTS idx_session_memories_session_id;
DROP INDEX IF EXISTS idx_session_memories_session_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_session_memories_session_unique
  ON session_memories (session_id)
  WHERE session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_session_memories_user_created
  ON session_memories (user_id, created_at DESC);

-- === chat_messages ===
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_character_created
  ON chat_messages (session_id, character_id, created_at ASC);

-- === payments ===
CREATE INDEX IF NOT EXISTS idx_payments_referrer ON payments(referrer_slug);

-- === user_accounts ===
CREATE INDEX IF NOT EXISTS idx_user_accounts_unlimited ON user_accounts(is_unlimited)
  WHERE is_unlimited = TRUE;

-- === rune_transactions ===
ALTER TABLE rune_transactions
  ADD COLUMN IF NOT EXISTS shown_receipt BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_rune_transactions_unshown
  ON rune_transactions (user_id, created_at DESC)
  WHERE shown_receipt = FALSE
    AND type IN ('purchase', 'achievement', 'daily_bonus', 'bonus');

-- === user_achievements ===
CREATE INDEX IF NOT EXISTS idx_user_achievements_user ON user_achievements(user_id);

-- === platform_settings seeds ===
INSERT INTO platform_settings (key, value)
VALUES (
  'runes',
  '{
    "enabled": true,
    "rubPerRune": 2,
    "starterRunes": 30,
    "freeQuestions": 2,
    "costs": {
      "QUESTION": 10,
      "VISION_ANALYSIS": 30,
      "READING": 15,
      "DESTINY_CARD": 20,
      "JOINT_READING": 25,
      "DAILY_AMULET": 5,
      "FINAL_REPORT": 30
    }
  }'::jsonb
)
ON CONFLICT (key) DO NOTHING;
