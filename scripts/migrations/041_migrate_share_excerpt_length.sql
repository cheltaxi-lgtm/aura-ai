-- Bump share excerpt limit for full reading text on landing pages
UPDATE platform_settings
SET value = jsonb_set(value, '{maxExcerptLength}', '4000'::jsonb, true)
WHERE key = 'share'
  AND COALESCE((value->>'maxExcerptLength')::int, 280) <= 500;
