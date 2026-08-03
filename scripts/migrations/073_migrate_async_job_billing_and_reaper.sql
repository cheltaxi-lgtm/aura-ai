-- Track charge ledger on async natal jobs + support stale-running reclaim.
ALTER TABLE async_jobs
  ADD COLUMN IF NOT EXISTS charge_transaction_id TEXT;

CREATE INDEX IF NOT EXISTS idx_async_jobs_stale_running
  ON async_jobs (locked_at)
  WHERE status = 'running';

CREATE INDEX IF NOT EXISTS idx_async_jobs_active_dedup
  ON async_jobs (user_id, kind, created_at DESC)
  WHERE status IN ('pending', 'running');
