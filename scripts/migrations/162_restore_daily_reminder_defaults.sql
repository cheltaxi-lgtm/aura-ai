-- Restore the pre-159 daily-reading reminder defaults for future accounts.
-- Existing accounts are restored from the pre-159 backup separately so their
-- previous disabled choices are not overwritten by a blanket UPDATE.
ALTER TABLE user_accounts
  ALTER COLUMN daily_cards_reminder SET DEFAULT TRUE;

ALTER TABLE users
  ALTER COLUMN notification_prefs SET DEFAULT '{
    "dailyEmail": true,
    "dailyInApp": true,
    "dailyTelegram": false,
    "reminderHourMsk": 9,
    "bonusEmail": false,
    "marketingEmail": false,
    "reportReadyEmail": true,
    "reportReadyTelegram": true,
    "weeklyDigestEmail": false
  }'::jsonb;
