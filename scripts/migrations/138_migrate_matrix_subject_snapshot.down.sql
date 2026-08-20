ALTER TABLE matrix_subjects
  DROP COLUMN IF EXISTS matrix_snapshot,
  DROP COLUMN IF EXISTS as_of_date,
  DROP COLUMN IF EXISTS calculation_version;
