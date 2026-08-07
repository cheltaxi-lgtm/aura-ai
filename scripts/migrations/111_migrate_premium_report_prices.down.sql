BEGIN;

-- Restore previous defaults (pre-111).
UPDATE platform_settings
SET value = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(value, '{costs,NATAL_READING}', '20'::jsonb, true),
        '{costs,NUMEROLOGY_SESSION}', '20'::jsonb, true
      ),
      '{costs,MATRIX_SUBJECT_REPORT}', '20'::jsonb, true
    ),
    '{costs,HD_REPORT}', '40'::jsonb, true
  ),
  '{costs,HD_COMPOSITE_REPORT}', '40'::jsonb, true
)
WHERE key = 'runes';

COMMIT;
