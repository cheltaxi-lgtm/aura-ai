-- Rollback only removes the backfilled key. Does not recreate deleted sessions.
UPDATE users
SET astro_meta = COALESCE(astro_meta, '{}'::jsonb) - 'guestIntroUsedAt'
WHERE astro_meta ? 'guestIntroUsedAt';
