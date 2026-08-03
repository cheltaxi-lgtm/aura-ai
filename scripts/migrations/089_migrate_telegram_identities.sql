-- Telegram Login Widget identities (additive). One telegram_user_id → one account.

CREATE TABLE IF NOT EXISTS user_telegram_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_account_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
  telegram_user_id BIGINT NOT NULL,
  username TEXT,
  photo_url TEXT,
  first_name TEXT,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ,
  CONSTRAINT user_telegram_identities_telegram_user_id_unique UNIQUE (telegram_user_id),
  CONSTRAINT user_telegram_identities_account_unique UNIQUE (user_account_id)
);

CREATE INDEX IF NOT EXISTS idx_telegram_identities_account
  ON user_telegram_identities(user_account_id);
