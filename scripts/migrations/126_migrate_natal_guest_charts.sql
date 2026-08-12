-- Guest Natal continuity: server-saved chart artifact + hashed claim capability.
-- Raw claim token never stored. Unclaimed rows expire (default TTL enforced in app).

CREATE TABLE IF NOT EXISTS natal_guest_charts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  birth_date DATE NOT NULL,
  birth_time TEXT,
  time_known BOOLEAN NOT NULL DEFAULT FALSE,
  place_label TEXT NOT NULL,
  birth_lat DOUBLE PRECISION NOT NULL,
  birth_lon DOUBLE PRECISION NOT NULL,
  birth_tzid TEXT NOT NULL,
  birth_fingerprint TEXT NOT NULL,
  chart_data JSONB NOT NULL,
  engine_version TEXT NOT NULL,
  claim_token_hash TEXT NOT NULL,
  claimed_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  claimed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT natal_guest_charts_claim_state CHECK (
    (claimed_user_id IS NULL AND claimed_at IS NULL)
    OR (claimed_user_id IS NOT NULL AND claimed_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_natal_guest_charts_claim_hash
  ON natal_guest_charts (claim_token_hash);

CREATE INDEX IF NOT EXISTS idx_natal_guest_charts_expires_unclaimed
  ON natal_guest_charts (expires_at)
  WHERE claimed_user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_natal_guest_charts_claimed_user
  ON natal_guest_charts (claimed_user_id)
  WHERE claimed_user_id IS NOT NULL;
