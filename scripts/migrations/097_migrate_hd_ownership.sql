-- HD ownership hardening.
-- 1) Charts become per-owner: the same fingerprint may exist once per user
--    and once in the shared guest pool (was: one global row per fingerprint,
--    which leaked subject labels across users and let strangers overwrite them).
-- 2) Guest charts get a random claim_token: only the browser that created the
--    chart can attach it to an account (was: bare fingerprint = claim capability).
-- 3) Composite reports become per-user (was: one global row per chart pair,
--    which permanently blocked the second user with CLAIM_BUSY).
BEGIN;

ALTER TABLE hd_charts DROP CONSTRAINT IF EXISTS hd_charts_fingerprint_key;

ALTER TABLE hd_charts
  ADD COLUMN IF NOT EXISTS owner_key UUID
  GENERATED ALWAYS AS (COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid)) STORED;

CREATE UNIQUE INDEX IF NOT EXISTS hd_charts_fingerprint_owner_key
  ON hd_charts (fingerprint, owner_key);

ALTER TABLE hd_charts ADD COLUMN IF NOT EXISTS claim_token TEXT;
CREATE INDEX IF NOT EXISTS idx_hd_charts_claim_token
  ON hd_charts (claim_token) WHERE claim_token IS NOT NULL;

ALTER TABLE hd_composite_reports
  DROP CONSTRAINT IF EXISTS hd_composite_reports_base_chart_id_partner_chart_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS hd_composite_reports_pair_user_key
  ON hd_composite_reports (base_chart_id, partner_chart_id, user_id);

COMMIT;
