-- HD composite (compatibility) reports between two charts.
CREATE TABLE IF NOT EXISTS hd_composite_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  base_chart_id UUID NOT NULL REFERENCES hd_charts(id) ON DELETE CASCADE,
  partner_chart_id UUID NOT NULL REFERENCES hd_charts(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'error')),
  report_text TEXT,
  model TEXT,
  transaction_id TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (base_chart_id, partner_chart_id)
);

CREATE INDEX IF NOT EXISTS hd_composite_reports_user_idx ON hd_composite_reports (user_id, created_at DESC);
