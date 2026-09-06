-- Preserve report IDs/text while separating birth-date corrections and different partners.
UPDATE numerology_report_history
SET structured_data = jsonb_set(COALESCE(structured_data, '{}'::jsonb), '{partnerDate}',
  to_jsonb(CASE
    WHEN COALESCE(structured_data->>'partnerDate', structured_data->>'dateB', structured_data->'numerologToolParams'->>'partnerDate', '') ~ '^\d{2}\.\d{2}\.\d{4}$'
    THEN substring(COALESCE(structured_data->>'partnerDate', structured_data->>'dateB', structured_data->'numerologToolParams'->>'partnerDate') from 7 for 4) || '-' || substring(COALESCE(structured_data->>'partnerDate', structured_data->>'dateB', structured_data->'numerologToolParams'->>'partnerDate') from 4 for 2) || '-' || substring(COALESCE(structured_data->>'partnerDate', structured_data->>'dateB', structured_data->'numerologToolParams'->>'partnerDate') from 1 for 2)
    ELSE COALESCE(structured_data->>'partnerDate', structured_data->>'dateB', structured_data->'numerologToolParams'->>'partnerDate', '') END))
WHERE tool_id = 'matrix_compatibility';

ALTER TABLE numerology_report_history ADD COLUMN IF NOT EXISTS report_scope text
  GENERATED ALWAYS AS (CASE WHEN tool_id = 'matrix_compatibility'
    THEN COALESCE(structured_data->>'partnerDate', structured_data->>'dateB', structured_data->'numerologToolParams'->>'partnerDate', '')
    ELSE '' END) STORED;
DROP INDEX IF EXISTS numerology_report_subject_unique;
ALTER TABLE numerology_report_history DROP CONSTRAINT IF EXISTS numerology_report_history_version_unique;
CREATE UNIQUE INDEX IF NOT EXISTS numerology_report_identity_unique
  ON numerology_report_history (user_id, tool_id, subject_id, birth_date, calculation_version, report_scope);
