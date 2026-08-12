-- Explicit authenticated opt-in for future daily-cards return reminders.
-- Default OFF. Does not enable email/push delivery (P2.4A storage only).

ALTER TABLE user_accounts
  ADD COLUMN IF NOT EXISTS daily_cards_reminder BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN user_accounts.daily_cards_reminder IS
  'Explicit opt-in for future 3-cards-of-the-day reminders. Default false. Delivery is a later task.';
