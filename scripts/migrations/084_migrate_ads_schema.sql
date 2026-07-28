-- Ads Autopilot isolated schema. Rollback: DROP SCHEMA ads CASCADE;
CREATE SCHEMA IF NOT EXISTS ads;

CREATE TABLE IF NOT EXISTS ads.click (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  yclid TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,
  landing_path TEXT NOT NULL DEFAULT '/',
  visitor_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ads_click_created_at_idx ON ads.click (created_at);
CREATE INDEX IF NOT EXISTS ads_click_yclid_idx ON ads.click (yclid) WHERE yclid IS NOT NULL;

CREATE TABLE IF NOT EXISTS ads.click_user (
  click_id UUID NOT NULL REFERENCES ads.click(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (click_id, user_id),
  UNIQUE (user_id)
);

CREATE TABLE IF NOT EXISTS ads.conversion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  click_id UUID REFERENCES ads.click(id) ON DELETE SET NULL,
  visitor_hash TEXT,
  type TEXT NOT NULL CHECK (type IN (
    'deck_view','card_pick','spread_submit','teaser_view','registration','claim',
    'first_rune_spend','first_payment','repeat_payment'
  )),
  amount_rub NUMERIC(12,2),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  uploaded_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS ads_conversion_user_type_uidx
  ON ads.conversion (user_id, type)
  WHERE user_id IS NOT NULL AND type IN (
    'registration','claim','first_rune_spend','first_payment'
  );
-- timestamptz::date is not IMMUTABLE (session TZ). UTC wrapper is required for the index.
CREATE OR REPLACE FUNCTION ads.utc_date(ts timestamptz)
RETURNS date
LANGUAGE sql
IMMUTABLE
AS $$ SELECT ($1 AT TIME ZONE 'UTC')::date $$;

CREATE UNIQUE INDEX IF NOT EXISTS ads_conversion_micro_day_uidx
  ON ads.conversion (click_id, type, ads.utc_date(occurred_at))
  WHERE click_id IS NOT NULL AND type IN (
    'deck_view','card_pick','spread_submit','teaser_view'
  );
CREATE INDEX IF NOT EXISTS ads_conversion_occurred_at_idx ON ads.conversion (occurred_at);

CREATE TABLE IF NOT EXISTS ads.daily_stats (
  date DATE NOT NULL,
  campaign_id BIGINT NOT NULL DEFAULT 0,
  adgroup_id BIGINT NOT NULL DEFAULT 0,
  criterion_id BIGINT NOT NULL DEFAULT 0,
  impressions BIGINT NOT NULL DEFAULT 0,
  clicks BIGINT NOT NULL DEFAULT 0,
  cost_rub NUMERIC(12,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (date, campaign_id, adgroup_id, criterion_id)
);

CREATE TABLE IF NOT EXISTS ads.entity_snapshot (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  level TEXT NOT NULL CHECK (level IN ('campaign','adgroup','ad','keyword')),
  external_id TEXT NOT NULL,
  parent_id TEXT,
  name TEXT,
  status TEXT,
  moderation_status TEXT,
  daily_budget_rub NUMERIC(12,2),
  bid_rub NUMERIC(12,2),
  strategy_mode TEXT,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (level, external_id)
);

CREATE TABLE IF NOT EXISTS ads.keyword_candidate (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phrase TEXT NOT NULL,
  normalized TEXT NOT NULL,
  source TEXT NOT NULL,
  cluster_key TEXT,
  landing_path TEXT,
  freq_exact INTEGER,
  freq_phrase INTEGER,
  forecast_cpc_rub NUMERIC(12,2),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','pushed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ads_keyword_candidate_norm_idx ON ads.keyword_candidate (normalized);

CREATE TABLE IF NOT EXISTS ads.keyword_stat (
  phrase TEXT NOT NULL,
  region INTEGER NOT NULL DEFAULT 225,
  freq_exact INTEGER,
  freq_phrase INTEGER,
  seasonality_json JSONB,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (phrase, region)
);

CREATE TABLE IF NOT EXISTS ads.negative_keyword (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phrase TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'account'
    CHECK (scope IN ('account','campaign','adgroup')),
  scope_id TEXT,
  reason TEXT,
  auto BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ads.search_query (
  date DATE NOT NULL,
  campaign_id BIGINT NOT NULL DEFAULT 0,
  adgroup_id BIGINT NOT NULL DEFAULT 0,
  query TEXT NOT NULL,
  matched_keyword TEXT,
  clicks INTEGER NOT NULL DEFAULT 0,
  cost_rub NUMERIC(12,2) NOT NULL DEFAULT 0,
  deck_views INTEGER NOT NULL DEFAULT 0,
  spread_submits INTEGER NOT NULL DEFAULT 0,
  registrations INTEGER NOT NULL DEFAULT 0,
  decision TEXT,
  decided_at TIMESTAMPTZ,
  PRIMARY KEY (date, campaign_id, adgroup_id, query)
);

CREATE TABLE IF NOT EXISTS ads.funnel_daily (
  date DATE NOT NULL,
  campaign_id BIGINT NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  deck_views INTEGER NOT NULL DEFAULT 0,
  spread_submits INTEGER NOT NULL DEFAULT 0,
  teaser_views INTEGER NOT NULL DEFAULT 0,
  registrations INTEGER NOT NULL DEFAULT 0,
  claims INTEGER NOT NULL DEFAULT 0,
  first_payments INTEGER NOT NULL DEFAULT 0,
  revenue_rub NUMERIC(12,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (date, campaign_id)
);

CREATE TABLE IF NOT EXISTS ads.economics_snapshot (
  date DATE NOT NULL,
  cohort_days INTEGER NOT NULL DEFAULT 30,
  registrations INTEGER NOT NULL DEFAULT 0,
  payers INTEGER NOT NULL DEFAULT 0,
  revenue_rub NUMERIC(12,2) NOT NULL DEFAULT 0,
  arpu_per_registration_rub NUMERIC(12,2),
  cr_reg_to_payer NUMERIC(12,6),
  avg_check_rub NUMERIC(12,2),
  max_allowed_cpa_reg_rub NUMERIC(12,2),
  sample_size INTEGER NOT NULL DEFAULT 0,
  confidence TEXT NOT NULL DEFAULT 'low'
    CHECK (confidence IN ('low','medium','high')),
  PRIMARY KEY (date, cohort_days)
);

CREATE TABLE IF NOT EXISTS ads.rule_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule TEXT NOT NULL,
  target_level TEXT,
  target_id TEXT,
  decision TEXT NOT NULL,
  reason_json JSONB,
  applied BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ads.approval_request (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN (
    'budget_increase','bid_increase','global_cap_increase','new_landing',
    'new_cluster','mode_switch','optimization_goal_switch'
  )),
  target_level TEXT,
  target_id TEXT,
  current_value JSONB,
  proposed_value JSONB,
  rationale_json JSONB,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  decided_by UUID,
  decided_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS ads.action_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  payload_json JSONB,
  result_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ads.config (
  key TEXT PRIMARY KEY,
  value_json JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT
);

CREATE TABLE IF NOT EXISTS ads.alert (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  severity TEXT NOT NULL CHECK (severity IN ('info','warning','critical')),
  code TEXT NOT NULL,
  message TEXT NOT NULL,
  payload_json JSONB,
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Feature flags + discovery budget seed (source of truth also in config/ads/budget.yaml)
INSERT INTO ads.config (key, value_json, updated_by) VALUES
  ('ads.enabled', 'false'::jsonb, 'migration084'),
  ('ads.rules.enabled', 'false'::jsonb, 'migration084'),
  ('ads.autopilot.write', 'false'::jsonb, 'migration084'),
  ('budget', '{
    "mode":"discovery",
    "target_romi":3,
    "discovery_daily_cap_rub":300,
    "discovery_total_budget_rub":9000,
    "discovery_target_cpa_reg_rub":150,
    "discovery_max_cpa_reg_rub":400,
    "discovery_target_registrations":100,
    "discovery_freq_min":100,
    "discovery_freq_max":5000,
    "global_daily_cap_rub":300,
    "campaign_daily_budget_rub":300,
    "negative_min_clicks":30,
    "rules_window_days":3,
    "min_clicks_per_entity":30,
    "approval_ttl_hours":48,
    "ctr_min":0.005,
    "cpa_start_kill_rub":100,
    "cpa_reg_kill_rub":250,
    "cpa_rune_kill_rub":500
  }'::jsonb, 'migration084')
ON CONFLICT (key) DO NOTHING;
