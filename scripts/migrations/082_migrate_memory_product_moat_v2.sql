-- Personal memory product moat v2: session controls, safe drafts and privacy-safe analytics.

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS memory_read_mode TEXT NOT NULL DEFAULT 'default';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sessions_memory_read_mode_check'
  ) THEN
    ALTER TABLE sessions
      ADD CONSTRAINT sessions_memory_read_mode_check
      CHECK (memory_read_mode IN ('default', 'fresh'));
  END IF;
END $$;

ALTER TABLE user_memory_preferences
  ADD COLUMN IF NOT EXISTS memory_moments_mode TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS memory_cabinet_mode TEXT NOT NULL DEFAULT 'simple',
  ADD COLUMN IF NOT EXISTS memory_rollout_bucket SMALLINT,
  ADD COLUMN IF NOT EXISTS memory_prompt_variant TEXT,
  ADD COLUMN IF NOT EXISTS memory_choice_email_version TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_memory_moments_mode_check'
  ) THEN
    ALTER TABLE user_memory_preferences
      ADD CONSTRAINT user_memory_moments_mode_check
      CHECK (memory_moments_mode IN ('active', 'quiet'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_memory_cabinet_mode_check'
  ) THEN
    ALTER TABLE user_memory_preferences
      ADD CONSTRAINT user_memory_cabinet_mode_check
      CHECK (memory_cabinet_mode IN ('simple', 'advanced'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_memory_rollout_bucket_check'
  ) THEN
    ALTER TABLE user_memory_preferences
      ADD CONSTRAINT user_memory_rollout_bucket_check
      CHECK (memory_rollout_bucket BETWEEN 0 AND 99);
  END IF;
END $$;

ALTER TABLE user_facts
  ADD COLUMN IF NOT EXISTS capture_tier TEXT NOT NULL DEFAULT 'durable';

ALTER TABLE user_facts DROP CONSTRAINT IF EXISTS user_facts_status_check;
ALTER TABLE user_facts
  ADD CONSTRAINT user_facts_status_check
  CHECK (status IN ('draft', 'active', 'superseded', 'rejected'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_facts_capture_tier_check'
  ) THEN
    ALTER TABLE user_facts
      ADD CONSTRAINT user_facts_capture_tier_check
      CHECK (capture_tier IN ('draft', 'durable', 'user_confirmed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_facts_draft
  ON user_facts (user_id, updated_at DESC)
  WHERE status = 'draft';

ALTER TABLE user_memory_activity
  DROP CONSTRAINT IF EXISTS user_memory_activity_fact_id_fkey;
ALTER TABLE user_memory_activity
  ADD CONSTRAINT user_memory_activity_fact_id_fkey
  FOREIGN KEY (fact_id) REFERENCES user_facts(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS session_memory_fact_decisions (
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fact_id UUID NOT NULL REFERENCES user_facts(id) ON DELETE CASCADE,
  decision TEXT NOT NULL CHECK (decision IN ('included', 'excluded')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (session_id, fact_id)
);

CREATE INDEX IF NOT EXISTS idx_session_memory_fact_decisions_user
  ON session_memory_fact_decisions (user_id, session_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS memory_product_events (
  id BIGSERIAL PRIMARY KEY,
  event TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id UUID REFERENCES user_accounts(id) ON DELETE SET NULL,
  session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  source_type TEXT,
  prompt_version TEXT,
  consent_version TEXT,
  rollout_bucket SMALLINT CHECK (rollout_bucket BETWEEN 0 AND 99),
  variant TEXT,
  memory_enabled BOOLEAN,
  auto_capture_enabled BOOLEAN,
  moments_mode TEXT,
  fact_category TEXT,
  fact_source_type TEXT,
  sensitivity TEXT,
  numeric_value NUMERIC(14, 2),
  properties JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_memory_product_events_event_created
  ON memory_product_events (event, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memory_product_events_user_created
  ON memory_product_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memory_product_events_variant
  ON memory_product_events (prompt_version, variant, created_at DESC)
  WHERE prompt_version IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_product_events_once
  ON memory_product_events (user_id, event, prompt_version, variant)
  WHERE event IN ('consent_prompt_shown', 'consent_choice_enabled', 'consent_choice_disabled');
