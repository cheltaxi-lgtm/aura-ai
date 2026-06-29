-- Support tickets (user ↔ admin chat)

CREATE TABLE IF NOT EXISTS support_tickets (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_account_id     UUID NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
  subject             TEXT NOT NULL,
  category            TEXT NOT NULL DEFAULT 'general'
    CHECK (category IN ('general', 'payment', 'technical', 'account', 'other')),
  status              TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'waiting_user', 'resolved', 'closed')),
  priority            TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high')),
  assigned_admin_id   UUID REFERENCES admin_accounts(id) ON DELETE SET NULL,
  unread_by_user      BOOLEAN NOT NULL DEFAULT FALSE,
  unread_by_admin     BOOLEAN NOT NULL DEFAULT TRUE,
  last_message_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_message_by     TEXT CHECK (last_message_by IN ('user', 'admin')),
  closed_at           TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS support_messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id    UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender_type  TEXT NOT NULL CHECK (sender_type IN ('user', 'admin')),
  sender_id    UUID NOT NULL,
  content      TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_user
  ON support_tickets (user_account_id, last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_support_tickets_admin_list
  ON support_tickets (status, last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_support_tickets_unread_admin
  ON support_tickets (last_message_at DESC)
  WHERE unread_by_admin = TRUE AND status NOT IN ('closed', 'resolved');

CREATE INDEX IF NOT EXISTS idx_support_messages_ticket
  ON support_messages (ticket_id, created_at ASC);
