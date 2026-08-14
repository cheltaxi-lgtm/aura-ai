DROP INDEX IF EXISTS idx_user_facts_core;
DROP INDEX IF EXISTS idx_user_facts_archive;
DROP INDEX IF EXISTS idx_user_facts_entity;

ALTER TABLE user_facts DROP CONSTRAINT IF EXISTS user_facts_archive_tier_check;
ALTER TABLE user_facts DROP COLUMN IF EXISTS archive_tier;
