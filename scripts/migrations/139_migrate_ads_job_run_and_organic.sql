-- Ads job last_run tracking + organic query registry + SEO experiments.
-- Does not grant Direct write. Organic/SEO work with ads.observe and autopilot.write=false.

CREATE TABLE IF NOT EXISTS ads.job_run (
  job TEXT PRIMARY KEY,
  last_run_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_error TEXT,
  last_duration_ms INTEGER,
  last_ok BOOLEAN
);

CREATE TABLE IF NOT EXISTS ads.search_query_organic (
  query TEXT PRIMARY KEY,
  cluster TEXT,
  target_url TEXT,
  frequency INTEGER,
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  ctr NUMERIC(8,4),
  current_position NUMERIC(8,2),
  previous_position NUMERIC(8,2),
  delta NUMERIC(8,2),
  organic_traffic INTEGER,
  opportunity_score INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'WATCH'
    CHECK (status IN ('WATCH','PUSH','PROTECT','EXPAND','IGNORE')),
  wordstat_rising BOOLEAN NOT NULL DEFAULT FALSE,
  commercial BOOLEAN NOT NULL DEFAULT FALSE,
  landing_match BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ads_search_query_organic_score_idx
  ON ads.search_query_organic (opportunity_score DESC, status);

CREATE TABLE IF NOT EXISTS ads.search_position_history (
  query TEXT NOT NULL,
  captured_at DATE NOT NULL,
  position NUMERIC(8,2),
  impressions INTEGER,
  clicks INTEGER,
  ctr NUMERIC(8,4),
  PRIMARY KEY (query, captured_at)
);

CREATE TABLE IF NOT EXISTS ads.seo_experiment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query TEXT,
  url TEXT NOT NULL,
  action TEXT NOT NULL,
  old_value JSONB,
  new_value JSONB,
  reason TEXT,
  score INTEGER,
  position_before NUMERIC(8,2),
  position_3d NUMERIC(8,2),
  position_7d NUMERIC(8,2),
  position_14d NUMERIC(8,2),
  position_30d NUMERIC(8,2),
  clicks_before INTEGER,
  impressions_before INTEGER,
  ctr_before NUMERIC(8,4),
  clicks_after INTEGER,
  impressions_after INTEGER,
  ctr_after NUMERIC(8,4),
  result TEXT CHECK (result IS NULL OR result IN ('KEEP','ROLLBACK','NEXT','PENDING')),
  rollback_of UUID,
  approval_id UUID,
  auto_safe BOOLEAN NOT NULL DEFAULT FALSE,
  applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ads_seo_experiment_url_idx ON ads.seo_experiment (url, created_at DESC);

CREATE TABLE IF NOT EXISTS ads.seo_override (
  path TEXT NOT NULL,
  field TEXT NOT NULL CHECK (field IN (
    'title','description','h1','canonical','robots','schema_json','internal_links'
  )),
  old_value TEXT,
  new_value TEXT,
  experiment_id UUID,
  applied BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (path, field)
);

ALTER TABLE ads.approval_request DROP CONSTRAINT IF EXISTS approval_request_kind_check;
ALTER TABLE ads.approval_request
  ADD CONSTRAINT approval_request_kind_check CHECK (kind IN (
    'budget_increase','bid_increase','global_cap_increase','new_landing',
    'new_cluster','mode_switch','optimization_goal_switch',
    'seo_safe_fix','seo_content_change','seo_route_change'
  ));
