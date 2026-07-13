-- OAuth identities (VK, Yandex, Mail.ru) for user accounts

ALTER TABLE user_accounts
  ALTER COLUMN password_hash DROP NOT NULL;

CREATE TABLE IF NOT EXISTS user_oauth_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_account_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('vk', 'yandex', 'mailru')),
  provider_user_id TEXT NOT NULL,
  provider_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, provider_user_id)
);

CREATE INDEX IF NOT EXISTS idx_oauth_identities_account
  ON user_oauth_identities(user_account_id);

CREATE INDEX IF NOT EXISTS idx_oauth_identities_email
  ON user_oauth_identities(lower(provider_email))
  WHERE provider_email IS NOT NULL;
