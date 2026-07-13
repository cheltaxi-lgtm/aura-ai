-- Server-side, single-use OAuth flow state.
-- Keep the historical Mail.ru identity value in the existing provider CHECK:
-- old identities must remain readable even though Mail.ru is no longer offered.

ALTER TABLE user_oauth_identities
  ADD COLUMN IF NOT EXISTS provider_email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS provider_gender TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_oauth_identities_gender_check'
  ) THEN
    ALTER TABLE user_oauth_identities
      ADD CONSTRAINT user_oauth_identities_gender_check
      CHECK (provider_gender IS NULL OR provider_gender IN ('male', 'female'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS oauth_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash BYTEA NOT NULL UNIQUE,
  provider TEXT NOT NULL CHECK (provider IN ('vk', 'yandex')),
  code_verifier TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  return_to TEXT NOT NULL,
  session_id TEXT,
  mode TEXT NOT NULL CHECK (mode IN ('login', 'register')),
  accepted_terms BOOLEAN NOT NULL DEFAULT FALSE,
  age_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  marketing_consent BOOLEAN NOT NULL DEFAULT FALSE,
  app_flow BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_oauth_transactions_expires
  ON oauth_transactions(expires_at);

CREATE TABLE IF NOT EXISTS oauth_pending_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash BYTEA NOT NULL UNIQUE,
  provider TEXT NOT NULL CHECK (provider IN ('vk', 'yandex')),
  provider_user_id TEXT NOT NULL,
  provider_email TEXT,
  provider_email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  provider_name TEXT NOT NULL,
  provider_gender TEXT CHECK (provider_gender IN ('male', 'female')),
  return_to TEXT NOT NULL,
  session_id TEXT,
  app_flow BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_oauth_pending_registrations_expires
  ON oauth_pending_registrations(expires_at);

CREATE TABLE IF NOT EXISTS oauth_handoffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash BYTEA NOT NULL UNIQUE,
  account_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_oauth_handoffs_expires
  ON oauth_handoffs(expires_at);
