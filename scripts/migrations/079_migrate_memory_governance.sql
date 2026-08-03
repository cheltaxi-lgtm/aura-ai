-- Global client memory governance: consent prefs, structured facts,
-- extraction outbox, tombstones, and lifecycle columns.

CREATE TABLE IF NOT EXISTS user_memory_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  memory_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  auto_capture_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  sensitive_capture_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  event_reminders_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  consent_version TEXT,
  consent_granted_at TIMESTAMPTZ,
  consent_revoked_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE user_facts
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS source_entity_id UUID,
  ADD COLUMN IF NOT EXISTS subject_key TEXT,
  ADD COLUMN IF NOT EXISTS predicate_key TEXT,
  ADD COLUMN IF NOT EXISTS entity_key TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS confidence REAL NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS sensitivity TEXT NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS valid_from TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS valid_to TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS superseded_by UUID,
  ADD COLUMN IF NOT EXISTS last_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS embedding_model TEXT,
  ADD COLUMN IF NOT EXISTS embedding_version TEXT,
  ADD COLUMN IF NOT EXISTS consent_version TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_facts_status_check'
  ) THEN
    ALTER TABLE user_facts
      ADD CONSTRAINT user_facts_status_check
      CHECK (status IN ('active', 'superseded', 'rejected'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_facts_sensitivity_check'
  ) THEN
    ALTER TABLE user_facts
      ADD CONSTRAINT user_facts_sensitivity_check
      CHECK (sensitivity IN ('normal', 'sensitive'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_facts_active
  ON user_facts (user_id, updated_at DESC)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_user_facts_predicate
  ON user_facts (user_id, subject_key, predicate_key)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_user_facts_status_updated
  ON user_facts (status, updated_at ASC);

CREATE TABLE IF NOT EXISTS memory_extraction_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  source_entity_id UUID,
  character_id TEXT,
  user_message TEXT NOT NULL,
  assistant_reply TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_extraction_jobs_dedupe
  ON memory_extraction_jobs (user_id, source_type, source_entity_id)
  WHERE source_entity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_memory_extraction_jobs_pending
  ON memory_extraction_jobs (status, next_attempt_at ASC)
  WHERE status IN ('pending', 'running');

CREATE TABLE IF NOT EXISTS user_memory_tombstones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fact_hmac TEXT NOT NULL,
  predicate_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  UNIQUE (user_id, fact_hmac)
);

CREATE INDEX IF NOT EXISTS idx_user_memory_tombstones_user
  ON user_memory_tombstones (user_id, created_at DESC);

-- Existing users keep their facts visible in cabinet, but auto-capture stays off
-- until explicit opt-in. Pref rows are created lazily on first prefs API touch.
