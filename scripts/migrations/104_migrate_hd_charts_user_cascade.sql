-- Owned Human Design charts must erase with the user (152-FZ). Guest-pool
-- rows keep user_id NULL and are unaffected. Historical ON DELETE SET NULL
-- turned deleted accounts into public birth-PII orphans.
BEGIN;

DO $$
DECLARE
  fk_name text;
BEGIN
  IF to_regclass('public.hd_charts') IS NULL THEN
    RAISE NOTICE 'hd_charts missing — skip cascade FK migration';
    RETURN;
  END IF;

  SELECT conname INTO fk_name
  FROM pg_constraint
  WHERE conrelid = 'hd_charts'::regclass
    AND contype = 'f'
    AND pg_get_constraintdef(oid) ILIKE '%user_id%REFERENCES%users%';

  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE hd_charts DROP CONSTRAINT %I', fk_name);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'hd_charts'::regclass AND conname = 'hd_charts_user_id_fkey'
  ) THEN
    ALTER TABLE hd_charts
      ADD CONSTRAINT hd_charts_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

COMMIT;
