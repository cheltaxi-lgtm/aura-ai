-- Personal-memory consent choice, provenance, activity and feedback.

ALTER TABLE user_memory_preferences
  ADD COLUMN IF NOT EXISTS memory_initial_choice TEXT,
  ADD COLUMN IF NOT EXISTS memory_initial_choice_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS memory_initial_prompt_version TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_memory_initial_choice_check'
  ) THEN
    ALTER TABLE user_memory_preferences
      ADD CONSTRAINT user_memory_initial_choice_check
      CHECK (memory_initial_choice IN ('enabled', 'disabled'));
  END IF;
END $$;

-- Existing explicit grants should not be prompted again. Disabled/missing rows
-- remain unchosen so every other existing user receives the one-time choice.
UPDATE user_memory_preferences
   SET memory_initial_choice = 'enabled',
       memory_initial_choice_at = COALESCE(consent_granted_at, updated_at),
       memory_initial_prompt_version = 'personal-memory-v1-2026-07-23'
 WHERE memory_enabled = TRUE
   AND consent_granted_at IS NOT NULL
   AND memory_initial_choice IS NULL;

ALTER TABLE user_facts
  ADD COLUMN IF NOT EXISTS evidence_quote TEXT,
  ADD COLUMN IF NOT EXISTS source_captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS confirmation_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE memory_extraction_jobs
  ADD COLUMN IF NOT EXISTS extracted_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stored_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS grounding_rejected_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_user_facts_activity
  ON user_facts (user_id, source_captured_at DESC)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_user_facts_timeline
  ON user_facts (user_id, predicate_key, valid_from DESC);

CREATE TABLE IF NOT EXISTS user_memory_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fact_id UUID REFERENCES user_facts(id) ON DELETE CASCADE,
  source_entity_id UUID,
  activity_type TEXT NOT NULL DEFAULT 'learned'
    CHECK (activity_type IN ('learned', 'confirmed', 'changed', 'forgotten')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  seen_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_user_memory_activity_unseen
  ON user_memory_activity (user_id, created_at DESC)
  WHERE seen_at IS NULL;
