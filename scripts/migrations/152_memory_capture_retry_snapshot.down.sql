-- Stop app and workers before downgrading code/schema.
ALTER TABLE memory_extraction_jobs DROP COLUMN IF EXISTS extraction_result;
ALTER TABLE user_memory_preferences DROP COLUMN IF EXISTS capture_changed_at;
