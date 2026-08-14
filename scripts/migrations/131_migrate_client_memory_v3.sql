-- Client Memory V3: archive tiers instead of deleting biography.

ALTER TABLE user_facts
  ADD COLUMN IF NOT EXISTS archive_tier TEXT NOT NULL DEFAULT 'hot';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_facts_archive_tier_check'
  ) THEN
    ALTER TABLE user_facts
      ADD CONSTRAINT user_facts_archive_tier_check
      CHECK (archive_tier IN ('hot', 'warm', 'archived'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_facts_entity
  ON user_facts (user_id, entity_key)
  WHERE entity_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_facts_archive
  ON user_facts (user_id, archive_tier, status);

CREATE INDEX IF NOT EXISTS idx_user_facts_core
  ON user_facts (user_id, predicate_key)
  WHERE status = 'active' AND archive_tier IN ('hot', 'warm');
