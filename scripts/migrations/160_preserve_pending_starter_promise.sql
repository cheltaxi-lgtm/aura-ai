-- Pending email registrations were shown the old gift before the policy change.
-- This marker does not credit a balance: verification and the idempotent grant
-- remain mandatory. Registration dates before the 100-rune rollout are excluded.
UPDATE users u
SET starter_bonus_version = 'starter-100-v1'
FROM user_accounts ua
WHERE ua.profile_user_id = u.id
  AND ua.bonus_email_verification_required = TRUE
  AND ua.email_verified_at IS NULL
  AND u.starter_runes_granted = FALSE
  AND u.starter_bonus_version IS NULL
  AND ua.created_at >= TIMESTAMPTZ '2026-09-14 00:00:00+00';
