-- Standalone paid natal compatibility. This intentionally does not reuse
-- joint_readings, which is a Tarot product with different lifecycle/billing.
CREATE TABLE IF NOT EXISTS natal_compatibility_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  participant_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  canonical_report_id UUID REFERENCES natal_compatibility_reports(id) ON DELETE SET NULL,
  mode TEXT NOT NULL CHECK (mode IN ('manual', 'invite')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'ready', 'completed', 'expired')),
  owner_label TEXT NOT NULL CHECK (length(btrim(owner_label)) BETWEEN 1 AND 80),
  partner_label TEXT NOT NULL CHECK (length(btrim(partner_label)) BETWEEN 1 AND 80),
  owner_fingerprint TEXT NOT NULL CHECK (owner_fingerprint ~ '^[a-f0-9]{64}$'),
  partner_fingerprint TEXT CHECK (
    partner_fingerprint IS NULL OR partner_fingerprint ~ '^[a-f0-9]{64}$'
  ),
  pair_fingerprint TEXT CHECK (
    pair_fingerprint IS NULL OR pair_fingerprint ~ '^[a-f0-9]{64}$'
  ),
  invite_token_hash BYTEA UNIQUE,
  invite_token_prefix TEXT,
  synastry_snapshot JSONB,
  report_data JSONB,
  evidence_refs JSONB,
  rune_cost INTEGER CHECK (rune_cost IS NULL OR rune_cost >= 0),
  charge_transaction_id UUID UNIQUE REFERENCES rune_transactions(id) ON DELETE SET NULL,
  generation_claim_token UUID,
  generation_claim_at TIMESTAMPTZ,
  claimed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT natal_compatibility_mode_token CHECK (
    (mode = 'manual' AND invite_token_hash IS NULL) OR
    (mode = 'invite' AND invite_token_hash IS NOT NULL)
  ),
  CONSTRAINT natal_compatibility_ready_data CHECK (
    status IN ('pending', 'expired') OR
    (partner_fingerprint IS NOT NULL AND pair_fingerprint IS NOT NULL AND synastry_snapshot IS NOT NULL)
  ),
  CONSTRAINT natal_compatibility_completed_data CHECK (
    status <> 'completed' OR
    (report_data IS NOT NULL AND evidence_refs IS NOT NULL AND completed_at IS NOT NULL)
  ),
  CONSTRAINT natal_compatibility_snapshot_private CHECK (
    synastry_snapshot IS NULL OR NOT (
      jsonb_path_exists(synastry_snapshot, '$.**.birthDate') OR
      jsonb_path_exists(synastry_snapshot, '$.**.birthTime') OR
      jsonb_path_exists(synastry_snapshot, '$.**.birthCity') OR
      jsonb_path_exists(synastry_snapshot, '$.**.latitude') OR
      jsonb_path_exists(synastry_snapshot, '$.**.longitude') OR
      jsonb_path_exists(synastry_snapshot, '$.**.timezone')
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_natal_compatibility_owner_created
  ON natal_compatibility_reports(owner_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_natal_compatibility_participant_created
  ON natal_compatibility_reports(participant_user_id, created_at DESC)
  WHERE participant_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_natal_compatibility_expiry
  ON natal_compatibility_reports(expires_at)
  WHERE status <> 'expired';
CREATE UNIQUE INDEX IF NOT EXISTS idx_natal_compatibility_owner_pair
  ON natal_compatibility_reports(owner_user_id, pair_fingerprint)
  WHERE pair_fingerprint IS NOT NULL AND status <> 'expired';

UPDATE platform_settings
SET value = jsonb_set(
      value,
      '{costs,SYNASTRY_REPORT}',
      COALESCE(value #> '{costs,SYNASTRY_REPORT}', '30'::jsonb),
      true
    ),
    updated_at = NOW()
WHERE key = 'runes';

ALTER TABLE private_report_shares
  DROP CONSTRAINT IF EXISTS private_report_shares_report_kind_check;
ALTER TABLE private_report_shares
  ADD CONSTRAINT private_report_shares_report_kind_check
  CHECK (report_kind IN ('natal', 'relationship', 'compatibility'));

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
  ELSIF NEW.report_kind = 'compatibility' THEN
    IF NOT EXISTS (
      SELECT 1 FROM natal_compatibility_reports
      WHERE id = NEW.report_id
        AND status = 'completed'
        AND (owner_user_id = NEW.owner_user_id OR participant_user_id = NEW.owner_user_id)
    ) THEN
      RAISE EXCEPTION 'invalid compatibility report share target' USING ERRCODE = '23503';
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
