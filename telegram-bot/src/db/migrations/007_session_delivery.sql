-- Session delivery/failure state for slot compensation (additive).
ALTER TABLE bot_guest_sessions ADD COLUMN status TEXT;
ALTER TABLE bot_guest_sessions ADD COLUMN teaser_delivered_at TEXT;

UPDATE bot_guest_sessions
SET status = 'ok'
WHERE status IS NULL OR status = '';
