-- No foreign keys: the durable erasure intent must survive deleting its owner.
ALTER TABLE user_accounts ADD COLUMN IF NOT EXISTS erasure_requested_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS erasure_requested_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS account_erasure_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL UNIQUE,
  profile_user_id UUID,
  telegram_user_ids BIGINT[] NOT NULL DEFAULT '{}',
  stage TEXT NOT NULL DEFAULT 'pending' CHECK (stage IN ('pending', 'bot_purged', 'site_deleted', 'completed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lease_token UUID,
  lease_until TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS account_erasure_jobs_due ON account_erasure_jobs(next_attempt_at)
  WHERE stage <> 'completed';
CREATE INDEX IF NOT EXISTS account_erasure_jobs_telegram ON account_erasure_jobs USING GIN(telegram_user_ids)
  WHERE stage <> 'completed';

-- A stale authenticated request cannot create a fresh owned record or attach an
-- existing record after erasure was accepted. FOR SHARE serializes with marking
-- the account/profile and with final DELETE. Existing records are removed by the
-- final erasure transaction, including work which started before the fence.
CREATE OR REPLACE FUNCTION enforce_erasure_reference_fence() RETURNS trigger AS $$
DECLARE
  parent_id UUID;
  requested TIMESTAMPTZ;
BEGIN
  parent_id := (to_jsonb(NEW)->>TG_ARGV[1])::uuid;
  IF parent_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND (to_jsonb(OLD)->>TG_ARGV[1]) IS NOT DISTINCT FROM (to_jsonb(NEW)->>TG_ARGV[1]) THEN
    RETURN NEW;
  END IF;
  EXECUTE format('SELECT erasure_requested_at FROM %I WHERE id = $1 FOR SHARE', TG_ARGV[0])
    INTO requested USING parent_id;
  IF requested IS NOT NULL THEN
    RAISE EXCEPTION 'account_erasure_pending' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Fence parent mutation as well: a request authenticated before the revocation
-- cannot spend runes, replace the profile, or re-enable the account afterwards.
CREATE OR REPLACE FUNCTION enforce_erasure_parent_fence() RETURNS trigger AS $$
BEGIN
  IF OLD.erasure_requested_at IS NOT NULL THEN
    RAISE EXCEPTION 'account_erasure_pending' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS erasure_parent_fence ON users;
CREATE TRIGGER erasure_parent_fence BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION enforce_erasure_parent_fence();
DROP TRIGGER IF EXISTS erasure_parent_fence ON user_accounts;
CREATE TRIGGER erasure_parent_fence BEFORE UPDATE ON user_accounts
  FOR EACH ROW EXECUTE FUNCTION enforce_erasure_parent_fence();

DO $$
DECLARE ref RECORD;
BEGIN
  FOR ref IN
    SELECT child.relname AS child_table, parent.relname AS parent_table, attr.attname AS child_column
    FROM pg_constraint c
    JOIN pg_class child ON child.oid = c.conrelid
    JOIN pg_class parent ON parent.oid = c.confrelid
    JOIN pg_namespace ns ON ns.oid = child.relnamespace
    JOIN pg_attribute attr ON attr.attrelid = child.oid AND attr.attnum = c.conkey[1]
    WHERE c.contype = 'f' AND array_length(c.conkey, 1) = 1
      AND c.confrelid IN ('users'::regclass, 'user_accounts'::regclass)
      AND ns.nspname = current_schema()
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', 'erasure_ref_' || ref.child_column, ref.child_table);
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE OF %I ON %I FOR EACH ROW EXECUTE FUNCTION enforce_erasure_reference_fence(%L, %L)',
      'erasure_ref_' || ref.child_column, ref.child_column, ref.child_table, ref.parent_table, ref.child_column);
  END LOOP;
END;
$$;
