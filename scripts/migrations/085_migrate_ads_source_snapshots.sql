-- Ads Autopilot: cached read-only snapshots from Direct / Metrika / Webmaster.
-- No FK to public. Rollback pieces: DROP TABLE ads.source_snapshot, ads.metrika_goal_stat, ads.webmaster_query_daily;

CREATE TABLE IF NOT EXISTS ads.source_snapshot (
  source TEXT PRIMARY KEY CHECK (source IN ('direct','metrika','webmaster','health')),
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ok BOOLEAN NOT NULL DEFAULT FALSE,
  error TEXT,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS ads.metrika_goal_stat (
  date DATE NOT NULL,
  goal_id BIGINT NOT NULL,
  goal_name TEXT,
  reaches INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (date, goal_id)
);
CREATE INDEX IF NOT EXISTS ads_metrika_goal_stat_date_idx ON ads.metrika_goal_stat (date);

CREATE TABLE IF NOT EXISTS ads.webmaster_query_daily (
  date DATE NOT NULL,
  query TEXT NOT NULL,
  clicks INTEGER NOT NULL DEFAULT 0,
  shows INTEGER NOT NULL DEFAULT 0,
  position NUMERIC(8,2),
  PRIMARY KEY (date, query)
);
CREATE INDEX IF NOT EXISTS ads_webmaster_query_daily_date_idx ON ads.webmaster_query_daily (date);

-- Observe mode: admin UI + source sync without spending (beacon still needs ads.enabled)
INSERT INTO ads.config (key, value_json, updated_by) VALUES
  ('ads.observe', 'true'::jsonb, 'migration085')
ON CONFLICT (key) DO NOTHING;
