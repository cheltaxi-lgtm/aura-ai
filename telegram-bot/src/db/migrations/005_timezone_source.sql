ALTER TABLE bot_users ADD COLUMN timezone_source TEXT;

UPDATE bot_users
SET timezone_source = 'user'
WHERE timezone_offset_minutes IS NOT NULL
  AND timezone_asked_at IS NOT NULL
  AND (timezone_source IS NULL OR timezone_source = '');

UPDATE bot_users
SET timezone_offset_minutes = 180,
    timezone_source = 'default'
WHERE timezone_offset_minutes IS NULL;

UPDATE bot_users
SET timezone_source = 'default'
WHERE timezone_source IS NULL OR timezone_source = '';
