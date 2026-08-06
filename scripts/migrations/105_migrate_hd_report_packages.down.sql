BEGIN;

ALTER TABLE hd_reports DROP CONSTRAINT IF EXISTS hd_reports_package_id_check;
ALTER TABLE hd_reports DROP COLUMN IF EXISTS included_asks_remaining;
ALTER TABLE hd_reports DROP COLUMN IF EXISTS package_id;

COMMIT;
