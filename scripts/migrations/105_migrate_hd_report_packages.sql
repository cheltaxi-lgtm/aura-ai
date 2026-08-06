BEGIN;

-- Guard: test DBs bootstrapped from schema.sql (through 100) may not include
-- HD tables even though 094 is ledger-marked applied. Prod has hd_reports.
DO $$
BEGIN
  IF to_regclass('public.hd_reports') IS NULL THEN
    RAISE NOTICE 'hd_reports missing — skip package columns (schema snapshot gap)';
    RETURN;
  END IF;

  ALTER TABLE hd_reports
    ADD COLUMN IF NOT EXISTS package_id TEXT NOT NULL DEFAULT 'depth',
    ADD COLUMN IF NOT EXISTS included_asks_remaining INTEGER NOT NULL DEFAULT 0;

  ALTER TABLE hd_reports
    DROP CONSTRAINT IF EXISTS hd_reports_package_id_check;

  ALTER TABLE hd_reports
    ADD CONSTRAINT hd_reports_package_id_check
    CHECK (package_id IN ('depth', 'max'));
END $$;

COMMIT;
