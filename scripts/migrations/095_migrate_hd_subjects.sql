-- Human Design: charts for another person (subject), like matrix subjects.
BEGIN;

ALTER TABLE hd_charts
  ADD COLUMN IF NOT EXISTS subject_kind TEXT NOT NULL DEFAULT 'self',
  ADD COLUMN IF NOT EXISTS subject_name TEXT;

COMMENT ON COLUMN hd_charts.subject_kind IS 'self | other — чья это карта для владельца аккаунта';
COMMENT ON COLUMN hd_charts.subject_name IS 'Имя человека, если карта сделана не на себя';

COMMIT;
