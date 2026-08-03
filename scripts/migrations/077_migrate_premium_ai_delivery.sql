-- Premium AI delivery: generalize durable jobs beyond natal,
-- add dedupe/provenance/output linking, and prepare rollout kinds.

ALTER TABLE async_jobs
  DROP CONSTRAINT IF EXISTS async_jobs_kind_check;

ALTER TABLE async_jobs
  ADD CONSTRAINT async_jobs_kind_check
  CHECK (kind IN (
    'reading',
    'image_generate',
    'natal_interpretation',
    'natal_forecast',
    'natal_compatibility',
    'intention_spread',
    'daily_reading',
    'daily_extended',
    'joint_reading',
    'photo_reading',
    'ritual_generation',
    'numerology_reading'
  ));

ALTER TABLE async_jobs
  ADD COLUMN IF NOT EXISTS dedupe_key TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS action_type TEXT,
  ADD COLUMN IF NOT EXISTS output_entity_id UUID,
  ADD COLUMN IF NOT EXISTS output_entity_table TEXT,
  ADD COLUMN IF NOT EXISTS provenance JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ;

-- Normalize charge_transaction_id to UUID FK when values are valid UUIDs.
DO $$
BEGIN
  -- Clear non-UUID junk so the cast cannot fail.
  UPDATE async_jobs
  SET charge_transaction_id = NULL
  WHERE charge_transaction_id IS NOT NULL
    AND charge_transaction_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'async_jobs'
      AND column_name = 'charge_transaction_id'
      AND data_type = 'text'
  ) THEN
    ALTER TABLE async_jobs
      ALTER COLUMN charge_transaction_id TYPE UUID
      USING NULLIF(charge_transaction_id, '')::uuid;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'async_jobs_charge_transaction_id_fkey'
  ) THEN
    ALTER TABLE async_jobs
      ADD CONSTRAINT async_jobs_charge_transaction_id_fkey
      FOREIGN KEY (charge_transaction_id)
      REFERENCES rune_transactions(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_async_jobs_dedupe_active
  ON async_jobs (user_id, kind, dedupe_key)
  WHERE status IN ('pending', 'running')
    AND dedupe_key <> '';

CREATE INDEX IF NOT EXISTS idx_async_jobs_next_attempt
  ON async_jobs (next_attempt_at)
  WHERE status = 'pending' AND next_attempt_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_async_jobs_output_entity
  ON async_jobs (output_entity_table, output_entity_id)
  WHERE output_entity_id IS NOT NULL;
