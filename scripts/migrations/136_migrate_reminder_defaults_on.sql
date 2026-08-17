-- Default-on proactive reminders: daily cards + marketing consent.
-- Backfill every existing account. Unsubscribe is the off-switch.
-- Rollback:
--   ALTER TABLE user_accounts ALTER COLUMN daily_cards_reminder SET DEFAULT FALSE;
--   ALTER TABLE user_accounts ALTER COLUMN marketing_consent SET DEFAULT FALSE;
--   ALTER TABLE daily_reminder_log DROP CONSTRAINT IF EXISTS daily_reminder_log_channel_check;
--   ALTER TABLE daily_reminder_log ADD CONSTRAINT daily_reminder_log_channel_check
--     CHECK (channel IN ('in_app', 'email'));

ALTER TABLE user_accounts
  ALTER COLUMN daily_cards_reminder SET DEFAULT TRUE;

ALTER TABLE user_accounts
  ALTER COLUMN marketing_consent SET DEFAULT TRUE;

UPDATE user_accounts
SET daily_cards_reminder = TRUE
WHERE daily_cards_reminder IS DISTINCT FROM TRUE;

UPDATE user_accounts
SET
  marketing_consent = TRUE,
  marketing_consent_at = COALESCE(marketing_consent_at, NOW())
WHERE marketing_consent IS DISTINCT FROM TRUE;

ALTER TABLE daily_reminder_log
  DROP CONSTRAINT IF EXISTS daily_reminder_log_channel_check;

ALTER TABLE daily_reminder_log
  ADD CONSTRAINT daily_reminder_log_channel_check
  CHECK (channel IN ('in_app', 'email', 'telegram'));
