-- Re-engagement email deduplication (bonus reminders, win-back campaigns).

CREATE TABLE IF NOT EXISTS reengagement_email_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  template   TEXT NOT NULL,
  sent_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, template, sent_date)
);

CREATE INDEX IF NOT EXISTS idx_reengagement_email_user_template
  ON reengagement_email_log (user_id, template, created_at DESC);
