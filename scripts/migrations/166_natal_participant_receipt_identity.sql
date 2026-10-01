-- Preserve a receipt's participant identity when the account FK becomes NULL.
-- This opaque identifier is never returned by APIs and grants no access.
ALTER TABLE natal_compatibility_reports ADD COLUMN IF NOT EXISTS participant_identity_id uuid;
UPDATE natal_compatibility_reports SET participant_identity_id=participant_user_id
 WHERE participant_identity_id IS NULL AND participant_user_id IS NOT NULL;
CREATE OR REPLACE FUNCTION retain_natal_participant_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.participant_identity_id IS NULL AND NEW.participant_user_id IS NOT NULL THEN
    NEW.participant_identity_id := NEW.participant_user_id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS retain_natal_participant_identity ON natal_compatibility_reports;
CREATE TRIGGER retain_natal_participant_identity BEFORE INSERT OR UPDATE OF participant_user_id
 ON natal_compatibility_reports FOR EACH ROW EXECUTE FUNCTION retain_natal_participant_identity();
DROP INDEX IF EXISTS idx_natal_compatibility_owner_pair;
CREATE UNIQUE INDEX idx_natal_compatibility_owner_pair
 ON natal_compatibility_reports(owner_user_id,pair_fingerprint,
   COALESCE(participant_identity_id,'00000000-0000-0000-0000-000000000000'::uuid))
 WHERE pair_fingerprint IS NOT NULL AND status<>'expired';
