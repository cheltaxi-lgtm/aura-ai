-- Aura reading by photo: guest snapshot claim + durable job kind.
-- Guest snapshot stores ONLY the structured vision result (colors/layers/chakras),
-- never the original face photo. Raw claim token never stored (hash only).
-- Rollback: scripts/migrations/142_migrate_aura_reading.down.sql

CREATE TABLE IF NOT EXISTS aura_guest_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot JSONB NOT NULL,
  engine_version TEXT NOT NULL,
  claim_token_hash TEXT NOT NULL,
  claimed_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  claimed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT aura_guest_snapshots_claim_state CHECK (
    (claimed_user_id IS NULL AND claimed_at IS NULL)
    OR (claimed_user_id IS NOT NULL AND claimed_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_aura_guest_snapshots_claim_hash
  ON aura_guest_snapshots (claim_token_hash);

CREATE INDEX IF NOT EXISTS idx_aura_guest_snapshots_expires_unclaimed
  ON aura_guest_snapshots (expires_at)
  WHERE claimed_user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_aura_guest_snapshots_claimed_user
  ON aura_guest_snapshots (claimed_user_id)
  WHERE claimed_user_id IS NOT NULL;

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
    'aura_reading'
  ));
