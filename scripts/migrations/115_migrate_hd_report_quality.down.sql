DROP INDEX IF EXISTS idx_hd_reports_needs_regen;
ALTER TABLE hd_reports DROP COLUMN IF EXISTS quality_updated_at;
ALTER TABLE hd_reports DROP COLUMN IF EXISTS quality_findings;
ALTER TABLE hd_reports DROP CONSTRAINT IF EXISTS hd_reports_status_check;
ALTER TABLE hd_reports
  ADD CONSTRAINT hd_reports_status_check
  CHECK (status IN ('pending', 'done', 'error'));
