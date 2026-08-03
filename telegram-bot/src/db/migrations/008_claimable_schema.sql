-- Claim eligibility: new sessions claimable; legacy rows marked unclaimable.
ALTER TABLE bot_guest_sessions ADD COLUMN schema_version INTEGER;
ALTER TABLE bot_guest_sessions ADD COLUMN claimable INTEGER;

UPDATE bot_guest_sessions
SET schema_version = 0,
    claimable = 0
WHERE schema_version IS NULL;

CREATE INDEX IF NOT EXISTS idx_sessions_claimable
  ON bot_guest_sessions(claimable, claimed_at);
