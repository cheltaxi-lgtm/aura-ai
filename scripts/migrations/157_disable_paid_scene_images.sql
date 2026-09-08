-- Paid AI scene art remains implemented but is disabled for every existing
-- installation. Idempotent: repeated deploys keep the four paid scenes off.
UPDATE platform_settings
SET value = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(value, '{scenes,tarot_atmosphere}', 'false'::jsonb, true),
      '{scenes,destiny_card}', 'false'::jsonb, true
    ),
    '{scenes,scene_illustration}', 'false'::jsonb, true
  ),
  '{scenes,final_report}', 'false'::jsonb, true
)
WHERE key = 'visual';
