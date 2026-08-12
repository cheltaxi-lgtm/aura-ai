-- Guest Matrix pair compatibility continuity (pre-auth).
-- Raw claim token never stored. Unclaimed rows expire (TTL enforced in app).

CREATE TABLE IF NOT EXISTS matrix_pair_guest_pending (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date_a DATE NOT NULL,
  date_b DATE NOT NULL,
  name_a TEXT,
  name_b TEXT,
  calculation_version TEXT NOT NULL,
  compat_snapshot JSONB NOT NULL,
  claim_token_hash TEXT NOT NULL,
  claimed_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  claimed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT matrix_pair_guest_pending_claim_state CHECK (
    (claimed_user_id IS NULL AND claimed_at IS NULL)
    OR (claimed_user_id IS NOT NULL AND claimed_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_matrix_pair_guest_pending_claim_hash
  ON matrix_pair_guest_pending (claim_token_hash);

CREATE INDEX IF NOT EXISTS idx_matrix_pair_guest_pending_expires_unclaimed
  ON matrix_pair_guest_pending (expires_at)
  WHERE claimed_user_id IS NULL;
