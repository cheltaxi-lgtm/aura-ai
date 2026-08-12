-- Lifetime guest intro entitlement: durable flag outside sessions.
-- History/cabinet purge must not restore acquisition free reading.
-- Key lives in users.astro_meta (jsonb) — same pattern as lastTripletDrawAt.

UPDATE users u
SET astro_meta = jsonb_set(
  COALESCE(u.astro_meta, '{}'::jsonb),
  '{guestIntroUsedAt}',
  to_jsonb(s.first_claim::text),
  true
)
FROM (
  SELECT user_id, MIN(COALESCE(guest_resume_claimed_at, updated_at, created_at)) AS first_claim
  FROM sessions
  WHERE user_id IS NOT NULL
    AND guest_resume_status IN ('claimed', 'reading_consumed')
  GROUP BY user_id
) s
WHERE u.id = s.user_id
  AND (
    u.astro_meta->>'guestIntroUsedAt' IS NULL
    OR TRIM(u.astro_meta->>'guestIntroUsedAt') = ''
  );
