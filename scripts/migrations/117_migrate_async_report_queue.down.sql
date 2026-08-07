DROP INDEX IF EXISTS idx_async_jobs_report_pending;
DROP INDEX IF EXISTS idx_async_jobs_needs_regeneration;

ALTER TABLE async_jobs
  DROP COLUMN IF EXISTS progress,
  DROP COLUMN IF EXISTS retry_429_count,
  DROP COLUMN IF EXISTS llm_cost_rub,
  DROP COLUMN IF EXISTS llm_calls,
  DROP COLUMN IF EXISTS generation_ms,
  DROP COLUMN IF EXISTS queue_wait_ms,
  DROP COLUMN IF EXISTS started_at;

-- Move any needs_regeneration rows to failed before tightening the check.
UPDATE async_jobs
SET status = 'failed',
    error_code = COALESCE(error_code, 'needs_regeneration'),
    updated_at = NOW()
WHERE status = 'needs_regeneration';

ALTER TABLE async_jobs
  DROP CONSTRAINT IF EXISTS async_jobs_status_check;

ALTER TABLE async_jobs
  ADD CONSTRAINT async_jobs_status_check
  CHECK (status IN ('pending', 'running', 'completed', 'failed'));
