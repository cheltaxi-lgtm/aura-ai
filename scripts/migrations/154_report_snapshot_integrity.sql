-- Preserve original report evidence and serialize share creation with source deletion.
ALTER TABLE natal_report_history ADD COLUMN IF NOT EXISTS chart_snapshot JSONB;
ALTER TABLE hd_reports ADD COLUMN IF NOT EXISTS chart_snapshot JSONB;
ALTER TABLE hd_composite_reports ADD COLUMN IF NOT EXISTS base_snapshot JSONB;
ALTER TABLE hd_composite_reports ADD COLUMN IF NOT EXISTS partner_snapshot JSONB;

CREATE OR REPLACE FUNCTION validate_private_report_share_target()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.report_kind = 'natal' THEN
    PERFORM 1 FROM natal_report_history
      WHERE id = NEW.report_id AND user_id = NEW.owner_user_id
      FOR KEY SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'invalid natal report share target' USING ERRCODE = '23503';
    END IF;
  ELSIF NEW.report_kind = 'relationship' THEN
    PERFORM 1 FROM joint_readings
      WHERE id = NEW.report_id
        AND status = 'completed'
        AND (initiator_user_id = NEW.owner_user_id OR partner_user_id = NEW.owner_user_id)
      FOR KEY SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'invalid relationship report share target' USING ERRCODE = '23503';
    END IF;
  ELSIF NEW.report_kind = 'compatibility' THEN
    PERFORM 1 FROM natal_compatibility_reports
      WHERE id = NEW.report_id
        AND status = 'completed'
        AND (owner_user_id = NEW.owner_user_id OR participant_user_id = NEW.owner_user_id)
      FOR KEY SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'invalid compatibility report share target' USING ERRCODE = '23503';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Suppression survives deletion of a fact and prevents late jobs re-learning old sources.
CREATE TABLE IF NOT EXISTS user_memory_source_suppressions (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_entity_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, source_entity_id)
);
