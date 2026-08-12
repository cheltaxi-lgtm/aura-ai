-- Zovus Pro: Avito tenancy — bind chats to a pro account (single-operator scope).
-- AVITO_PRO_OWNER_USER_ID selects the owning account at runtime; rows stay NULL
-- until backfilled by sync/webhook, and NULL is treated as "owner's" when scoped.
-- Rollback: ALTER TABLE pro.avito_chats DROP COLUMN IF EXISTS account_id;

BEGIN;

DO $$
BEGIN
  IF to_regclass('pro.avito_chats') IS NULL OR to_regclass('pro.accounts') IS NULL THEN
    RAISE NOTICE 'pro schema missing — skip avito tenancy';
    RETURN;
  END IF;

  ALTER TABLE pro.avito_chats
    ADD COLUMN IF NOT EXISTS account_id BIGINT
    REFERENCES pro.accounts(id) ON DELETE SET NULL;

  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_pro_avito_chats_account ON pro.avito_chats (account_id)';
END $$;

COMMIT;
