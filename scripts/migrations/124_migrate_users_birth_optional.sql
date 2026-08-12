-- Consumer registration may create a stub profile without birth data so Tarot
-- guest → auth → full reading is not blocked by natal/matrix onboarding.
-- Birth-dependent features (natal, matrix, HD) must check birth_date IS NOT NULL.
-- Rollback:
--   UPDATE users SET birth_date = '1900-01-01' WHERE birth_date IS NULL;
--   ALTER TABLE users ALTER COLUMN birth_date SET NOT NULL;

BEGIN;

ALTER TABLE users
  ALTER COLUMN birth_date DROP NOT NULL;

COMMENT ON COLUMN users.birth_date IS
  'NULL = stub consumer profile (Tarot/chat ok); required for natal/matrix/HD.';

COMMIT;
