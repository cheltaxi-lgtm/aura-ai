-- Matching birth data do not grant access to a different participant's report.
DROP INDEX IF EXISTS idx_natal_compatibility_owner_pair;
CREATE UNIQUE INDEX idx_natal_compatibility_owner_pair
  ON natal_compatibility_reports(owner_user_id, pair_fingerprint,
    COALESCE(participant_user_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE pair_fingerprint IS NOT NULL AND status <> 'expired';
