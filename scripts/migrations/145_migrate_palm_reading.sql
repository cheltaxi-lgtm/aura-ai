-- Palm reading by photo: guest snapshot claim + durable job kind.
-- Guest snapshot stores ONLY the structured vision result (lines/mounts/type),
-- never the original palm photo. Raw claim token never stored (hash only).
-- Rollback: scripts/migrations/145_migrate_palm_reading.down.sql

CREATE TABLE IF NOT EXISTS palm_guest_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot JSONB NOT NULL,
  engine_version TEXT NOT NULL,
  claim_token_hash TEXT NOT NULL,
  photo_hash TEXT,
  claimed_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  claimed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT palm_guest_snapshots_claim_state CHECK (
    (claimed_user_id IS NULL AND claimed_at IS NULL)
    OR (claimed_user_id IS NOT NULL AND claimed_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_palm_guest_snapshots_claim_hash
  ON palm_guest_snapshots (claim_token_hash);

CREATE INDEX IF NOT EXISTS idx_palm_guest_snapshots_expires_unclaimed
  ON palm_guest_snapshots (expires_at)
  WHERE claimed_user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_palm_guest_snapshots_claimed_user
  ON palm_guest_snapshots (claimed_user_id)
  WHERE claimed_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_palm_guest_snapshots_photo_hash
  ON palm_guest_snapshots (photo_hash)
  WHERE photo_hash IS NOT NULL;

ALTER TABLE async_jobs
  DROP CONSTRAINT IF EXISTS async_jobs_kind_check;

ALTER TABLE async_jobs
  ADD CONSTRAINT async_jobs_kind_check
  CHECK (kind IN (
    'reading',
    'image_generate',
    'natal_interpretation',
    'natal_forecast',
    'natal_compatibility',
    'intention_spread',
    'daily_reading',
    'daily_extended',
    'joint_reading',
    'joint_combined',
    'photo_reading',
    'ritual_generation',
    'numerology_reading',
    'hd_report',
    'hd_composite_report',
    'pro_premium_report',
    'aura_reading',
    'palm_reading'
  ));
