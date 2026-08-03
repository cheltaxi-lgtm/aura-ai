DROP INDEX IF EXISTS idx_oauth_transactions_link_account;

ALTER TABLE oauth_transactions DROP COLUMN IF EXISTS link_account_id;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'oauth_transactions_mode_check'
  ) THEN
    ALTER TABLE oauth_transactions DROP CONSTRAINT oauth_transactions_mode_check;
  END IF;
END $$;

ALTER TABLE oauth_transactions
  ADD CONSTRAINT oauth_transactions_mode_check
  CHECK (mode IN ('login', 'register'));
