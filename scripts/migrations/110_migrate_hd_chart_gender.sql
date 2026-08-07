BEGIN;

-- Binary gender for other-person HD charts (Russian LLM address). Mechanics ignore it.
DO $$
BEGIN
  IF to_regclass('public.hd_charts') IS NULL THEN
    RAISE NOTICE 'hd_charts missing — skip gender';
    RETURN;
  END IF;

  ALTER TABLE hd_charts
    ADD COLUMN IF NOT EXISTS gender TEXT;

  ALTER TABLE hd_charts
    DROP CONSTRAINT IF EXISTS hd_charts_gender_check;

  ALTER TABLE hd_charts
    ADD CONSTRAINT hd_charts_gender_check
    CHECK (gender IS NULL OR gender IN ('male', 'female'));

  COMMENT ON COLUMN hd_charts.gender IS
    'male|female|NULL — пол субъекта other-карты для обращения в разборе; NULL для self и когда неизвестен';
END $$;

COMMIT;
