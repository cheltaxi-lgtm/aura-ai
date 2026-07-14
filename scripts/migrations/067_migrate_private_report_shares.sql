-- Explicit, revocable publication snapshots for premium reports.
CREATE TABLE IF NOT EXISTS private_report_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE CHECK (length(token) >= 43),
  report_kind TEXT NOT NULL CHECK (report_kind IN ('natal', 'relationship')),
  report_id UUID NOT NULL,
  selected_sections TEXT[] NOT NULL CHECK (cardinality(selected_sections) > 0),
  public_payload JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_private_report_shares_owner
  ON private_report_shares(owner_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_private_report_shares_active_token
  ON private_report_shares(token)
  WHERE revoked_at IS NULL;
