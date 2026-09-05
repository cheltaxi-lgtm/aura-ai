ALTER TABLE user_memory_preferences ADD COLUMN IF NOT EXISTS memory_purged_at TIMESTAMPTZ;
-- Only fact references/versions; no copies of forgotten personal content.
CREATE TABLE IF NOT EXISTS user_memory_context_receipts (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  context_key TEXT NOT NULL,
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  product TEXT NOT NULL,
  fact_versions JSONB NOT NULL DEFAULT '[]'::jsonb,
  capture_generation BIGINT NOT NULL,
  prepared_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, context_key)
);
CREATE INDEX IF NOT EXISTS idx_memory_context_receipts_recent
  ON user_memory_context_receipts (user_id, prepared_at DESC);
