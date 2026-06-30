UPDATE platform_settings
SET value = jsonb_set(value, '{maxExcerptLength}', '50000'::jsonb, true)
WHERE key = 'share'
  AND COALESCE((value->>'maxExcerptLength')::int, 12000) < 20000;
