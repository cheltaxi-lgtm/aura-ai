-- Paid report queue: metrics + needs_regeneration status (manual QA, not auto-retry).
-- pending Phase 0 calibration for concurrency env defaults (code-side).

ALTER TABLE async_jobs
  DROP CONSTRAINT IF EXISTS async_jobs_status_check;

ALTER TABLE async_jobs
  ADD CONSTRAINT async_jobs_status_check
  CHECK (status IN ('pending', 'running', 'completed', 'failed', 'needs_regeneration'));

ALTER TABLE async_jobs
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS queue_wait_ms INTEGER,
  ADD COLUMN IF NOT EXISTS generation_ms INTEGER,
  ADD COLUMN IF NOT EXISTS llm_calls INTEGER,
  ADD COLUMN IF NOT EXISTS llm_cost_rub NUMERIC(12, 4),
  ADD COLUMN IF NOT EXISTS retry_429_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS progress JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_async_jobs_needs_regeneration
  ON async_jobs (updated_at DESC)
  WHERE status = 'needs_regeneration';

CREATE INDEX IF NOT EXISTS idx_async_jobs_report_pending
  ON async_jobs (created_at)
  WHERE status = 'pending'
    AND kind IN (
      'hd_report',
      'hd_composite_report',
      'pro_premium_report',
      'numerology_reading',
      'natal_interpretation',
      'natal_forecast',
      'natal_compatibility'
    );
