CREATE TABLE IF NOT EXISTS matrix_subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('self', 'child', 'partner', 'other')),
  display_name TEXT,
  birth_date DATE NOT NULL,
  birth_time TIME,
  birth_city TEXT,
  birth_lat DOUBLE PRECISION,
  birth_lon DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_matrix_subjects_self
  ON matrix_subjects (user_id) WHERE kind = 'self';

CREATE INDEX IF NOT EXISTS idx_matrix_subjects_user
  ON matrix_subjects (user_id, created_at DESC);

ALTER TABLE numerology_report_history
  ADD COLUMN IF NOT EXISTS subject_id UUID REFERENCES matrix_subjects(id) ON DELETE CASCADE;

-- Every profile with a DOB, and every user with a prior report, receives one
-- self subject. A profile DOB takes precedence over the oldest report DOB.
INSERT INTO matrix_subjects (user_id, kind, display_name, birth_date)
SELECT
  u.id,
  'self',
  NULLIF(btrim(u.name), ''),
  COALESCE(u.birth_date, oldest.birth_date)
FROM users u
LEFT JOIN LATERAL (
  SELECT n.birth_date
  FROM numerology_report_history n
  WHERE n.user_id = u.id
  ORDER BY n.created_at ASC, n.id ASC
  LIMIT 1
) oldest ON TRUE
WHERE COALESCE(u.birth_date, oldest.birth_date) IS NOT NULL
ON CONFLICT DO NOTHING;

UPDATE numerology_report_history n
SET subject_id = s.id
FROM matrix_subjects s
WHERE s.user_id = n.user_id
  AND s.kind = 'self'
  AND s.birth_date = n.birth_date
  AND n.subject_id IS NULL;

-- Dates that differ from a self profile are distinct "other" subjects. This
-- intentionally retains different people who happen to share a date on later writes.
INSERT INTO matrix_subjects (user_id, kind, birth_date)
SELECT DISTINCT n.user_id, 'other', n.birth_date
FROM numerology_report_history n
WHERE n.subject_id IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM matrix_subjects s
    WHERE s.user_id = n.user_id
      AND s.kind = 'other'
      AND s.birth_date = n.birth_date
  );

UPDATE numerology_report_history n
SET subject_id = s.id
FROM matrix_subjects s
WHERE s.user_id = n.user_id
  AND s.kind = 'other'
  AND s.birth_date = n.birth_date
  AND n.subject_id IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM numerology_report_history WHERE subject_id IS NULL
  ) THEN
    RAISE EXCEPTION 'matrix subject backfill left numerology reports without subject_id';
  END IF;
END;
$$;

ALTER TABLE numerology_report_history
  ALTER COLUMN subject_id SET NOT NULL;

ALTER TABLE numerology_report_history
  DROP CONSTRAINT IF EXISTS numerology_report_history_version_unique;

DO $$
DECLARE
  index_name TEXT;
BEGIN
  FOR index_name IN
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = current_schema()
      AND tablename = 'numerology_report_history'
      AND indexdef LIKE 'CREATE UNIQUE INDEX%'
      AND indexdef LIKE '%(user_id, tool_id, birth_date, calculation_version)%'
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS %I', index_name);
  END LOOP;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS numerology_report_subject_unique
  ON numerology_report_history (user_id, tool_id, subject_id, calculation_version);

CREATE INDEX IF NOT EXISTS idx_numerology_report_history_subject
  ON numerology_report_history (subject_id);
