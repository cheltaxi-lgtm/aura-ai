-- Spend idempotency: optional key on rune_transactions for chargeForSession dedupe.
-- Rollback:
--   DROP INDEX IF EXISTS idx_rune_transactions_spend_idempotency;
--   ALTER TABLE rune_transactions DROP COLUMN IF EXISTS idempotency_key;

ALTER TABLE rune_transactions
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

-- Partial unique: NULL keys stay non-unique (legacy rows / no-key path).
-- migrate.mjs wraps each file in a transaction — do NOT use CONCURRENTLY here.
CREATE UNIQUE INDEX IF NOT EXISTS idx_rune_transactions_spend_idempotency
  ON rune_transactions (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
