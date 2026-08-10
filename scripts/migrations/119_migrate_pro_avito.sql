-- Zovus Pro: Avito Messenger inbox (surface /pro/avito).
-- Lives in the isolated pro schema; no FK into public.* (pro db guard).
-- Ids are Avito-side strings (chat_id / message id) — natural idempotency keys
-- for webhook redeliveries (INSERT ... ON CONFLICT DO NOTHING).
-- Rollback: DROP TABLE pro.avito_messages; DROP TABLE pro.avito_chats;

-- Cleanup of the never-deployed public-schema placement (no-op on prod).
DROP TABLE IF EXISTS avito_messages;
DROP TABLE IF EXISTS avito_chats;

-- On a fresh DB the pro schema arrives via 102_migrate_pro_schema.sql; the
-- schema-diff bootstrap only marks it applied, so create defensively.
CREATE SCHEMA IF NOT EXISTS pro;

CREATE TABLE IF NOT EXISTS pro.avito_chats (
  id                     TEXT PRIMARY KEY,
  avito_user_id          BIGINT,
  client_avito_user_id   BIGINT,
  client_name            TEXT,
  item_id                BIGINT,
  item_title             TEXT,
  last_message_at        TIMESTAMPTZ,
  last_message_preview   TEXT,
  last_message_direction TEXT CHECK (last_message_direction IN ('in', 'out')),
  unread_by_practitioner BOOLEAN NOT NULL DEFAULT FALSE,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pro_avito_chats_last_message
  ON pro.avito_chats (last_message_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_pro_avito_chats_unread
  ON pro.avito_chats (unread_by_practitioner)
  WHERE unread_by_practitioner = TRUE;

CREATE TABLE IF NOT EXISTS pro.avito_messages (
  id               TEXT PRIMARY KEY,
  chat_id          TEXT NOT NULL REFERENCES pro.avito_chats(id) ON DELETE CASCADE,
  direction        TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  type             TEXT NOT NULL DEFAULT 'text',
  text             TEXT,
  author_id        BIGINT,
  avito_created_at TIMESTAMPTZ,
  raw              JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pro_avito_messages_chat
  ON pro.avito_messages (chat_id, avito_created_at NULLS LAST, created_at);
