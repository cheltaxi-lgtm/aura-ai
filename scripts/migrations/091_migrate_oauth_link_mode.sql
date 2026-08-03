-- OAuth mode=link: attach Yandex/VK to an already authenticated account (bot shell upgrade).

ALTER TABLE oauth_transactions
  ADD COLUMN IF NOT EXISTS link_account_id UUID REFERENCES user_accounts(id) ON DELETE CASCADE;

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
  CHECK (mode IN ('login', 'register', 'link'));

CREATE INDEX IF NOT EXISTS idx_oauth_transactions_link_account
  ON oauth_transactions(link_account_id)
  WHERE link_account_id IS NOT NULL;
