-- Daily login rune bonus
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS last_daily_bonus TIMESTAMPTZ;

ALTER TABLE rune_transactions DROP CONSTRAINT IF EXISTS rune_transactions_type_check;

ALTER TABLE rune_transactions
  ADD CONSTRAINT rune_transactions_type_check
  CHECK (type IN ('purchase', 'spend', 'bonus', 'refund', 'daily_bonus'));
