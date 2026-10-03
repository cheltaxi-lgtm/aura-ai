-- Capture ownership before delivery so an address change cannot orphan personal logs.
ALTER TABLE email_log ADD COLUMN IF NOT EXISTS owner_account_ids UUID[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS email_log_owner_accounts_idx ON email_log USING GIN(owner_account_ids);

UPDATE email_log e SET owner_account_ids = ARRAY(
  SELECT DISTINCT a.id FROM user_accounts a
  WHERE lower(btrim(a.email)) = lower(btrim(e.recipient))
    OR lower(btrim(a.contact_email)) = lower(btrim(e.recipient))
    OR EXISTS (SELECT 1 FROM user_oauth_identities oi WHERE oi.user_account_id = a.id
      AND lower(btrim(oi.provider_email)) = lower(btrim(e.recipient)))
) WHERE cardinality(owner_account_ids) = 0;

CREATE OR REPLACE FUNCTION fence_erased_email_log() RETURNS trigger AS $$
DECLARE fingerprint TEXT; account RECORD; captured_id UUID;
BEGIN
  fingerprint := encode(digest(lower(btrim(NEW.recipient)), 'sha256'), 'hex');
  -- Resolve direct SQL writers too. Multiple accounts can share a contact address.
  NEW.owner_account_ids := ARRAY(
    SELECT DISTINCT id FROM (
      SELECT unnest(NEW.owner_account_ids) AS id
      UNION SELECT a.id FROM user_accounts a
        WHERE lower(btrim(a.email)) = lower(btrim(NEW.recipient))
          OR lower(btrim(a.contact_email)) = lower(btrim(NEW.recipient))
          OR EXISTS (SELECT 1 FROM user_oauth_identities oi WHERE oi.user_account_id = a.id
            AND lower(btrim(oi.provider_email)) = lower(btrim(NEW.recipient)))
    ) owners ORDER BY id
  );
  FOREACH captured_id IN ARRAY NEW.owner_account_ids LOOP
    SELECT a.erasure_requested_at INTO account FROM user_accounts a WHERE a.id = captured_id FOR SHARE;
    -- A captured owner that disappeared during delivery must not be recreated as an anonymous log.
    IF NOT FOUND OR account.erasure_requested_at IS NOT NULL THEN RETURN NULL; END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM account_erasure_jobs WHERE email_hashes @> ARRAY[fingerprint]) THEN RETURN NULL; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS erased_email_log_fence ON email_log;
CREATE TRIGGER erased_email_log_fence BEFORE INSERT OR UPDATE ON email_log
  FOR EACH ROW EXECUTE FUNCTION fence_erased_email_log();
DELETE FROM email_log e WHERE EXISTS (
  SELECT 1 FROM account_erasure_jobs j WHERE e.owner_account_ids @> ARRAY[j.account_id]
);
