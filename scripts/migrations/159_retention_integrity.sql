-- Retention integrity: meaningful activity, explicit promotional consent,
-- cross-campaign frequency caps, and result-quality feedback.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS last_product_activity_at TIMESTAMPTZ;

ALTER TABLE user_accounts
  ADD COLUMN IF NOT EXISTS is_internal BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_users_last_product_activity
  ON users (last_product_activity_at DESC)
  WHERE last_product_activity_at IS NOT NULL;

UPDATE users u
SET last_product_activity_at = activity.at
FROM (
  SELECT owner_id, MAX(at) AS at
  FROM (
    SELECT owner_user_id AS owner_id, created_at AS at FROM chat_messages WHERE role='user' AND owner_user_id IS NOT NULL
    UNION ALL SELECT user_id, created_at FROM history
    UNION ALL SELECT user_id, created_at FROM async_jobs
  ) events
  GROUP BY owner_id
) activity
WHERE u.id=activity.owner_id AND u.last_product_activity_at IS NULL;

CREATE TABLE IF NOT EXISTS proactive_contact_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  campaign TEXT NOT NULL,
  contact_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'reserved'
    CHECK (status IN ('reserved', 'delivered', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  UNIQUE (user_id, contact_key)
);

CREATE INDEX IF NOT EXISTS idx_proactive_contact_user_created
  ON proactive_contact_log (user_id, created_at DESC)
  WHERE status IN ('reserved', 'delivered');

CREATE TABLE IF NOT EXISTS reading_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('session', 'reading')),
  target_id UUID NOT NULL,
  useful BOOLEAN NOT NULL,
  reason TEXT CHECK (reason IS NULL OR reason IN (
    'too_general', 'cards_wrong', 'did_not_answer', 'too_long', 'technical', 'other'
  )),
  product TEXT NOT NULL DEFAULT 'tarot',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, target_type, target_id)
);

CREATE INDEX IF NOT EXISTS idx_reading_feedback_created
  ON reading_feedback (created_at DESC);

-- Migration 136 enabled all promotional channels and backfilled consent without
-- provenance, so a later explicit opt-in cannot be distinguished from that
-- blanket backfill. Privacy-first policy: reset the entire affected population,
-- including possible real opt-ins, and request consent again after product value.
ALTER TABLE user_accounts
  ALTER COLUMN daily_cards_reminder SET DEFAULT FALSE,
  ALTER COLUMN marketing_consent SET DEFAULT FALSE;

ALTER TABLE users
  ALTER COLUMN notification_prefs SET DEFAULT '{
    "dailyEmail": false,
    "dailyInApp": false,
    "dailyTelegram": false,
    "reminderHourMsk": 9,
    "bonusEmail": false,
    "marketingEmail": false,
    "reportReadyEmail": true,
    "reportReadyTelegram": true,
    "weeklyDigestEmail": false
  }'::jsonb;

UPDATE user_accounts
SET daily_cards_reminder = FALSE,
    marketing_consent = FALSE,
    marketing_consent_at = NULL
WHERE daily_cards_reminder = TRUE OR marketing_consent = TRUE;

UPDATE users
SET notification_prefs = COALESCE(notification_prefs, '{}'::jsonb) || '{
  "dailyEmail": false,
  "dailyInApp": false,
  "dailyTelegram": false,
  "bonusEmail": false,
  "marketingEmail": false
}'::jsonb;
