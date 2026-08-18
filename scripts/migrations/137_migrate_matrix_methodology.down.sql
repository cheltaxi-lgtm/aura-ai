ALTER TABLE numerology_report_history
  DROP COLUMN IF EXISTS methodology_id,
  DROP COLUMN IF EXISTS renderer_version,
  DROP COLUMN IF EXISTS as_of_date;

ALTER TABLE matrix_guest_pending
  DROP COLUMN IF EXISTS methodology_id;

ALTER TABLE matrix_pair_guest_pending
  DROP COLUMN IF EXISTS methodology_id;
