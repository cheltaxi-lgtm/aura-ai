-- Zovus Pro S1/S2: delivery, intake, dialog, usage, audit, assistant runs.
-- Rollback: drop listed tables (schema pro remains).
-- No FK into public.*.

CREATE TABLE IF NOT EXISTS pro.deliveries (
  id BIGSERIAL PRIMARY KEY,
  case_id BIGINT NOT NULL REFERENCES pro.cases(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  token_prefix TEXT NOT NULL,
  ttl_expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  view_count INT NOT NULL DEFAULT 0,
  first_viewed_at TIMESTAMPTZ,
  last_viewed_at TIMESTAMPTZ,
  audio_url TEXT,
  pdf_url TEXT,
  dialog_mode TEXT NOT NULL DEFAULT 'b'
    CHECK (dialog_mode IN ('a', 'b', 'c')),
  dialog_quota INT NOT NULL DEFAULT 5,
  dialog_window_days INT NOT NULL DEFAULT 14,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (token_hash)
);

CREATE INDEX IF NOT EXISTS pro_deliveries_case_idx ON pro.deliveries (case_id);
CREATE INDEX IF NOT EXISTS pro_deliveries_prefix_idx ON pro.deliveries (token_prefix);

CREATE TABLE IF NOT EXISTS pro.intake_forms (
  id BIGSERIAL PRIMARY KEY,
  account_id BIGINT NOT NULL REFERENCES pro.accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Бриф',
  schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  token_hash TEXT NOT NULL,
  token_prefix TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (token_hash)
);

CREATE INDEX IF NOT EXISTS pro_intake_forms_account_idx ON pro.intake_forms (account_id);

CREATE TABLE IF NOT EXISTS pro.intake_responses (
  id BIGSERIAL PRIMARY KEY,
  form_id BIGINT NOT NULL REFERENCES pro.intake_forms(id) ON DELETE CASCADE,
  account_id BIGINT NOT NULL REFERENCES pro.accounts(id) ON DELETE CASCADE,
  client_id BIGINT REFERENCES pro.clients(id) ON DELETE SET NULL,
  case_id BIGINT REFERENCES pro.cases(id) ON DELETE SET NULL,
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  consent_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_hash TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pro.client_threads (
  id BIGSERIAL PRIMARY KEY,
  delivery_id BIGINT NOT NULL REFERENCES pro.deliveries(id) ON DELETE CASCADE,
  case_id BIGINT NOT NULL REFERENCES pro.cases(id) ON DELETE CASCADE,
  account_id BIGINT NOT NULL REFERENCES pro.accounts(id) ON DELETE CASCADE,
  client_id BIGINT NOT NULL REFERENCES pro.clients(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'closed', 'escalated')),
  questions_used INT NOT NULL DEFAULT 0,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pro_client_threads_account_status_idx
  ON pro.client_threads (account_id, status);

CREATE TABLE IF NOT EXISTS pro.thread_messages (
  id BIGSERIAL PRIMARY KEY,
  thread_id BIGINT NOT NULL REFERENCES pro.client_threads(id) ON DELETE CASCADE,
  author TEXT NOT NULL
    CHECK (author IN ('client', 'ai_draft', 'practitioner', 'ai_direct', 'system')),
  body TEXT NOT NULL,
  moderation_state TEXT NOT NULL DEFAULT 'pending'
    CHECK (moderation_state IN ('pending', 'approved', 'rejected', 'auto')),
  safety_flags TEXT[] NOT NULL DEFAULT '{}',
  ai_cost_runes INT NOT NULL DEFAULT 0,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pro_thread_messages_thread_idx
  ON pro.thread_messages (thread_id, created_at);

CREATE TABLE IF NOT EXISTS pro.usage_log (
  id BIGSERIAL PRIMARY KEY,
  account_id BIGINT NOT NULL REFERENCES pro.accounts(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  case_id BIGINT REFERENCES pro.cases(id) ON DELETE SET NULL,
  runes INT NOT NULL DEFAULT 0,
  idempotency_key TEXT NOT NULL,
  ledger_txn_ref TEXT,
  shadow BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS pro_usage_log_account_idx
  ON pro.usage_log (account_id, created_at DESC);

CREATE TABLE IF NOT EXISTS pro.audit_log (
  id BIGSERIAL PRIMARY KEY,
  account_id BIGINT REFERENCES pro.accounts(id) ON DELETE SET NULL,
  actor TEXT NOT NULL CHECK (actor IN ('user', 'admin', 'system')),
  actor_user_id UUID,
  action TEXT NOT NULL,
  target TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pro_audit_log_created_idx
  ON pro.audit_log (created_at DESC);

CREATE TABLE IF NOT EXISTS pro.assistant_runs (
  id BIGSERIAL PRIMARY KEY,
  account_id BIGINT NOT NULL REFERENCES pro.accounts(id) ON DELETE CASCADE,
  mode TEXT NOT NULL
    CHECK (mode IN ('prep', 'table', 'draft', 'style', 'business', 'client_dialog')),
  case_id BIGINT REFERENCES pro.cases(id) ON DELETE SET NULL,
  input_ref TEXT,
  model TEXT,
  tokens_in INT NOT NULL DEFAULT 0,
  tokens_out INT NOT NULL DEFAULT 0,
  cost_runes INT NOT NULL DEFAULT 0,
  latency_ms INT,
  outcome TEXT NOT NULL DEFAULT 'ok'
    CHECK (outcome IN ('ok', 'filtered', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pro.style_profiles (
  id BIGSERIAL PRIMARY KEY,
  account_id BIGINT NOT NULL UNIQUE REFERENCES pro.accounts(id) ON DELETE CASCADE,
  tone JSONB NOT NULL DEFAULT '{}'::jsonb,
  address_form TEXT NOT NULL DEFAULT 'vy'
    CHECK (address_form IN ('ty', 'vy', 'neutral')),
  length_pref TEXT,
  stop_words TEXT[] NOT NULL DEFAULT '{}',
  must_include TEXT[] NOT NULL DEFAULT '{}',
  structure_template JSONB NOT NULL DEFAULT '{}'::jsonb,
  calibration_score NUMERIC(6, 4),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
