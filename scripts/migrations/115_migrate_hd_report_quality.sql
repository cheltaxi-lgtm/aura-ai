-- HD report quality gate: needs_regeneration + validator findings JSON.
ALTER TABLE hd_reports DROP CONSTRAINT IF EXISTS hd_reports_status_check;
ALTER TABLE hd_reports
  ADD CONSTRAINT hd_reports_status_check
  CHECK (status IN ('pending', 'done', 'error', 'needs_regeneration'));

ALTER TABLE hd_reports
  ADD COLUMN IF NOT EXISTS quality_findings JSONB NULL;
ALTER TABLE hd_reports
  ADD COLUMN IF NOT EXISTS quality_updated_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_hd_reports_needs_regen
  ON hd_reports (created_at DESC)
  WHERE status = 'needs_regeneration';
