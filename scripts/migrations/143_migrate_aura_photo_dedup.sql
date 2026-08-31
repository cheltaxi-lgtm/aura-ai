-- Aura stability: same portrait → same reading.
-- photo_hash (sha256 of image bytes) lets the teaser recognize an identical
-- upload and reuse the stored snapshot instead of re-rolling the vision model.
-- The photo itself is still never persisted — only its hash.
-- Rollback: scripts/migrations/143_migrate_aura_photo_dedup.down.sql

ALTER TABLE aura_guest_snapshots
  ADD COLUMN IF NOT EXISTS photo_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_aura_guest_snapshots_photo_hash
  ON aura_guest_snapshots (photo_hash)
  WHERE photo_hash IS NOT NULL;
