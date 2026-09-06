-- Never collapse paid reports to make an old binary fit. Refuse rollback if identities diverged.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM numerology_report_history WHERE subject_id IS NOT NULL
    GROUP BY user_id, tool_id, subject_id, calculation_version HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Matrix identity rollback requires compatible application; multiple paid identities must be retained';
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS numerology_report_subject_unique
  ON numerology_report_history (user_id, tool_id, subject_id, calculation_version);
DROP INDEX IF EXISTS numerology_report_identity_unique;
ALTER TABLE numerology_report_history DROP COLUMN IF EXISTS report_scope;
