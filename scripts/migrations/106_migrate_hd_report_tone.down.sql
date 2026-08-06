BEGIN;

DO $$
BEGIN
  IF to_regclass('public.hd_reports') IS NULL THEN
    RETURN;
  END IF;
  ALTER TABLE hd_reports DROP CONSTRAINT IF EXISTS hd_reports_report_tone_check;
  ALTER TABLE hd_reports DROP COLUMN IF EXISTS report_tone;
END $$;

COMMIT;
