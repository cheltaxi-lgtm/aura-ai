-- Deleting a session used to SET NULL the episodic memory row, leaving a
-- permanently orphaned session_memories entry (invisible to prompt retrieval,
-- which filters session_id IS NOT NULL, but still stored). App code deletes
-- these rows explicitly (deleteConsultationSession); the FK cascade covers
-- every other path that removes sessions rows directly.
--
-- NB: rows created with session_id = NULL from the start (orphan spread
-- memories) are intentional and unaffected.
ALTER TABLE session_memories
  DROP CONSTRAINT IF EXISTS session_memories_session_id_fkey;
ALTER TABLE session_memories
  ADD CONSTRAINT session_memories_session_id_fkey
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE;
