ALTER TABLE users
  ALTER COLUMN notification_prefs SET DEFAULT '{
    "dailyEmail": true,
    "dailyInApp": true,
    "reminderHourMsk": 6
  }'::jsonb;
