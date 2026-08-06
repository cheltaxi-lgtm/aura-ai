BEGIN;

ALTER TABLE hd_reports
  ADD COLUMN IF NOT EXISTS package_id TEXT NOT NULL DEFAULT 'depth',
  ADD COLUMN IF NOT EXISTS included_asks_remaining INTEGER NOT NULL DEFAULT 0;

ALTER TABLE hd_reports
  DROP CONSTRAINT IF EXISTS hd_reports_package_id_check;

ALTER TABLE hd_reports
  ADD CONSTRAINT hd_reports_package_id_check
  CHECK (package_id IN ('depth', 'max'));

COMMIT;
