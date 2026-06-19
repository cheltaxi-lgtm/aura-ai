-- Безлимитный доступ для пользователей (админка)
ALTER TABLE user_accounts
  ADD COLUMN IF NOT EXISTS is_unlimited BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_user_accounts_unlimited ON user_accounts(is_unlimited)
  WHERE is_unlimited = TRUE;
