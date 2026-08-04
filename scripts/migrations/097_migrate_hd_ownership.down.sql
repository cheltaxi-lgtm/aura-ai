-- Rollback for 097_migrate_hd_ownership.sql.
-- NOTE: fails if duplicate fingerprints per owner or duplicate composite pairs
-- per user appeared while the new model was active — dedupe manually first.
BEGIN;

DROP INDEX IF EXISTS hd_composite_reports_pair_user_key;
ALTER TABLE hd_composite_reports
  ADD CONSTRAINT hd_composite_reports_base_chart_id_partner_chart_id_key
  UNIQUE (base_chart_id, partner_chart_id);

DROP INDEX IF EXISTS idx_hd_charts_claim_token;
ALTER TABLE hd_charts DROP COLUMN IF EXISTS claim_token;

DROP INDEX IF EXISTS hd_charts_fingerprint_owner_key;
ALTER TABLE hd_charts DROP COLUMN IF EXISTS owner_key;
ALTER TABLE hd_charts ADD CONSTRAINT hd_charts_fingerprint_key UNIQUE (fingerprint);

COMMIT;
