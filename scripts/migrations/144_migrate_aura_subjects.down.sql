DROP INDEX IF EXISTS idx_aura_guest_snapshots_subject;

ALTER TABLE aura_guest_snapshots
  DROP COLUMN IF EXISTS subject_id,
  DROP COLUMN IF EXISTS subject_kind,
  DROP COLUMN IF EXISTS subject_name;

DROP TABLE IF EXISTS aura_subjects;
