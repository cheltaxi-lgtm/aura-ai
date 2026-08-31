DROP INDEX IF EXISTS idx_aura_guest_snapshots_photo_hash;

ALTER TABLE aura_guest_snapshots
  DROP COLUMN IF EXISTS photo_hash;
