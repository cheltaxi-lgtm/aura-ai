DROP INDEX IF EXISTS idx_notifications_user_idempotency;
ALTER TABLE notifications DROP COLUMN IF EXISTS idempotency_key;
