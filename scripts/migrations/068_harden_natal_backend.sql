-- Backend hardening for joint synthesis, private report targets, and natal pricing.
ALTER TABLE joint_readings
  ADD COLUMN IF NOT EXISTS combined_claim_token UUID,
  ADD COLUMN IF NOT EXISTS combined_claim_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completion_notified_at TIMESTAMPTZ;

-- Clear the legacy empty-string claim sentinel; explicit claim columns replace it.
UPDATE joint_readings
SET combined_reading = NULL
WHERE combined_reading = '';

CREATE OR REPLACE FUNCTION validate_private_report_share_target()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.report_kind = 'natal' THEN
    IF NOT EXISTS (
      SELECT 1 FROM natal_report_history
      WHERE id = NEW.report_id AND user_id = NEW.owner_user_id
    ) THEN
      RAISE EXCEPTION 'invalid natal report share target' USING ERRCODE = '23503';
    END IF;
  ELSIF NEW.report_kind = 'relationship' THEN
    IF NOT EXISTS (
      SELECT 1 FROM joint_readings
      WHERE id = NEW.report_id
        AND status = 'completed'
        AND (initiator_user_id = NEW.owner_user_id OR partner_user_id = NEW.owner_user_id)
    ) THEN
      RAISE EXCEPTION 'invalid relationship report share target' USING ERRCODE = '23503';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_private_report_share_target ON private_report_shares;
CREATE TRIGGER trg_validate_private_report_share_target
  BEFORE INSERT OR UPDATE OF owner_user_id, report_kind, report_id
  ON private_report_shares
  FOR EACH ROW EXECUTE FUNCTION validate_private_report_share_target();

UPDATE platform_settings
SET value = jsonb_set(
  jsonb_set(value, '{costs,NATAL_READING}', '20'::jsonb, true),
  '{costs,FORECAST_REPORT}', '20'::jsonb, true
)
WHERE key = 'runes';

-- 065 originally shipped with an enabled-by-default backfill. Keep explicit
-- preference saves (which advance updated_at), but disable untouched rows and
-- make every future insert require an explicit opt-in.
ALTER TABLE natal_event_preferences
  ALTER COLUMN enabled SET DEFAULT FALSE;

UPDATE natal_event_preferences
SET enabled = FALSE,
    updated_at = NOW()
WHERE enabled = TRUE
  AND updated_at = created_at;
