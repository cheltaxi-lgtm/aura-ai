-- Zovus Pro: practitioner feedback on rejected AI dialog drafts.
-- Rollback: ALTER TABLE pro.thread_messages DROP COLUMN IF EXISTS feedback;

BEGIN;

DO $$
BEGIN
  IF to_regclass('pro.thread_messages') IS NULL THEN
    RAISE NOTICE 'pro.thread_messages missing — skip feedback';
    RETURN;
  END IF;

  ALTER TABLE pro.thread_messages
    ADD COLUMN IF NOT EXISTS feedback TEXT;
END $$;

COMMIT;
