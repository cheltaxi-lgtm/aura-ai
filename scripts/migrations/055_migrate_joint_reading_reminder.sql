-- Track whether an initiator has already been nudged that their joint-reading
-- invite is about to expire while the partner hasn't started (2026-07 audit).

ALTER TABLE joint_readings ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;
