-- A free/unlimited request needs a durable intent too, without a fake debit.
-- Keep the intent after a session is deleted so a delayed retry cannot regenerate.
CREATE TABLE IF NOT EXISTS bot_matrix_operations (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  operation_id TEXT NOT NULL CHECK (length(operation_id) BETWEEN 1 AND 64),
  input JSONB NOT NULL,
  billing_required BOOLEAN NOT NULL,
  session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, operation_id)
);
CREATE INDEX IF NOT EXISTS bot_matrix_operations_session ON bot_matrix_operations(session_id)
  WHERE session_id IS NOT NULL;
DROP TRIGGER IF EXISTS erasure_ref_user_id ON bot_matrix_operations;
CREATE TRIGGER erasure_ref_user_id BEFORE INSERT OR UPDATE OF user_id ON bot_matrix_operations
  FOR EACH ROW EXECUTE FUNCTION enforce_erasure_reference_fence('users', 'user_id');
