-- Telegram login/link via bot deep-link (BotFather Login Widget domain optional).
CREATE TABLE IF NOT EXISTS telegram_auth_challenges (
  token TEXT PRIMARY KEY,
  purpose TEXT NOT NULL CHECK (purpose IN ('login', 'register', 'link')),
  user_account_id UUID NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
  accepted_terms BOOLEAN NOT NULL DEFAULT FALSE,
  age_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  marketing_consent BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'consumed', 'expired')),
  telegram_user_id BIGINT NULL,
  telegram_username TEXT NULL,
  telegram_first_name TEXT NULL,
  telegram_photo_url TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  confirmed_at TIMESTAMPTZ NULL,
  consumed_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_telegram_auth_challenges_status_expires
  ON telegram_auth_challenges (status, expires_at);

CREATE INDEX IF NOT EXISTS idx_telegram_auth_challenges_account
  ON telegram_auth_challenges (user_account_id)
  WHERE user_account_id IS NOT NULL;
