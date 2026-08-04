BEGIN;

ALTER TABLE hd_charts
  DROP COLUMN IF EXISTS subject_name,
  DROP COLUMN IF EXISTS subject_kind;

COMMIT;
