-- A verified contact address for OAuth/Telegram accounts without a mailbox.
-- It is deliberately separate from the login identity in user_accounts.email.
ALTER TABLE user_accounts
  ADD COLUMN IF NOT EXISTS contact_email TEXT,
  ADD COLUMN IF NOT EXISTS contact_email_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS contact_email_verify_version INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_accounts_contact_email_lower
  ON user_accounts (lower(contact_email)) WHERE contact_email IS NOT NULL;

-- Serialize each address across contact, login and verified OAuth identities.
-- A contact mailbox must never become another account's login after verification.
CREATE OR REPLACE FUNCTION prevent_contact_email_identity_collision()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  normalized TEXT;
  email_changed BOOLEAN;
  contact_changed BOOLEAN;
  provider_changed BOOLEAN;
BEGIN
  IF TG_TABLE_NAME = 'user_accounts' THEN
    IF TG_OP = 'INSERT' THEN
      email_changed := TRUE;
      contact_changed := NEW.contact_email IS NOT NULL;
    ELSE
      email_changed := NEW.email IS DISTINCT FROM OLD.email;
      contact_changed := NEW.contact_email IS NOT NULL
        AND NEW.contact_email IS DISTINCT FROM OLD.contact_email;
    END IF;
    IF email_changed THEN
      normalized := lower(NEW.email);
      PERFORM pg_advisory_xact_lock(hashtext('contact-email:' || normalized));
      IF EXISTS (SELECT 1 FROM user_accounts ua
                 WHERE ua.id <> NEW.id AND lower(ua.contact_email) = normalized) THEN
        RAISE EXCEPTION 'email_reserved_by_contact' USING ERRCODE = '23505';
      END IF;
    END IF;
    IF contact_changed THEN
      normalized := lower(NEW.contact_email);
      PERFORM pg_advisory_xact_lock(hashtext('contact-email:' || normalized));
      IF EXISTS (SELECT 1 FROM user_accounts ua
                 WHERE ua.id <> NEW.id AND lower(ua.email) = normalized)
         OR EXISTS (SELECT 1 FROM user_oauth_identities oi
                    WHERE oi.user_account_id <> NEW.id
                      AND oi.provider_email_verified = TRUE
                      AND lower(oi.provider_email) = normalized) THEN
        RAISE EXCEPTION 'contact_email_reserved_by_identity' USING ERRCODE = '23505';
      END IF;
    END IF;
  ELSE
    IF TG_OP = 'INSERT' THEN
      provider_changed := TRUE;
    ELSE
      provider_changed := NEW.provider_email IS DISTINCT FROM OLD.provider_email
        OR NEW.provider_email_verified IS DISTINCT FROM OLD.provider_email_verified;
    END IF;
    IF provider_changed AND NEW.provider_email_verified = TRUE AND
       NEW.provider_email IS NOT NULL THEN
      normalized := lower(NEW.provider_email);
      PERFORM pg_advisory_xact_lock(hashtext('contact-email:' || normalized));
      IF EXISTS (SELECT 1 FROM user_accounts ua
                 WHERE ua.id <> NEW.user_account_id AND lower(ua.contact_email) = normalized) THEN
        RAISE EXCEPTION 'oauth_email_reserved_by_contact' USING ERRCODE = '23505';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_contact_email_account_identity ON user_accounts;
CREATE TRIGGER guard_contact_email_account_identity
  BEFORE INSERT OR UPDATE OF email, contact_email ON user_accounts
  FOR EACH ROW EXECUTE FUNCTION prevent_contact_email_identity_collision();

DROP TRIGGER IF EXISTS guard_contact_email_oauth_identity ON user_oauth_identities;
CREATE TRIGGER guard_contact_email_oauth_identity
  BEFORE INSERT OR UPDATE OF provider_email, provider_email_verified ON user_oauth_identities
  FOR EACH ROW EXECUTE FUNCTION prevent_contact_email_identity_collision();
