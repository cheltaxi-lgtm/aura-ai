BEGIN;

DO $$
DECLARE
  fk_name text;
BEGIN
  IF to_regclass('public.hd_charts') IS NULL THEN
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

  ALTER TABLE hd_charts
    ADD CONSTRAINT hd_charts_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
END $$;

COMMIT;
