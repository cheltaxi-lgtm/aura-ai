-- Seed dirty markers for existing users who already have eligible raw memory.
-- Does not rebuild. Worker drains the queue asynchronously.
-- Concurrent write-path markers keep newer generation semantics.

CREATE TABLE IF NOT EXISTS user_memory_intelligence_metrics (
  metric TEXT PRIMARY KEY,
  value BIGINT NOT NULL DEFAULT 0
);

INSERT INTO user_memory_intelligence_metrics (metric, value)
VALUES ('rebuild_truncated', 0)
ON CONFLICT (metric) DO NOTHING;

INSERT INTO user_memory_intelligence_dirty (
  user_id,
  dirty_at,
  attempts,
  last_error,
  processing_at,
  generation
)
SELECT DISTINCT
  user_id,
  NOW(),
  0,
  NULL::text,
  NULL::timestamptz,
  1
FROM user_facts
WHERE status IN ('active', 'superseded')
ON CONFLICT (user_id) DO UPDATE SET
  dirty_at = NOW(),
  last_error = NULL,
  generation = user_memory_intelligence_dirty.generation + 1;
