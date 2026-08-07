BEGIN;

-- Relation of an "other" chart to the owner's self (pair-report scenario).
DO $$
BEGIN
  IF to_regclass('public.hd_charts') IS NULL THEN
    RAISE NOTICE 'hd_charts missing — skip relation_to_self';
    RETURN;
  END IF;

  ALTER TABLE hd_charts
    ADD COLUMN IF NOT EXISTS relation_to_self TEXT;

  ALTER TABLE hd_charts
    DROP CONSTRAINT IF EXISTS hd_charts_relation_to_self_check;

  ALTER TABLE hd_charts
    ADD CONSTRAINT hd_charts_relation_to_self_check
    CHECK (
      relation_to_self IS NULL
      OR relation_to_self IN ('partner', 'friend', 'child', 'colleague', 'business')
    );

  COMMENT ON COLUMN hd_charts.relation_to_self IS
    'partner|friend|child|colleague|business — тип связи other-карты к владельцу; NULL для self';
END $$;

COMMIT;
