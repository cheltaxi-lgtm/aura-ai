-- Aura subjects: one slot per photographed person so the core color
-- does not lottery across different faces on the same account.
-- Photos are still never stored. Rollback: 144_migrate_aura_subjects.down.sql

CREATE TABLE IF NOT EXISTS aura_subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('self', 'other')),
  display_name TEXT NOT NULL,
  name_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_aura_subjects_one_self
  ON aura_subjects (user_id)
  WHERE kind = 'self';

CREATE UNIQUE INDEX IF NOT EXISTS idx_aura_subjects_other_name
  ON aura_subjects (user_id, name_key)
  WHERE kind = 'other';

CREATE INDEX IF NOT EXISTS idx_aura_subjects_user
  ON aura_subjects (user_id, created_at DESC);

ALTER TABLE aura_guest_snapshots
  ADD COLUMN IF NOT EXISTS subject_id UUID REFERENCES aura_subjects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS subject_kind TEXT CHECK (subject_kind IN ('self', 'other')),
  ADD COLUMN IF NOT EXISTS subject_name TEXT;

CREATE INDEX IF NOT EXISTS idx_aura_guest_snapshots_subject
  ON aura_guest_snapshots (subject_id)
  WHERE subject_id IS NOT NULL;

-- Existing claimed snapshots are the account holder's implicit self slot.
INSERT INTO aura_subjects (user_id, kind, display_name, name_key)
SELECT DISTINCT s.claimed_user_id, 'self', 'Я', 'self'
FROM aura_guest_snapshots s
WHERE s.claimed_user_id IS NOT NULL
ON CONFLICT DO NOTHING;

UPDATE aura_guest_snapshots s
SET subject_id = sub.id,
    subject_kind = 'self',
    subject_name = 'Я'
FROM aura_subjects sub
WHERE s.claimed_user_id IS NOT NULL
  AND s.subject_id IS NULL
  AND sub.user_id = s.claimed_user_id
  AND sub.kind = 'self';
