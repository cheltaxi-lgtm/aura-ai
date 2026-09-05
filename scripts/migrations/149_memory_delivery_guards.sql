-- Keep old workers stopped during rollout; new claims fence all automatic writes.
ALTER TABLE user_memory_preferences ADD COLUMN IF NOT EXISTS capture_generation BIGINT NOT NULL DEFAULT 0;
ALTER TABLE memory_extraction_jobs ADD COLUMN IF NOT EXISTS capture_generation BIGINT NOT NULL DEFAULT 0;
ALTER TABLE memory_extraction_jobs ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;
ALTER TABLE memory_extraction_jobs ADD COLUMN IF NOT EXISTS claim_token UUID;
CREATE INDEX IF NOT EXISTS idx_memory_extraction_jobs_lease
  ON memory_extraction_jobs (claimed_at) WHERE status = 'running';
