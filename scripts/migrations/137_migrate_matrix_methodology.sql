-- Immutable Matrix snapshots: methodology id + renderer/as-of metadata.
-- Does not rewrite structured_data or content. Old rows stay legacy.
-- Rollback:
--   ALTER TABLE numerology_report_history
--     DROP COLUMN IF EXISTS methodology_id,
--     DROP COLUMN IF EXISTS renderer_version,
--     DROP COLUMN IF EXISTS as_of_date;
--   ALTER TABLE matrix_guest_pending DROP COLUMN IF EXISTS methodology_id;
--   ALTER TABLE matrix_pair_guest_pending DROP COLUMN IF EXISTS methodology_id;

ALTER TABLE numerology_report_history
  ADD COLUMN IF NOT EXISTS methodology_id TEXT NOT NULL DEFAULT 'zovus-matrix-legacy',
  ADD COLUMN IF NOT EXISTS renderer_version TEXT,
  ADD COLUMN IF NOT EXISTS as_of_date DATE;

UPDATE numerology_report_history
SET methodology_id = CASE
  WHEN split_part(calculation_version, '@', 1) = 'matrix-v4' THEN 'zovus-matrix-22-v1'
  WHEN split_part(calculation_version, '@', 1) = 'matrix-v3' THEN 'zovus-matrix-subtract22-v3'
  ELSE 'zovus-matrix-legacy'
END
WHERE methodology_id = 'zovus-matrix-legacy'
   OR methodology_id IS NULL;

ALTER TABLE matrix_guest_pending
  ADD COLUMN IF NOT EXISTS methodology_id TEXT NOT NULL DEFAULT 'zovus-matrix-legacy';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'matrix_pair_guest_pending'
  ) THEN
    ALTER TABLE matrix_pair_guest_pending
      ADD COLUMN IF NOT EXISTS methodology_id TEXT NOT NULL DEFAULT 'zovus-matrix-legacy';
  END IF;
END $$;
