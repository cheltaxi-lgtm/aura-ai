-- Guaranteed report-ready notifications: per-channel delivery rows with retry.
-- A row is created once per (job, channel); the worker processes due rows with
-- backoff so a completed paid report never loses its "готово" notice silently.

CREATE TABLE IF NOT EXISTS async_job_notification_deliveries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id          UUID NOT NULL REFERENCES async_jobs(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel         TEXT NOT NULL CHECK (channel IN ('in_app', 'email', 'telegram')),
  status          TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'delivered', 'failed', 'skipped')),
  title           TEXT NOT NULL,
  cta_path        TEXT,
  attempt_count   INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at    TIMESTAMPTZ,
  last_error      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(job_id, channel)
);

CREATE INDEX IF NOT EXISTS idx_report_deliveries_due
  ON async_job_notification_deliveries (next_attempt_at)
  WHERE status = 'pending';
