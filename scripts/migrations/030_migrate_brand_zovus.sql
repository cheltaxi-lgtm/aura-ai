-- Rebrand platform settings: Aura → Zovus
UPDATE platform_settings
SET value = jsonb_set(
  value,
  '{globalPrefix}',
  to_jsonb(replace(value->>'globalPrefix', 'Aura', 'Zovus'))
)
WHERE key = 'prompts'
  AND value->>'globalPrefix' LIKE '%Aura%';

UPDATE platform_settings
SET value = jsonb_set(
  value,
  '{stylePrefix}',
  to_jsonb(replace(value->>'stylePrefix', 'Aura', 'Zovus'))
)
WHERE key = 'visual'
  AND value->>'stylePrefix' LIKE '%Aura%';
