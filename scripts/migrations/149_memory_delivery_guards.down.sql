-- Roll back application/worker first with both services stopped. This removes fencing.
DROP INDEX IF EXISTS idx_memory_extraction_jobs_lease;
ALTER TABLE memory_extraction_jobs DROP COLUMN IF EXISTS claim_token;
ALTER TABLE memory_extraction_jobs DROP COLUMN IF EXISTS claimed_at;
ALTER TABLE memory_extraction_jobs DROP COLUMN IF EXISTS capture_generation;
ALTER TABLE user_memory_preferences DROP COLUMN IF EXISTS capture_generation;
