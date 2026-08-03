-- First-touch UTM / click-id attribution for ad ROI (set once at registration).
ALTER TABLE user_accounts
  ADD COLUMN IF NOT EXISTS registration_attribution JSONB;

COMMENT ON COLUMN user_accounts.registration_attribution IS
  'First-touch UTM/clid snapshot at account creation (immutable once set).';
