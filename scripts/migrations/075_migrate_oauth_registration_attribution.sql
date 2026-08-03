-- Carry first-touch UTM through OAuth start → callback → account INSERT.
ALTER TABLE oauth_transactions
  ADD COLUMN IF NOT EXISTS registration_attribution JSONB;

ALTER TABLE oauth_pending_registrations
  ADD COLUMN IF NOT EXISTS registration_attribution JSONB;
