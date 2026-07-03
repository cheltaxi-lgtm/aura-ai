-- Outbound email audit log + password reset tokens.

CREATE TABLE IF NOT EXISTS email_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient     TEXT NOT NULL,
  subject       TEXT NOT NULL,
  template      TEXT NOT NULL,
  provider      TEXT,
  status        TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'skipped')),
  error_message TEXT,
  meta          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_log_created ON email_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_log_template ON email_log (template, created_at DESC);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_account_id  UUID NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
  token_hash       TEXT NOT NULL UNIQUE,
  expires_at       TIMESTAMPTZ NOT NULL,
  used_at          TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_account ON password_reset_tokens (user_account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_password_reset_expires ON password_reset_tokens (expires_at) WHERE used_at IS NULL;
