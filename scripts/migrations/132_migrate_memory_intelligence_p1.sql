-- Memory Intelligence P1: derived snapshots + episodes + dirty marker.
-- Additive. Raw user_facts remain the source of truth.

CREATE TABLE IF NOT EXISTS user_memory_state_snapshots (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  state_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  supporting_fact_ids UUID[] NOT NULL DEFAULT '{}',
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  algorithm_version TEXT NOT NULL DEFAULT 'p1.1',
  PRIMARY KEY (user_id, domain)
);

CREATE TABLE IF NOT EXISTS user_memory_episodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  entity_key TEXT,
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'historical')),
  supporting_fact_ids UUID[] NOT NULL DEFAULT '{}',
  episode_key TEXT NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  algorithm_version TEXT NOT NULL DEFAULT 'p1.1',
  UNIQUE (user_id, episode_key)
);

CREATE INDEX IF NOT EXISTS idx_user_memory_episodes_user_domain
  ON user_memory_episodes (user_id, domain);

CREATE INDEX IF NOT EXISTS idx_user_memory_episodes_user_entity
  ON user_memory_episodes (user_id, entity_key)
  WHERE entity_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS user_memory_intelligence_dirty (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  dirty_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  processing_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_user_memory_intelligence_dirty_due
  ON user_memory_intelligence_dirty (dirty_at ASC)
  WHERE processing_at IS NULL;
