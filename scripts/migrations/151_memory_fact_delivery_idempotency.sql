CREATE TABLE IF NOT EXISTS memory_extraction_fact_writes (
  job_id UUID NOT NULL REFERENCES memory_extraction_jobs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fact_hmac TEXT NOT NULL,
  PRIMARY KEY (job_id, fact_hmac)
);
