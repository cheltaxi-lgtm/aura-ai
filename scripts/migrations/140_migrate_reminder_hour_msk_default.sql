-- Align notification_prefs default hour with product 09:00 Europe/Moscow.
-- SQL candidate fallback previously used 6, so accounts without reminderHourMsk/Utc
-- were scheduled at 06:00 while reminderHourUtc:6 (schema default from 045) is 09:00.
-- Does not rewrite stored prefs; explicit hours stay as chosen.
-- Rollback:
--   ALTER TABLE users ALTER COLUMN notification_prefs SET DEFAULT '{
--     "dailyEmail": true,
--     "dailyInApp": true,
--     "reminderHourMsk": 6
--   }'::jsonb;

ALTER TABLE users
  ALTER COLUMN notification_prefs SET DEFAULT '{
    "dailyEmail": true,
    "dailyInApp": true,
    "reminderHourMsk": 9
  }'::jsonb;
