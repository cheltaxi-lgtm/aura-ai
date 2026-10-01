-- Paid regenerations are separate immutable receipts, including the original snapshot.
ALTER TABLE natal_report_history
  ADD COLUMN IF NOT EXISTS generation_revision uuid NOT NULL
    DEFAULT '00000000-0000-0000-0000-000000000000';
ALTER TABLE natal_report_history DROP CONSTRAINT IF EXISTS natal_report_history_version_unique;
ALTER TABLE natal_report_history ADD CONSTRAINT natal_report_history_version_unique UNIQUE (
  user_id, birth_fingerprint, engine_version, ephemeris, tradition, report_type, generation_revision
);
