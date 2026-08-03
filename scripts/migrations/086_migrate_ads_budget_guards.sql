-- Ads Autopilot budget protection layer (B1–B7).
-- Rollback: DROP TABLE ads.budget_ledger; DROP TABLE ads.health_check;
--           DELETE FROM ads.config WHERE key LIKE 'hard_%' OR key LIKE 'budget_warn%'
--             OR key LIKE 'stats_stale%' OR key LIKE 'discovery_max_days%'
--             OR key LIKE 'landing_timeout%' OR key LIKE 'guard.%';
--           ALTER TABLE ads.entity_snapshot DROP COLUMN IF EXISTS pause_reason;

CREATE TABLE IF NOT EXISTS ads.budget_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  campaign_id BIGINT NOT NULL DEFAULT 0,
  cost_rub NUMERIC(12,2) NOT NULL DEFAULT 0,
  source TEXT NOT NULL CHECK (source IN ('direct_report','realtime_estimate')),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ads_budget_ledger_date_idx ON ads.budget_ledger (date);
CREATE INDEX IF NOT EXISTS ads_budget_ledger_recorded_idx ON ads.budget_ledger (recorded_at DESC);

CREATE TABLE IF NOT EXISTS ads.health_check (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('landing','api_direct','api_metrika','cron_freshness')),
  status_code INTEGER,
  latency_ms INTEGER,
  ok BOOLEAN NOT NULL DEFAULT FALSE,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  detail_json JSONB
);
CREATE INDEX IF NOT EXISTS ads_health_check_kind_checked_idx
  ON ads.health_check (kind, checked_at DESC);
CREATE INDEX IF NOT EXISTS ads_health_check_target_idx ON ads.health_check (target);

ALTER TABLE ads.entity_snapshot
  ADD COLUMN IF NOT EXISTS pause_reason TEXT;

INSERT INTO ads.config (key, value_json, updated_by) VALUES
  ('hard_total_budget_rub', '9000'::jsonb, 'migration086'),
  ('budget_warn_pct', '90'::jsonb, 'migration086'),
  ('stats_stale_warn_hours', '24'::jsonb, 'migration086'),
  ('stats_stale_stop_hours', '48'::jsonb, 'migration086'),
  ('discovery_max_days', '45'::jsonb, 'migration086'),
  ('landing_timeout_ms', '5000'::jsonb, 'migration086'),
  ('guard.sync_stats_fail_streak', '0'::jsonb, 'migration086'),
  ('guard.landing_paused_ids', '[]'::jsonb, 'migration086'),
  ('guard.cpa_paused_ids', '[]'::jsonb, 'migration086'),
  ('guard.protection_status', '{}'::jsonb, 'migration086')
ON CONFLICT (key) DO NOTHING;
