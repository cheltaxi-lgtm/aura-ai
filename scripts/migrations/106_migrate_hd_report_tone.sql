BEGIN;

-- Report tone (personal / child / work) — one SKU, different prompt framing.
DO $$
BEGIN
  IF to_regclass('public.hd_reports') IS NULL THEN
    RAISE NOTICE 'hd_reports missing — skip report_tone';
    RETURN;
  END IF;

  ALTER TABLE hd_reports
    ADD COLUMN IF NOT EXISTS report_tone TEXT NOT NULL DEFAULT 'personal';

  ALTER TABLE hd_reports
    DROP CONSTRAINT IF EXISTS hd_reports_report_tone_check;

  ALTER TABLE hd_reports
    ADD CONSTRAINT hd_reports_report_tone_check
    CHECK (report_tone IN ('personal', 'child', 'work'));
END $$;

COMMIT;
