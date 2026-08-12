-- Consumer registration may create a stub profile without birth data so Tarot
-- guest → auth → full reading is not blocked by natal/matrix onboarding.
-- Birth-dependent features (natal, matrix, HD) must check birth_date IS NOT NULL.
--
-- Rollback (NOT safe as a one-liner):
--   1) Identify stub profiles: birth_date IS NULL AND (astro_meta->>'stubProfile') = 'true'
--      (and any other NULL birth_date rows that must not keep fake natal data).
--   2) Either delete those stubs (and unlink user_accounts.profile_user_id) or
--      require users to complete a real birth profile before re-applying NOT NULL.
--   3) Only then: ALTER TABLE users ALTER COLUMN birth_date SET NOT NULL;
--
-- Do NOT backfill NULL with '1900-01-01' (or any sentinel date). That turns
-- "unknown birth" into a false birth date and can unlock natal/matrix/HD on
-- fabricated data.

BEGIN;

ALTER TABLE users
  ALTER COLUMN birth_date DROP NOT NULL;

COMMENT ON COLUMN users.birth_date IS
  'NULL = stub consumer profile (Tarot/chat ok); required for natal/matrix/HD.';

COMMIT;
