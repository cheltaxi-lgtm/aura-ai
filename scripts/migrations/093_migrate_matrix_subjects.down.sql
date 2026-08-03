DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM numerology_report_history
    GROUP BY user_id, tool_id, birth_date, calculation_version
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'cannot restore birth-date uniqueness: multiple matrix subjects share a report birth date';
  END IF;
END;
$$;

DROP INDEX IF EXISTS numerology_report_subject_unique;
DROP INDEX IF EXISTS idx_numerology_report_history_subject;

ALTER TABLE numerology_report_history
  ADD CONSTRAINT numerology_report_history_version_unique UNIQUE (
    user_id,
    tool_id,
    birth_date,
    calculation_version
  );

ALTER TABLE numerology_report_history
  DROP COLUMN IF EXISTS subject_id;

DROP TABLE IF EXISTS matrix_subjects;
