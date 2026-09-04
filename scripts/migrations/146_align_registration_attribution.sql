-- Migration 074 was marked as represented by the bootstrap snapshot through 116,
-- but its column was missing there. Repair those databases; existing installs
-- with first-touch attribution already present keep all values unchanged.
ALTER TABLE user_accounts
  ADD COLUMN IF NOT EXISTS registration_attribution JSONB;

COMMENT ON COLUMN user_accounts.registration_attribution IS
  'First-touch UTM/clid snapshot at account creation (immutable once set).';
