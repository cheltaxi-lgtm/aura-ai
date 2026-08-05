-- Align gaps when 072/077 are soft-skipped on schema.sql-first DBs, restore
-- 049 artifacts missing from historical schema.sql snapshots, and keep
-- empty-DB bootstrap equivalent to the intended migrate end-state.
--
-- Rollback (non-destructive preferred — leave columns/indexes in place):
--   ALTER TABLE async_jobs DROP CONSTRAINT IF EXISTS async_jobs_charge_transaction_id_fkey;
--   DROP TRIGGER IF EXISTS trg_chat_messages_count_insert ON chat_messages;
--   DROP TRIGGER IF EXISTS trg_chat_messages_count_delete ON chat_messages;
--   DROP FUNCTION IF EXISTS sync_session_message_count();

-- 049: rune balance guard (safe if already present).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_rune_balance_nonneg'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_rune_balance_nonneg CHECK (rune_balance >= 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_session_id ON payments(session_id);

-- 049: payments.session_id ON DELETE CASCADE (no DROP COLUMN / type change).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class rel ON rel.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = rel.relnamespace
    WHERE n.nspname = 'public'
      AND rel.relname = 'payments'
      AND c.conname = 'payments_session_id_fkey'
      AND pg_get_constraintdef(c.oid) NOT ILIKE '%ON DELETE CASCADE%'
  ) THEN
    ALTER TABLE payments DROP CONSTRAINT payments_session_id_fkey;
    ALTER TABLE payments
      ADD CONSTRAINT payments_session_id_fkey
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE;
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payments_session_id_fkey'
  ) THEN
    ALTER TABLE payments
      ADD CONSTRAINT payments_session_id_fkey
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_chat_messages_content_trgm
  ON chat_messages USING GIN (content gin_trgm_ops);

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS message_count INT NOT NULL DEFAULT 0;

UPDATE sessions s
SET message_count = sub.cnt
FROM (
  SELECT session_id, COUNT(*)::int AS cnt
  FROM chat_messages
  GROUP BY session_id
) sub
WHERE sub.session_id = s.id
  AND s.message_count = 0;

CREATE OR REPLACE FUNCTION sync_session_message_count() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE sessions SET message_count = message_count + 1 WHERE id = NEW.session_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE sessions SET message_count = GREATEST(0, message_count - 1) WHERE id = OLD.session_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_chat_messages_count_insert ON chat_messages;
CREATE TRIGGER trg_chat_messages_count_insert
  AFTER INSERT ON chat_messages
  FOR EACH ROW EXECUTE FUNCTION sync_session_message_count();

DROP TRIGGER IF EXISTS trg_chat_messages_count_delete ON chat_messages;
CREATE TRIGGER trg_chat_messages_count_delete
  AFTER DELETE ON chat_messages
  FOR EACH ROW EXECUTE FUNCTION sync_session_message_count();

-- 077 intended FK (safe if already present from a real 077 apply).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'async_jobs'
      AND column_name = 'charge_transaction_id'
      AND data_type = 'uuid'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'async_jobs_charge_transaction_id_fkey'
  ) THEN
    ALTER TABLE async_jobs
      ADD CONSTRAINT async_jobs_charge_transaction_id_fkey
      FOREIGN KEY (charge_transaction_id)
      REFERENCES rune_transactions(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- Mirror 100 for DBs that bootstrapped from an older schema.sql snapshot.
ALTER TABLE rune_transactions
  ADD COLUMN IF NOT EXISTS result_session_id UUID;

CREATE INDEX IF NOT EXISTS idx_rune_transactions_result_session
  ON rune_transactions (result_session_id)
  WHERE result_session_id IS NOT NULL;

-- Mirror 099 for the same reason.
ALTER TABLE rune_transactions
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_rune_transactions_spend_idempotency
  ON rune_transactions (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
