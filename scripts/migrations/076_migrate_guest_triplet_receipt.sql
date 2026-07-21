-- Guest triplet resume: anonymous server-issued receipt on sessions (pre-auth).
-- Backfill not required — all new columns nullable.

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS guest_resume_token_hash TEXT,
  ADD COLUMN IF NOT EXISTS guest_resume_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS guest_resume_status TEXT,
  ADD COLUMN IF NOT EXISTS guest_resume_fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS guest_resume_reading_id UUID,
  ADD COLUMN IF NOT EXISTS guest_resume_claimed_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sessions_guest_resume_status_check'
  ) THEN
    ALTER TABLE sessions
      ADD CONSTRAINT sessions_guest_resume_status_check
      CHECK (
        guest_resume_status IS NULL
        OR guest_resume_status IN ('issued', 'claimed', 'reading_consumed', 'expired')
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sessions_guest_resume_reading_id_fkey'
  ) THEN
    ALTER TABLE sessions
      ADD CONSTRAINT sessions_guest_resume_reading_id_fkey
      FOREIGN KEY (guest_resume_reading_id)
      REFERENCES history(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_guest_resume_token_hash
  ON sessions (guest_resume_token_hash)
  WHERE guest_resume_token_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sessions_guest_resume_expiry
  ON sessions (guest_resume_expires_at)
  WHERE guest_resume_status = 'issued';
