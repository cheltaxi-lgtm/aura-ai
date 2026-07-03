ALTER TABLE share_snapshots
  ADD COLUMN IF NOT EXISTS source_meta JSONB;

UPDATE platform_settings
SET value = jsonb_set(
  COALESCE(value, '{}'::jsonb),
  '{channels}',
  COALESCE(value->'channels', '{"telegram":true,"vk":true,"native":true,"copy":true,"download":false}'::jsonb),
  true
)
WHERE key = 'share';
