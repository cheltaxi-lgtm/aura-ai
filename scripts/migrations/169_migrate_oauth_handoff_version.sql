-- Outstanding unversioned login capabilities cannot survive credential revoke.
-- Deployment invalidates these short-lived tokens; fresh login mints a versioned one.
-- Restore migration 051 tables omitted by the canonical bootstrap snapshot.
CREATE TABLE IF NOT EXISTS email_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL,
  template TEXT NOT NULL,
  provider TEXT,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'skipped')),
  error_message TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_log_created ON email_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_log_template ON email_log (template, created_at DESC);
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_account_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_password_reset_account ON password_reset_tokens (user_account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_password_reset_expires ON password_reset_tokens (expires_at) WHERE used_at IS NULL;
DROP TRIGGER IF EXISTS erasure_ref_user_account_id ON password_reset_tokens;
CREATE TRIGGER erasure_ref_user_account_id BEFORE INSERT OR UPDATE OF user_account_id ON password_reset_tokens
  FOR EACH ROW EXECUTE FUNCTION enforce_erasure_reference_fence('user_accounts', 'user_account_id');

ALTER TABLE oauth_handoffs ADD COLUMN IF NOT EXISTS token_version INTEGER;
DELETE FROM oauth_handoffs WHERE token_version IS NULL;
ALTER TABLE oauth_handoffs ALTER COLUMN token_version SET NOT NULL;

-- The general reference fence skips updates whose owner does not change.
-- Session metadata still creates personal data, so lock/recheck on every write.
CREATE OR REPLACE FUNCTION enforce_active_session_owner() RETURNS trigger AS $$
DECLARE requested TIMESTAMPTZ;
BEGIN
  IF NEW.user_id IS NULL THEN RETURN NEW; END IF;
  SELECT erasure_requested_at INTO requested FROM users WHERE id = NEW.user_id FOR SHARE;
  IF requested IS NOT NULL THEN
    RAISE EXCEPTION 'account_erasure_pending' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS active_session_owner_fence ON sessions;
CREATE TRIGGER active_session_owner_fence BEFORE UPDATE ON sessions
  FOR EACH ROW EXECUTE FUNCTION enforce_active_session_owner();

-- Keep only the recipient fingerprint during the existing 30-day erasure
-- outbox retention. A delayed provider response must not recreate email PII.
CREATE OR REPLACE FUNCTION account_erasure_email_hashes(account UUID) RETURNS TEXT[] AS $$
  SELECT COALESCE(array_agg(DISTINCT encode(digest(lower(btrim(address)), 'sha256'), 'hex')), '{}')
  FROM (
    SELECT email AS address FROM user_accounts WHERE id = account
    UNION SELECT contact_email FROM user_accounts WHERE id = account
    UNION SELECT provider_email FROM user_oauth_identities WHERE user_account_id = account
  ) addresses WHERE address IS NOT NULL AND btrim(address) <> '';
$$ LANGUAGE SQL STABLE;
ALTER TABLE account_erasure_jobs ADD COLUMN IF NOT EXISTS email_hashes TEXT[];
UPDATE account_erasure_jobs j SET email_hashes = account_erasure_email_hashes(j.account_id)
  WHERE j.email_hashes IS NULL AND EXISTS (SELECT 1 FROM user_accounts a WHERE a.id = j.account_id);
CREATE INDEX IF NOT EXISTS account_erasure_email_hashes_idx ON account_erasure_jobs USING GIN(email_hashes);
CREATE OR REPLACE FUNCTION fence_erased_email_log() RETURNS trigger AS $$
DECLARE fingerprint TEXT; account RECORD;
BEGIN
  fingerprint := encode(digest(lower(btrim(NEW.recipient)), 'sha256'), 'hex');
  FOR account IN SELECT a.erasure_requested_at FROM user_accounts a
    WHERE lower(btrim(a.email)) = lower(btrim(NEW.recipient))
      OR lower(btrim(a.contact_email)) = lower(btrim(NEW.recipient))
      OR EXISTS (SELECT 1 FROM user_oauth_identities oi WHERE oi.user_account_id = a.id
        AND lower(btrim(oi.provider_email)) = lower(btrim(NEW.recipient)))
    ORDER BY a.id FOR SHARE OF a
  LOOP
    IF account.erasure_requested_at IS NOT NULL THEN RETURN NULL; END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM account_erasure_jobs WHERE email_hashes @> ARRAY[fingerprint]) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS erased_email_log_fence ON email_log;
CREATE TRIGGER erased_email_log_fence BEFORE INSERT OR UPDATE OF recipient ON email_log
  FOR EACH ROW EXECUTE FUNCTION fence_erased_email_log();
DELETE FROM email_log WHERE encode(digest(lower(btrim(recipient)), 'sha256'), 'hex')
  IN (SELECT unnest(email_hashes) FROM account_erasure_jobs);
