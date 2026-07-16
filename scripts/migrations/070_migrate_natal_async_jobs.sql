-- Durable worker claims for paid natal report generation.
ALTER TABLE async_jobs
  DROP CONSTRAINT IF EXISTS async_jobs_kind_check;

ALTER TABLE async_jobs
  ADD CONSTRAINT async_jobs_kind_check
  CHECK (kind IN (
    'reading',
    'image_generate',
    'natal_interpretation',
    'natal_forecast',
    'natal_compatibility'
  ));

ALTER TABLE async_jobs
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS worker_id TEXT,
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS period_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS error_code TEXT,
  ADD COLUMN IF NOT EXISTS billing_state TEXT NOT NULL DEFAULT 'unbilled'
    CHECK (billing_state IN ('unbilled', 'charged', 'refunded', 'completed'));

CREATE INDEX IF NOT EXISTS idx_async_jobs_worker_claim
  ON async_jobs (created_at)
  WHERE status = 'pending';
