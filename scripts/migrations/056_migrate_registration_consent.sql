-- Registration legal/consent audit trail on user_accounts

ALTER TABLE user_accounts
  ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS age_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS marketing_consent BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS marketing_consent_at TIMESTAMPTZ;
