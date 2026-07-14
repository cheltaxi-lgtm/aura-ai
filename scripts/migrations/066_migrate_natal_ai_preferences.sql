-- Explicit, purpose-specific consent for enriching external LLM prompts with
-- calculated natal evidence. No rows are backfilled and both defaults are off,
-- so existing and new users cannot be opted in by this migration.
CREATE TABLE IF NOT EXISTS natal_ai_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  ai_context_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  tarot_context_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
