-- Audit hardening pass 2: rune balance guard, hot-path indexes, cascade cleanup, search index.

-- Rune balance must never go negative.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_rune_balance_nonneg;
ALTER TABLE users
  ADD CONSTRAINT users_rune_balance_nonneg CHECK (rune_balance >= 0);

-- Hot-path lookup indexes used by payment reconciliation and cabinet queries.
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_session_id ON payments(session_id);

-- Deleting a session should not be blocked by its payment history.
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_session_id_fkey;
ALTER TABLE payments
  ADD CONSTRAINT payments_session_id_fkey
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE;

-- Trigram index for admin chat-message search (ILIKE '%term%').
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_chat_messages_content_trgm
  ON chat_messages USING GIN (content gin_trgm_ops);

-- Denormalized message_count on sessions to avoid full chat_messages scans in cabinet.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS message_count INT NOT NULL DEFAULT 0;

UPDATE sessions s
SET message_count = sub.cnt
FROM (
  SELECT session_id, COUNT(*)::int AS cnt
  FROM chat_messages
  GROUP BY session_id
) sub
WHERE sub.session_id = s.id
  AND s.message_count = 0;

-- Keep message_count in sync automatically regardless of insert/delete call site.
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
