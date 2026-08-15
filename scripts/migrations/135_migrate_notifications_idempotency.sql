-- Optional logical idempotency for in-app notifications.
-- Specialized Daily Cards slot and report-ready delivery ledger stay authoritative.
-- Rollback:
--   DROP INDEX IF EXISTS idx_notifications_user_idempotency;
--   ALTER TABLE notifications DROP COLUMN IF EXISTS idempotency_key;

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

-- Partial unique: NULL keys stay non-unique (legacy rows / no-key path).
-- migrate.mjs wraps each file in a transaction — do NOT use CONCURRENTLY here.
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_user_idempotency
  ON notifications (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
