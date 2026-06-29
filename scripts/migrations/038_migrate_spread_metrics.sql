CREATE TABLE IF NOT EXISTS spread_metrics (
  id BIGSERIAL PRIMARY KEY,
  event TEXT NOT NULL,
  spread_id TEXT NOT NULL,
  intention TEXT,
  character_id TEXT,
  card_count INT,
  cost INT,
  source TEXT,
  user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spread_metrics_created ON spread_metrics (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_spread_metrics_spread ON spread_metrics (spread_id);

ALTER TABLE daily_readings
  ADD COLUMN IF NOT EXISTS spread_id TEXT DEFAULT 'triplet';
