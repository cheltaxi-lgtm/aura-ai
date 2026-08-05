-- Link a spend ledger row to the consultation session created after charge
-- (bot product dedupe resume). Replaces fragile ":sess=" markers in description.
--
-- Rollback:
--   DROP INDEX IF EXISTS idx_rune_transactions_result_session;
--   ALTER TABLE rune_transactions DROP COLUMN IF EXISTS result_session_id;

-- Soft link to sessions.id (no FK): spend may be bound in the same request
-- immediately after createSession; avoids migrate ordering issues with sessions.
ALTER TABLE rune_transactions
  ADD COLUMN IF NOT EXISTS result_session_id UUID;

CREATE INDEX IF NOT EXISTS idx_rune_transactions_result_session
  ON rune_transactions (result_session_id)
  WHERE result_session_id IS NOT NULL;
