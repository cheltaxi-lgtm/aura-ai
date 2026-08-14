-- Generation token for Memory Intelligence dirty acknowledgement.
-- Prevents a finishing rebuild from clearing a newer dirty mark.

ALTER TABLE user_memory_intelligence_dirty
  ADD COLUMN IF NOT EXISTS generation INTEGER NOT NULL DEFAULT 0;
