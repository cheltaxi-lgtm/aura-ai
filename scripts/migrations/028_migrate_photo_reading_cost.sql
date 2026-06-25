-- Фото-расклад: единая цена 30 ᚢ (распознавание + перерисовка + расшифровка)
UPDATE platform_settings
SET value = jsonb_set(
  value,
  '{costs,VISION_ANALYSIS}',
  '30'::jsonb,
  true
)
WHERE key = 'runes'
  AND (value->'costs'->>'VISION_ANALYSIS') IS DISTINCT FROM '30';
