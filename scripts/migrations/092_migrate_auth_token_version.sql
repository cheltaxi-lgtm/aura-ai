-- JWT revoke: bump token_version on password reset / forced logout.
-- Tokens minted without tv are treated as version 0.

ALTER TABLE user_accounts
  ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;

-- Idempotent subscription/bonus credits keyed by payment_id.
CREATE UNIQUE INDEX IF NOT EXISTS idx_rune_transactions_bonus_payment_id
  ON rune_transactions (payment_id)
  WHERE type = 'bonus' AND payment_id IS NOT NULL;
