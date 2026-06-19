-- Distributed rate limiting buckets (shared across PM2 workers)
CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  bucket_key TEXT PRIMARY KEY,
  count INT NOT NULL DEFAULT 1,
  reset_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_reset ON rate_limit_buckets(reset_at);

-- Periodic cleanup (optional manual: DELETE FROM rate_limit_buckets WHERE reset_at < NOW() - INTERVAL '1 day')
