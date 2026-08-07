BEGIN;

-- Premium report rune prices aligned to ruble targets at current rubPerRune.
-- Prod rubPerRune = 5 → 1500 ₽ = 300 ᚢ, 500 ₽ = 100 ᚢ.
UPDATE platform_settings
SET value = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(value, '{costs,NATAL_READING}', '300'::jsonb, true),
        '{costs,NUMEROLOGY_SESSION}', '100'::jsonb, true
      ),
      '{costs,MATRIX_SUBJECT_REPORT}', '100'::jsonb, true
    ),
    '{costs,HD_REPORT}', '300'::jsonb, true
  ),
  '{costs,HD_COMPOSITE_REPORT}', '300'::jsonb, true
)
WHERE key = 'runes';

COMMIT;
