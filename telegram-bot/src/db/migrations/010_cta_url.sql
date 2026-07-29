-- Persist tracked CTA URL for resend after delivery glitches.
-- Contains the same token path as the Telegram CTA message (not a separate secret store).
ALTER TABLE bot_guest_sessions ADD COLUMN cta_url TEXT;
