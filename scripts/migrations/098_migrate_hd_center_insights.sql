-- HD center insights: persist paid per-center interpretations.
-- The unique (chart_id, user_id, center) index doubles as the idempotency
-- key: a repeat purchase returns the cached text instead of charging again,
-- and a crash between charge and response can never lose a paid insight.
BEGIN;

CREATE TABLE IF NOT EXISTS hd_center_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chart_id UUID NOT NULL REFERENCES hd_charts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  center TEXT NOT NULL,
  insight_text TEXT NOT NULL,
  transaction_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS hd_center_insights_owner_key
  ON hd_center_insights (chart_id, user_id, center);

COMMIT;
