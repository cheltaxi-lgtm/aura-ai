BEGIN;

DO $$
BEGIN
  IF to_regclass('public.hd_charts') IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE hd_charts
    DROP CONSTRAINT IF EXISTS hd_charts_gender_check;

  ALTER TABLE hd_charts
    DROP COLUMN IF EXISTS gender;
END $$;

COMMIT;
