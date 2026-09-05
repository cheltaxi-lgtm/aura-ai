ALTER TABLE user_memory_preferences ADD COLUMN IF NOT EXISTS capture_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
UPDATE user_memory_preferences SET capture_changed_at = updated_at;
ALTER TABLE memory_extraction_jobs ADD COLUMN IF NOT EXISTS extraction_result JSONB;
