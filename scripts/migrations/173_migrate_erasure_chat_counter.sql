-- Erasure deletes messages before sessions. Their DELETE trigger must not
-- update metadata of a revoked session: the active-owner fence correctly
-- rejects that update. Only skip this disposable derived counter for erasing
-- owners; INSERT and all ordinary session writes keep their existing fences.
CREATE OR REPLACE FUNCTION sync_session_message_count() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE sessions SET message_count = message_count + 1 WHERE id = NEW.session_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE sessions s SET message_count = GREATEST(0, s.message_count - 1)
      WHERE s.id = OLD.session_id
        AND NOT EXISTS (
          SELECT 1 FROM users u
          WHERE u.id = s.user_id AND u.erasure_requested_at IS NOT NULL
        );
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
