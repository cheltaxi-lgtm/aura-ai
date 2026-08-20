-- Immutable Matrix snapshot on the subject, independent of AI report.
-- Live calc persists here immediately. Historical report structured_data is unchanged.
-- Rollback:
--   ALTER TABLE matrix_subjects
--     DROP COLUMN IF EXISTS matrix_snapshot,
--     DROP COLUMN IF EXISTS as_of_date,
--     DROP COLUMN IF EXISTS calculation_version;

ALTER TABLE matrix_subjects
  ADD COLUMN IF NOT EXISTS as_of_date DATE,
  ADD COLUMN IF NOT EXISTS calculation_version TEXT,
  ADD COLUMN IF NOT EXISTS matrix_snapshot JSONB;
