-- Background jobs for long-running API work (readings, image generation).

CREATE TABLE IF NOT EXISTS async_jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('reading', 'image_generate')),
  status        TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  input         JSONB NOT NULL DEFAULT '{}'::jsonb,
  result        JSONB,
  error_message TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours'
);

CREATE INDEX IF NOT EXISTS idx_async_jobs_user_created
  ON async_jobs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_async_jobs_pending
  ON async_jobs (created_at)
  WHERE status IN ('pending', 'running');
