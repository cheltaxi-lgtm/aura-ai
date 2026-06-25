-- Index for fast "upcoming dated events" lookups in long-term memory.
CREATE INDEX IF NOT EXISTS idx_user_facts_events
  ON user_facts (user_id, event_date)
  WHERE event_date IS NOT NULL;
