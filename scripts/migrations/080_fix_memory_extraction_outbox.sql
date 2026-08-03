-- One chat turn must create one extraction job.
-- The previous unique index on (user_id, source_type, source_entity_id)
-- collapsed every turn in a session into a single row and froze completed jobs.

DROP INDEX IF EXISTS idx_memory_extraction_jobs_dedupe;

-- Soft-dedupe only while pending: identical message spam (double-click) collapses.
CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_extraction_jobs_pending_msg
  ON memory_extraction_jobs (
    user_id,
    source_type,
    md5(user_message)
  )
  WHERE status = 'pending';
