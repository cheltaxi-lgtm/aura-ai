-- Zovus Pro (practitioner CRM) — isolated schema.
-- Rollback: DROP SCHEMA pro CASCADE;
-- No FK into public.*; user_id / author_user_id are UUID without public references.

CREATE SCHEMA IF NOT EXISTS pro;

CREATE TABLE IF NOT EXISTS pro.accounts (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'suspended', 'closed')),
  tier TEXT NOT NULL DEFAULT 'free_trial'
    CHECK (tier IN ('free_trial', 'pro')),
  display_name TEXT,
  brand_slug TEXT,
  specializations TEXT[] NOT NULL DEFAULT '{}',
  bio TEXT,
  timezone TEXT NOT NULL DEFAULT 'Europe/Moscow',
  onboarding_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  limits JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  UNIQUE (user_id),
  UNIQUE (brand_slug)
);

CREATE TABLE IF NOT EXISTS pro.brand (
  account_id BIGINT PRIMARY KEY REFERENCES pro.accounts(id) ON DELETE CASCADE,
  logo_url TEXT,
  accent_color TEXT,
  signature TEXT,
  contact_public TEXT,
  extra_disclaimer TEXT,
  report_theme TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pro.clients (
  id BIGSERIAL PRIMARY KEY,
  account_id BIGINT NOT NULL REFERENCES pro.accounts(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  full_name TEXT,
  email TEXT,
  phone TEXT,
  birth_date DATE,
  birth_time TIME,
  birth_place TEXT,
  birth_lat DOUBLE PRECISION,
  birth_lon DOUBLE PRECISION,
  birth_tz TEXT,
  gender TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  notes TEXT,
  consent_state TEXT NOT NULL DEFAULT 'unknown'
    CHECK (consent_state IN ('unknown', 'confirmed', 'revoked')),
  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'intake', 'import')),
  last_case_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS pro_clients_account_deleted_idx
  ON pro.clients (account_id, deleted_at);
CREATE INDEX IF NOT EXISTS pro_clients_account_last_case_idx
  ON pro.clients (account_id, last_case_at DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS pro.client_consents (
  id BIGSERIAL PRIMARY KEY,
  client_id BIGINT NOT NULL REFERENCES pro.clients(id) ON DELETE CASCADE,
  kind TEXT NOT NULL
    CHECK (kind IN ('pdn', 'recording', 'followup', 'marketing')),
  granted BOOLEAN NOT NULL DEFAULT FALSE,
  doc_version TEXT,
  method TEXT
    CHECK (method IS NULL OR method IN ('intake_form', 'practitioner_confirm')),
  ip_hash TEXT,
  granted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pro_client_consents_client_idx
  ON pro.client_consents (client_id);

CREATE TABLE IF NOT EXISTS pro.layouts (
  id BIGSERIAL PRIMARY KEY,
  account_id BIGINT REFERENCES pro.accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  positions JSONB NOT NULL DEFAULT '[]'::jsonb,
  deck_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pro_layouts_account_idx
  ON pro.layouts (account_id);

CREATE TABLE IF NOT EXISTS pro.cases (
  id BIGSERIAL PRIMARY KEY,
  account_id BIGINT NOT NULL REFERENCES pro.accounts(id) ON DELETE CASCADE,
  client_id BIGINT NOT NULL REFERENCES pro.clients(id) ON DELETE CASCADE,
  type TEXT NOT NULL
    CHECK (type IN (
      'manual_spread', 'photo_spread', 'custom_layout',
      'natal', 'forecast', 'synastry', 'matrix',
      'numerology', 'runes', 'lenormand'
    )),
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN (
      'new', 'input_ready', 'generating', 'draft', 'edited',
      'delivered', 'archived', 'failed'
    )),
  question TEXT,
  practitioner_context TEXT,
  layout_id BIGINT REFERENCES pro.layouts(id) ON DELETE SET NULL,
  ai_cost_runes INT NOT NULL DEFAULT 0,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pro_cases_account_status_idx
  ON pro.cases (account_id, status);
CREATE INDEX IF NOT EXISTS pro_cases_client_idx
  ON pro.cases (client_id);

CREATE TABLE IF NOT EXISTS pro.case_inputs (
  case_id BIGINT PRIMARY KEY REFERENCES pro.cases(id) ON DELETE CASCADE,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'vision', 'transcript', 'voice')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pro.case_versions (
  id BIGSERIAL PRIMARY KEY,
  case_id BIGINT NOT NULL REFERENCES pro.cases(id) ON DELETE CASCADE,
  version INT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('ai', 'human')),
  blocks JSONB NOT NULL DEFAULT '[]'::jsonb,
  uncertainty_marks JSONB NOT NULL DEFAULT '[]'::jsonb,
  author_user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (case_id, version)
);

CREATE INDEX IF NOT EXISTS pro_case_versions_case_idx
  ON pro.case_versions (case_id, version DESC);
