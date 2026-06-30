UPDATE platform_settings
SET value = jsonb_set(value, '{maxExcerptLength}', '12000'::jsonb, true)
WHERE key = 'share'
  AND COALESCE((value->>'maxExcerptLength')::int, 4000) < 8000;
