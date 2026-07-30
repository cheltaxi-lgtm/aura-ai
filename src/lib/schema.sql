-- Zovus — полная схема PostgreSQL (2026)
-- Монтируется в Docker через docker-compose.yml (fresh DB).
-- Существующие базы: npm run migrate (scripts/migrate.mjs + scripts/migrations/*.sql).
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS vector;

-- === SPEC: Users (профиль онбординга) ===
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  gender TEXT NOT NULL CHECK (gender IN ('male', 'female')),
  birth_date DATE NOT NULL,
  zodiac TEXT NOT NULL,
  birth_time TIME,
  birth_city TEXT,
  life_focus TEXT DEFAULT 'general',
  main_question TEXT,
  astro_meta JSONB NOT NULL DEFAULT '{}',
  rune_balance INTEGER NOT NULL DEFAULT 0,
  total_runes_purchased INTEGER NOT NULL DEFAULT 0,
  starter_runes_granted BOOLEAN NOT NULL DEFAULT FALSE,
  last_daily_bonus TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- === Durable async work ===
CREATE TABLE IF NOT EXISTS async_jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN (
    'reading', 'image_generate', 'natal_interpretation',
    'natal_forecast', 'natal_compatibility',
    'intention_spread', 'daily_reading', 'daily_extended',
    'joint_reading', 'joint_combined', 'photo_reading', 'ritual_generation',
    'numerology_reading'
  )),
  status        TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  input         JSONB NOT NULL DEFAULT '{}'::jsonb,
  result        JSONB,
  error_message TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours',
  locked_at     TIMESTAMPTZ,
  worker_id     TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  period_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_code    TEXT,
  billing_state TEXT NOT NULL DEFAULT 'unbilled'
    CHECK (billing_state IN ('unbilled', 'charged', 'refunded', 'completed')),
  charge_transaction_id UUID,
  dedupe_key    TEXT NOT NULL DEFAULT '',
  action_type   TEXT,
  output_entity_id UUID,
  output_entity_table TEXT,
  provenance    JSONB NOT NULL DEFAULT '{}'::jsonb,
  next_attempt_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_async_jobs_user_created
  ON async_jobs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_async_jobs_pending
  ON async_jobs (created_at)
  WHERE status IN ('pending', 'running');
CREATE INDEX IF NOT EXISTS idx_async_jobs_worker_claim
  ON async_jobs (created_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_async_jobs_stale_running
  ON async_jobs (locked_at)
  WHERE status = 'running';
CREATE UNIQUE INDEX IF NOT EXISTS idx_async_jobs_dedupe_active
  ON async_jobs (user_id, kind, dedupe_key)
  WHERE status IN ('pending', 'running') AND dedupe_key <> '';
CREATE INDEX IF NOT EXISTS idx_async_jobs_next_attempt
  ON async_jobs (next_attempt_at)
  WHERE status = 'pending' AND next_attempt_at IS NOT NULL;

-- === SPEC: History (сеансы и контекст) ===
CREATE TABLE IF NOT EXISTS history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  character_name TEXT NOT NULL,
  context_data JSONB NOT NULL DEFAULT '{}',
  free_question_count INT NOT NULL DEFAULT 0,
  is_paid BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_history_user ON history(user_id);

-- === SPEC: Influencers (B2B блогеры) ===
CREATE TABLE IF NOT EXISTS influencers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  telegram_link TEXT,
  custom_prompt TEXT,
  balance NUMERIC(12, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS influencer_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  influencer_id UUID NOT NULL REFERENCES influencers(id) ON DELETE CASCADE,
  session_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_influencer_clicks ON influencer_clicks(influencer_id);

-- === Сессии (анонимные и привязанные) ===
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  referrer_slug TEXT,
  influencer_token TEXT,
  free_questions_used INT NOT NULL DEFAULT 0,
  paid_until TIMESTAMPTZ,
  has_single_unlock BOOLEAN NOT NULL DEFAULT FALSE,
  character_key TEXT,
  intention TEXT,
  spread_type TEXT,
  spread_id TEXT,
  cards JSONB,
  memory_read_mode TEXT NOT NULL DEFAULT 'default'
    CHECK (memory_read_mode IN ('default', 'fresh')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed')),
  awaiting_context BOOLEAN NOT NULL DEFAULT FALSE,
  guest_resume_token_hash TEXT,
  guest_resume_expires_at TIMESTAMPTZ,
  guest_resume_status TEXT
    CHECK (
      guest_resume_status IS NULL
      OR guest_resume_status IN ('issued', 'claimed', 'reading_consumed', 'expired')
    ),
  guest_resume_fingerprint TEXT,
  guest_resume_reading_id UUID REFERENCES history(id) ON DELETE SET NULL,
  guest_resume_claimed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE INDEX IF NOT EXISTS idx_sessions_user_character
  ON sessions (user_id, character_key, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_sessions_active
  ON sessions (user_id, character_key, status, updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_guest_resume_token_hash
  ON sessions (guest_resume_token_hash)
  WHERE guest_resume_token_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sessions_guest_resume_expiry
  ON sessions (guest_resume_expires_at)
  WHERE guest_resume_status = 'issued';

-- === Чат ===
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  character_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  image_url TEXT,
  owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_owner ON chat_messages(owner_user_id);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id);

CREATE INDEX IF NOT EXISTS idx_chat_messages_owner_character
  ON chat_messages (owner_user_id, character_id, created_at);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session_character_created
  ON chat_messages (session_id, character_id, created_at ASC);

-- === SPEC: Payments ===
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id TEXT UNIQUE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  session_id UUID NOT NULL REFERENCES sessions(id),
  yukassa_payment_id TEXT UNIQUE,
  yoomoney_operation_id TEXT UNIQUE,
  amount NUMERIC(10, 2) NOT NULL,
  payment_type TEXT NOT NULL CHECK (payment_type IN ('single', 'subscription')),
  status TEXT NOT NULL DEFAULT 'pending',
  referrer_slug TEXT,
  influencer_id UUID REFERENCES influencers(id),
  blogger_split_percent INT DEFAULT 80,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_referrer ON payments(referrer_slug);

-- === Аккаунты (регистрация / ЛК) ===
CREATE TABLE IF NOT EXISTS user_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  name TEXT NOT NULL,
  profile_user_id UUID REFERENCES users(id),
  is_unlimited BOOLEAN NOT NULL DEFAULT FALSE,
  terms_accepted_at TIMESTAMPTZ,
  age_confirmed_at TIMESTAMPTZ,
  marketing_consent BOOLEAN NOT NULL DEFAULT FALSE,
  marketing_consent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_accounts_profile_user_id_unique UNIQUE (profile_user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_accounts_unlimited ON user_accounts(is_unlimited)
  WHERE is_unlimited = TRUE;

CREATE TABLE IF NOT EXISTS user_oauth_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_account_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('vk', 'yandex', 'mailru')),
  provider_user_id TEXT NOT NULL,
  provider_email TEXT,
  provider_email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  provider_gender TEXT CHECK (provider_gender IS NULL OR provider_gender IN ('male', 'female')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ,
  UNIQUE (provider, provider_user_id)
);

CREATE INDEX IF NOT EXISTS idx_oauth_identities_account
  ON user_oauth_identities(user_account_id);

CREATE INDEX IF NOT EXISTS idx_oauth_identities_email
  ON user_oauth_identities(lower(provider_email))
  WHERE provider_email IS NOT NULL;

CREATE TABLE IF NOT EXISTS user_telegram_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_account_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
  telegram_user_id BIGINT NOT NULL,
  username TEXT,
  photo_url TEXT,
  first_name TEXT,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ,
  CONSTRAINT user_telegram_identities_telegram_user_id_unique UNIQUE (telegram_user_id),
  CONSTRAINT user_telegram_identities_account_unique UNIQUE (user_account_id)
);

CREATE INDEX IF NOT EXISTS idx_telegram_identities_account
  ON user_telegram_identities(user_account_id);

CREATE TABLE IF NOT EXISTS oauth_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash BYTEA NOT NULL UNIQUE,
  provider TEXT NOT NULL CHECK (provider IN ('vk', 'yandex')),
  code_verifier TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  return_to TEXT NOT NULL,
  session_id TEXT,
  mode TEXT NOT NULL CHECK (mode IN ('login', 'register', 'link')),
  link_account_id UUID REFERENCES user_accounts(id) ON DELETE CASCADE,
  accepted_terms BOOLEAN NOT NULL DEFAULT FALSE,
  age_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  marketing_consent BOOLEAN NOT NULL DEFAULT FALSE,
  app_flow BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_oauth_transactions_expires
  ON oauth_transactions(expires_at);

CREATE TABLE IF NOT EXISTS oauth_pending_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash BYTEA NOT NULL UNIQUE,
  provider TEXT NOT NULL CHECK (provider IN ('vk', 'yandex')),
  provider_user_id TEXT NOT NULL,
  provider_email TEXT,
  provider_email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  provider_name TEXT NOT NULL,
  provider_gender TEXT CHECK (provider_gender IN ('male', 'female')),
  return_to TEXT NOT NULL,
  session_id TEXT,
  app_flow BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_oauth_pending_registrations_expires
  ON oauth_pending_registrations(expires_at);

CREATE TABLE IF NOT EXISTS oauth_handoffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash BYTEA NOT NULL UNIQUE,
  account_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_oauth_handoffs_expires
  ON oauth_handoffs(expires_at);

CREATE TABLE IF NOT EXISTS expert_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  title TEXT,
  style_notes TEXT,
  emoji TEXT DEFAULT '🔮',
  split_percent INT NOT NULL DEFAULT 80,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- === White-label блогеры (расширение influencers) ===
CREATE TABLE IF NOT EXISTS bloggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  title TEXT,
  split_percent INT NOT NULL DEFAULT 80,
  style_notes TEXT,
  emoji TEXT DEFAULT '🔮',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  influencer_id UUID REFERENCES influencers(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS blogger_knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blogger_id UUID NOT NULL REFERENCES bloggers(id) ON DELETE CASCADE,
  title TEXT,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blogger_knowledge_blogger ON blogger_knowledge(blogger_id);

-- Демо white-label
INSERT INTO bloggers (slug, display_name, title, split_percent, style_notes, emoji)
VALUES (
  'gadalka_marina',
  'Marina',
  'Таро · Расклады · Ритуалы',
  80,
  'Говоришь тепло, образно, с отсылками к лунным циклам.',
  '🌹'
) ON CONFLICT (slug) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  title = EXCLUDED.title,
  style_notes = EXCLUDED.style_notes;

-- === Admin panel ===
CREATE TABLE IF NOT EXISTS admin_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS platform_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES admin_accounts(id)
);

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES admin_accounts(id),
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit_log(created_at DESC);

INSERT INTO platform_settings (key, value) VALUES
  ('ai', '{"provider":"openrouter","model":"openai/gpt-4o-mini","visionModel":"openai/gpt-4o","temperature":0.85,"maxTokens":800,"maxReadingTokens":900}'),
  ('pricing', '{"singlePrice":199,"subscriptionPrice":590,"currency":"RUB"}'),
  ('features', '{"maintenanceMode":false,"registrationEnabled":true,"recaptchaEnabled":false,"recaptchaScopes":{"register":true,"login":true,"expertRegister":true,"expertLogin":true,"adminLogin":true,"support":true,"chat":true,"payments":true},"freeQuestionLimit":2,"demoPayments":true}'),
  ('prompts', '{"globalPrefix":"Ты — мастер эзотерической платформы Zovus. Отвечай на русском."}'),
  ('tts', '{"enabled":false,"model":"google/gemini-3.1-flash-tts-preview","fallbackModel":"hexgrad/kokoro-82m","fallbackEnabled":true,"chunkChars":4000}'),
  ('visual', '{"enabled":true,"model":"bytedance-seed/seedream-4.5","fallbackModel":"google/gemini-3.1-flash-image-preview","fallbackEnabled":true,"defaultQuality":"standard","stylePrefix":"Zovus mystical esoteric platform, cinematic lighting, rich colors, highly detailed digital art, no watermark, no UI elements","scenes":{"zodiac_avatar":true,"tarot_atmosphere":true,"destiny_card":true,"scene_illustration":true,"final_report":true}}'),
  ('runes', '{"enabled":true,"rubPerRune":2,"starterRunes":30,"freeQuestions":2,"costs":{"QUESTION":10,"VISION_ANALYSIS":30,"READING":15,"INTENTION_SPREAD":20,"DESTINY_CARD":20,"JOINT_READING":25,"DAILY_AMULET":5,"DAILY_EXTENDED":10,"FINAL_REPORT":30,"NATAL_READING":20,"FORECAST_REPORT":20,"SYNASTRY_REPORT":30}}')
ON CONFLICT (key) DO NOTHING;

-- === Runes (internal currency) ===
CREATE TABLE IF NOT EXISTS rune_transactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type            TEXT NOT NULL CHECK (type IN ('purchase', 'spend', 'bonus', 'refund', 'daily_bonus', 'achievement')),
  amount          INTEGER NOT NULL,
  balance_after   INTEGER NOT NULL,
  description     TEXT NOT NULL,
  action_type     TEXT,
  payment_id      TEXT,
  refund_of_transaction_id UUID REFERENCES rune_transactions(id) ON DELETE SET NULL,
  shown_receipt   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rune_transactions_user
  ON rune_transactions (user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rune_transactions_payment_purchase
  ON rune_transactions (payment_id)
  WHERE type = 'purchase' AND payment_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_rune_transactions_refund_once
  ON rune_transactions (refund_of_transaction_id)
  WHERE type = 'refund' AND refund_of_transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rune_transactions_unshown
  ON rune_transactions (user_id, created_at DESC)
  WHERE shown_receipt = FALSE
    AND type IN ('purchase', 'achievement', 'daily_bonus', 'bonus');

CREATE TABLE IF NOT EXISTS rune_packages (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  runes       INTEGER NOT NULL,
  price_rub   INTEGER NOT NULL,
  bonus_runes INTEGER NOT NULL DEFAULT 0,
  is_popular  BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

INSERT INTO rune_packages (id, name, runes, price_rub, bonus_runes, is_popular, sort_order)
VALUES
  ('starter',  'Искатель',    50,   99,    0,   false, 1),
  ('adept',    'Посвящённый', 150,  249,   15,  true,  2),
  ('keeper',   'Хранитель',   500,  699,   75,  false, 3),
  ('chosen',   'Избранный',   1500, 1690,  300, false, 4)
ON CONFLICT (id) DO NOTHING;

-- Rate limiting (shared across app instances)
CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  bucket_key TEXT PRIMARY KEY,
  count INT NOT NULL DEFAULT 1,
  reset_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_reset ON rate_limit_buckets(reset_at);

CREATE TABLE IF NOT EXISTS session_memories (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id      UUID REFERENCES sessions(id) ON DELETE CASCADE,
  character_key   TEXT NOT NULL,
  session_date    TIMESTAMPTZ NOT NULL DEFAULT now(),
  topic_summary   TEXT NOT NULL,
  key_cards       TEXT[] NOT NULL DEFAULT '{}',
  prediction      TEXT NOT NULL,
  mood            TEXT,
  outcome_rating  INTEGER CHECK (outcome_rating BETWEEN 1 AND 5),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_session_memories_user
  ON session_memories (user_id, character_key, session_date DESC);

CREATE INDEX IF NOT EXISTS idx_session_memories_user_created
  ON session_memories (user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_session_memories_session_unique
  ON session_memories (session_id)
  WHERE session_id IS NOT NULL;

-- Lifetime stats (survive cabinet purge)
CREATE TABLE IF NOT EXISTS user_lifetime_stats (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  total_sessions INT NOT NULL DEFAULT 0,
  total_cards INT NOT NULL DEFAULT 0,
  master_counts JSONB NOT NULL DEFAULT '{}',
  backfilled_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_lifetime_session_snapshots (
  session_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  character_key TEXT NOT NULL,
  cards_count INT NOT NULL DEFAULT 0,
  PRIMARY KEY (session_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_lifetime_snapshots_user
  ON user_lifetime_session_snapshots (user_id);

CREATE TABLE IF NOT EXISTS user_facts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fact             TEXT NOT NULL,
  category         TEXT,
  event_date       DATE,
  source_character TEXT,
  salience         SMALLINT NOT NULL DEFAULT 3,
  embedding        vector(1024),
  source_type      TEXT NOT NULL DEFAULT 'legacy',
  source_entity_id UUID,
  subject_key      TEXT,
  predicate_key    TEXT,
  entity_key       TEXT,
  status           TEXT NOT NULL DEFAULT 'active',
  confidence       REAL NOT NULL DEFAULT 1,
  sensitivity      TEXT NOT NULL DEFAULT 'normal',
  valid_from       TIMESTAMPTZ,
  valid_to         TIMESTAMPTZ,
  superseded_by    UUID,
  last_confirmed_at TIMESTAMPTZ,
  embedding_model  TEXT,
  embedding_version TEXT,
  consent_version  TEXT,
  evidence_quote   TEXT,
  source_captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmation_count INTEGER NOT NULL DEFAULT 0,
  capture_tier TEXT NOT NULL DEFAULT 'durable'
    CHECK (capture_tier IN ('draft', 'durable', 'user_confirmed')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_facts_user
  ON user_facts (user_id, salience DESC, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_facts_embedding
  ON user_facts USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_user_facts_events
  ON user_facts (user_id, event_date)
  WHERE event_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_facts_fts
  ON user_facts USING gin (to_tsvector('russian', fact));

CREATE INDEX IF NOT EXISTS idx_user_facts_active
  ON user_facts (user_id, updated_at DESC)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS user_memory_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  memory_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  auto_capture_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  sensitive_capture_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  event_reminders_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  memory_initial_choice TEXT CHECK (memory_initial_choice IN ('enabled', 'disabled')),
  memory_initial_choice_at TIMESTAMPTZ,
  memory_initial_prompt_version TEXT,
  memory_moments_mode TEXT NOT NULL DEFAULT 'active'
    CHECK (memory_moments_mode IN ('active', 'quiet')),
  memory_cabinet_mode TEXT NOT NULL DEFAULT 'simple'
    CHECK (memory_cabinet_mode IN ('simple', 'advanced')),
  memory_rollout_bucket SMALLINT CHECK (memory_rollout_bucket BETWEEN 0 AND 99),
  memory_prompt_variant TEXT,
  memory_choice_email_version TEXT,
  consent_version TEXT,
  consent_granted_at TIMESTAMPTZ,
  consent_revoked_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS memory_extraction_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  source_entity_id UUID,
  character_id TEXT,
  user_message TEXT NOT NULL,
  assistant_reply TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error TEXT,
  extracted_count INTEGER NOT NULL DEFAULT 0,
  stored_count INTEGER NOT NULL DEFAULT 0,
  grounding_rejected_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Soft-dedupe identical pending spam only (one turn = one job).
CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_extraction_jobs_pending_msg
  ON memory_extraction_jobs (user_id, source_type, md5(user_message))
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_memory_extraction_jobs_pending
  ON memory_extraction_jobs (status, next_attempt_at ASC)
  WHERE status IN ('pending', 'running');

CREATE TABLE IF NOT EXISTS user_memory_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fact_id UUID REFERENCES user_facts(id) ON DELETE SET NULL,
  source_entity_id UUID,
  activity_type TEXT NOT NULL DEFAULT 'learned',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  seen_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_user_memory_activity_unseen
  ON user_memory_activity (user_id, created_at DESC)
  WHERE seen_at IS NULL;

CREATE TABLE IF NOT EXISTS session_memory_fact_decisions (
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fact_id UUID NOT NULL REFERENCES user_facts(id) ON DELETE CASCADE,
  decision TEXT NOT NULL CHECK (decision IN ('included', 'excluded')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (session_id, fact_id)
);

CREATE TABLE IF NOT EXISTS memory_product_events (
  id BIGSERIAL PRIMARY KEY,
  event TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id UUID REFERENCES user_accounts(id) ON DELETE SET NULL,
  session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  source_type TEXT,
  prompt_version TEXT,
  consent_version TEXT,
  rollout_bucket SMALLINT CHECK (rollout_bucket BETWEEN 0 AND 99),
  variant TEXT,
  memory_enabled BOOLEAN,
  auto_capture_enabled BOOLEAN,
  moments_mode TEXT,
  fact_category TEXT,
  fact_source_type TEXT,
  sensitivity TEXT,
  numeric_value NUMERIC(14, 2),
  properties JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_memory_product_events_event_created
  ON memory_product_events (event, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_memory_product_events_user_created
  ON memory_product_events (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS user_memory_tombstones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fact_hmac TEXT NOT NULL,
  predicate_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  UNIQUE (user_id, fact_hmac)
);

CREATE TABLE IF NOT EXISTS diary_entries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  character_key TEXT NOT NULL,
  entry_text    TEXT NOT NULL,
  cards         TEXT[] DEFAULT '{}',
  session_id    UUID REFERENCES sessions(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_diary_user
  ON diary_entries (user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_diary_entries_user_session
  ON diary_entries (user_id, session_id)
  WHERE session_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS user_achievements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement TEXT NOT NULL,
  earned_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, achievement)
);

CREATE INDEX IF NOT EXISTS idx_user_achievements_user ON user_achievements(user_id);

CREATE TABLE IF NOT EXISTS daily_readings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  character_key TEXT NOT NULL,
  reading_text  TEXT NOT NULL,
  cards         JSONB NOT NULL DEFAULT '[]'::jsonb,
  deck_system   TEXT,
  reading_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  UNIQUE(user_id, reading_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_readings_user_date
  ON daily_readings (user_id, reading_date DESC);

-- Ritual sessions
CREATE TABLE IF NOT EXISTS rituals (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  character_key    TEXT NOT NULL,
  ritual_type      TEXT NOT NULL
    CHECK (ritual_type IN ('love','money','protection','luck','release','health','career')),
  status           TEXT NOT NULL DEFAULT 'questions'
    CHECK (status IN ('questions','spread','payment','generating','completed','reviewed')),
  answers          JSONB DEFAULT '[]',
  cards            JSONB DEFAULT '[]',
  moon_phase       TEXT,
  moon_sign        TEXT,
  ritual_time      TEXT,
  ritual_place     TEXT,
  ritual_items     JSONB DEFAULT '[]',
  ritual_steps     JSONB DEFAULT '[]',
  ritual_words     TEXT,
  ritual_word_of_power TEXT,
  ritual_word_of_power_transcription TEXT,
  ritual_forbids   JSONB DEFAULT '[]',
  ritual_signs     JSONB DEFAULT '[]',
  rune_cost        INTEGER NOT NULL DEFAULT 0,
  payment_status   TEXT NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('free','pending','paid')),
  transaction_id   UUID REFERENCES rune_transactions(id),
  outcome_text     TEXT,
  outcome_rating   INTEGER CHECK (outcome_rating BETWEEN 1 AND 5),
  outcome_shared   BOOLEAN DEFAULT FALSE,
  remind_at        TIMESTAMPTZ,
  reminded_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ritual_outcomes_public (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ritual_type      TEXT NOT NULL,
  character_key    TEXT NOT NULL,
  outcome_text     TEXT NOT NULL,
  outcome_rating   INTEGER NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rituals_user ON rituals (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rituals_remind ON rituals (remind_at) WHERE status = 'completed' AND reminded_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ritual_outcomes_type ON ritual_outcomes_public (ritual_type, character_key);

CREATE TABLE IF NOT EXISTS notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  data       JSONB DEFAULT '{}',
  read       BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications (user_id, created_at DESC) WHERE read = FALSE;

-- === Техподдержка (обращения пользователей) ===
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

-- === Share snapshots (viral content links) ===
CREATE TABLE IF NOT EXISTS share_snapshots (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token        TEXT UNIQUE NOT NULL,
  user_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('reading', 'ritual', 'daily', 'triplet', 'session')),
  payload      JSONB NOT NULL,
  source_meta  JSONB,
  view_count   INT NOT NULL DEFAULT 0,
  expires_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_share_snapshots_token ON share_snapshots(token);

-- Joint readings (async paired spreads)
CREATE TABLE IF NOT EXISTS joint_readings (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token                 TEXT UNIQUE NOT NULL,
  initiator_user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  initiator_name        TEXT,
  partner_name          TEXT,
  spread_id             TEXT NOT NULL DEFAULT 'love-7',
  intent_slug           TEXT NOT NULL DEFAULT 'sovmestimost-pary',
  status                TEXT NOT NULL DEFAULT 'pending_partner'
    CHECK (status IN ('pending_partner', 'partner_done', 'completed', 'expired')),
  initiator_session_id  TEXT,
  initiator_reading     TEXT,
  initiator_cards       JSONB DEFAULT '[]'::jsonb,
  initiator_character   TEXT,
  partner_user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  partner_session_id    TEXT,
  partner_reading       TEXT,
  partner_cards         JSONB DEFAULT '[]'::jsonb,
  partner_character     TEXT,
  combined_reading      TEXT,
  combined_claim_token  UUID,
  combined_claim_at     TIMESTAMPTZ,
  completion_notified_at TIMESTAMPTZ,
  synastry_data         JSONB,
  rune_charged          BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at            TIMESTAMPTZ NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at          TIMESTAMPTZ,
  reminder_sent_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_joint_readings_token ON joint_readings (token);
CREATE INDEX IF NOT EXISTS idx_joint_readings_initiator ON joint_readings (initiator_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_joint_readings_partner ON joint_readings (partner_user_id, created_at DESC)
  WHERE partner_user_id IS NOT NULL;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS notification_prefs JSONB NOT NULL DEFAULT '{
    "dailyEmail": true,
    "dailyInApp": true,
    "reminderHourUtc": 6
  }'::jsonb;

CREATE TABLE IF NOT EXISTS daily_reminder_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sent_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  channel    TEXT NOT NULL CHECK (channel IN ('in_app', 'email')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, sent_date, channel)
);

-- === Natal charts (optional premium module) ===
CREATE TABLE IF NOT EXISTS natal_charts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  birth_lat DOUBLE PRECISION,
  birth_lon DOUBLE PRECISION,
  birth_tzid TEXT,
  birth_place_label TEXT,
  time_known BOOLEAN NOT NULL DEFAULT FALSE,
  house_system TEXT NOT NULL DEFAULT 'placidus',
  chart_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  engine_version TEXT NOT NULL DEFAULT 'v1',
  computed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_transit_notify_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_natal_charts_user ON natal_charts(user_id);

CREATE TABLE IF NOT EXISTS natal_report_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  birth_fingerprint TEXT NOT NULL,
  engine_version TEXT NOT NULL,
  ephemeris TEXT NOT NULL,
  tradition TEXT NOT NULL CHECK (tradition IN ('western', 'vedic')),
  report_type TEXT NOT NULL DEFAULT 'interpretation',
  content TEXT NOT NULL CHECK (length(btrim(content)) > 0),
  structured_data JSONB,
  evidence_refs JSONB,
  rune_cost INTEGER CHECK (rune_cost IS NULL OR rune_cost >= 0),
  charge_transaction_id UUID REFERENCES rune_transactions(id) ON DELETE SET NULL,
  claim_token UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT natal_report_history_version_unique UNIQUE (
    user_id,
    birth_fingerprint,
    engine_version,
    ephemeris,
    tradition,
    report_type
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_natal_report_history_charge
  ON natal_report_history(charge_transaction_id)
  WHERE charge_transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_natal_report_history_user_created
  ON natal_report_history(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS numerology_report_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tool_id TEXT NOT NULL,
  birth_date DATE NOT NULL,
  calculation_version TEXT NOT NULL DEFAULT 'matrix-v1',
  content TEXT NOT NULL CHECK (length(btrim(content)) > 0),
  structured_data JSONB,
  rune_cost INTEGER CHECK (rune_cost IS NULL OR rune_cost >= 0),
  charge_transaction_id UUID REFERENCES rune_transactions(id) ON DELETE SET NULL,
  session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT numerology_report_history_version_unique UNIQUE (
    user_id,
    tool_id,
    birth_date,
    calculation_version
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_numerology_report_history_charge
  ON numerology_report_history(charge_transaction_id)
  WHERE charge_transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_numerology_report_history_user_created
  ON numerology_report_history(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_numerology_report_history_user_tool_birth
  ON numerology_report_history(user_id, tool_id, birth_date);

CREATE TABLE IF NOT EXISTS natal_compatibility_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  participant_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  canonical_report_id UUID REFERENCES natal_compatibility_reports(id) ON DELETE SET NULL,
  mode TEXT NOT NULL CHECK (mode IN ('manual', 'invite')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'ready', 'completed', 'expired')),
  owner_label TEXT NOT NULL CHECK (length(btrim(owner_label)) BETWEEN 1 AND 80),
  partner_label TEXT NOT NULL CHECK (length(btrim(partner_label)) BETWEEN 1 AND 80),
  owner_fingerprint TEXT NOT NULL CHECK (owner_fingerprint ~ '^[a-f0-9]{64}$'),
  partner_fingerprint TEXT CHECK (partner_fingerprint IS NULL OR partner_fingerprint ~ '^[a-f0-9]{64}$'),
  pair_fingerprint TEXT CHECK (pair_fingerprint IS NULL OR pair_fingerprint ~ '^[a-f0-9]{64}$'),
  invite_token_hash BYTEA UNIQUE,
  invite_token_prefix TEXT,
  synastry_snapshot JSONB,
  report_data JSONB,
  evidence_refs JSONB,
  rune_cost INTEGER CHECK (rune_cost IS NULL OR rune_cost >= 0),
  charge_transaction_id UUID UNIQUE REFERENCES rune_transactions(id) ON DELETE SET NULL,
  generation_claim_token UUID,
  generation_claim_at TIMESTAMPTZ,
  claimed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT natal_compatibility_mode_token CHECK (
    (mode = 'manual' AND invite_token_hash IS NULL) OR
    (mode = 'invite' AND invite_token_hash IS NOT NULL)
  ),
  CONSTRAINT natal_compatibility_ready_data CHECK (
    status IN ('pending', 'expired') OR
    (partner_fingerprint IS NOT NULL AND pair_fingerprint IS NOT NULL AND synastry_snapshot IS NOT NULL)
  ),
  CONSTRAINT natal_compatibility_completed_data CHECK (
    status <> 'completed' OR
    (report_data IS NOT NULL AND evidence_refs IS NOT NULL AND completed_at IS NOT NULL)
  ),
  CONSTRAINT natal_compatibility_snapshot_private CHECK (
    synastry_snapshot IS NULL OR NOT (
      jsonb_path_exists(synastry_snapshot, '$.**.birthDate') OR
      jsonb_path_exists(synastry_snapshot, '$.**.birthTime') OR
      jsonb_path_exists(synastry_snapshot, '$.**.birthCity') OR
      jsonb_path_exists(synastry_snapshot, '$.**.latitude') OR
      jsonb_path_exists(synastry_snapshot, '$.**.timezone')
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_natal_compatibility_owner_created
  ON natal_compatibility_reports(owner_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_natal_compatibility_participant_created
  ON natal_compatibility_reports(participant_user_id, created_at DESC)
  WHERE participant_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_natal_compatibility_expiry
  ON natal_compatibility_reports(expires_at) WHERE status <> 'expired';
CREATE UNIQUE INDEX IF NOT EXISTS idx_natal_compatibility_owner_pair
  ON natal_compatibility_reports(owner_user_id, pair_fingerprint)
  WHERE pair_fingerprint IS NOT NULL AND status <> 'expired';

CREATE TABLE IF NOT EXISTS private_report_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE CHECK (length(token) >= 43),
  report_kind TEXT NOT NULL CHECK (report_kind IN ('natal', 'relationship', 'compatibility')),
  report_id UUID NOT NULL,
  selected_sections TEXT[] NOT NULL CHECK (cardinality(selected_sections) > 0),
  public_payload JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_private_report_shares_owner
  ON private_report_shares(owner_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_private_report_shares_active_token
  ON private_report_shares(token)
  WHERE revoked_at IS NULL;

CREATE OR REPLACE FUNCTION validate_private_report_share_target()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.report_kind = 'natal' THEN
    IF NOT EXISTS (
      SELECT 1 FROM natal_report_history
      WHERE id = NEW.report_id AND user_id = NEW.owner_user_id
    ) THEN
      RAISE EXCEPTION 'invalid natal report share target' USING ERRCODE = '23503';
    END IF;
  ELSIF NEW.report_kind = 'relationship' THEN
    IF NOT EXISTS (
      SELECT 1 FROM joint_readings
      WHERE id = NEW.report_id
        AND status = 'completed'
        AND (initiator_user_id = NEW.owner_user_id OR partner_user_id = NEW.owner_user_id)
    ) THEN
      RAISE EXCEPTION 'invalid relationship report share target' USING ERRCODE = '23503';
    END IF;
  ELSIF NEW.report_kind = 'compatibility' THEN
    IF NOT EXISTS (
      SELECT 1 FROM natal_compatibility_reports
      WHERE id = NEW.report_id
        AND status = 'completed'
        AND (owner_user_id = NEW.owner_user_id OR participant_user_id = NEW.owner_user_id)
    ) THEN
      RAISE EXCEPTION 'invalid compatibility report share target' USING ERRCODE = '23503';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_private_report_share_target ON private_report_shares;
CREATE TRIGGER trg_validate_private_report_share_target
  BEFORE INSERT OR UPDATE OF owner_user_id, report_kind, report_id
  ON private_report_shares
  FOR EACH ROW EXECUTE FUNCTION validate_private_report_share_target();

CREATE TABLE IF NOT EXISTS natal_timing_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  horizon_days INTEGER NOT NULL CHECK (horizon_days IN (7, 30, 90, 365)),
  window_start DATE NOT NULL,
  window_end DATE NOT NULL,
  engine_version TEXT NOT NULL,
  birth_fingerprint TEXT NOT NULL,
  timing_data JSONB,
  generated_at TIMESTAMPTZ,
  claim_token UUID,
  claim_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT natal_timing_cache_window_unique UNIQUE (
    user_id, horizon_days, window_start, engine_version, birth_fingerprint
  )
);

CREATE INDEX IF NOT EXISTS idx_natal_timing_cache_user_generated
  ON natal_timing_cache(user_id, generated_at DESC);

CREATE TABLE IF NOT EXISTS natal_event_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  horizons INTEGER[] NOT NULL DEFAULT ARRAY[7, 30],
  categories TEXT[] NOT NULL DEFAULT ARRAY[
    'identity', 'emotions', 'relationships', 'career', 'growth', 'pressure', 'transformation'
  ],
  planet_importance TEXT[] NOT NULL DEFAULT ARRAY['jupiter', 'saturn', 'uranus', 'neptune', 'pluto'],
  frequency TEXT NOT NULL DEFAULT 'daily' CHECK (frequency IN ('daily', 'weekly')),
  in_app BOOLEAN NOT NULL DEFAULT TRUE,
  push BOOLEAN NOT NULL DEFAULT FALSE,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  last_notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT natal_event_preferences_horizons CHECK (
    horizons <@ ARRAY[7, 30, 90, 365] AND cardinality(horizons) <= 4
  ),
  CONSTRAINT natal_event_preferences_categories CHECK (
    categories <@ ARRAY[
      'identity', 'emotions', 'relationships', 'career', 'growth', 'pressure', 'transformation'
    ] AND cardinality(categories) <= 7
  )
);

CREATE INDEX IF NOT EXISTS idx_natal_event_preferences_due
  ON natal_event_preferences(timezone, frequency, last_notified_at)
  WHERE enabled = TRUE AND in_app = TRUE;

CREATE TABLE IF NOT EXISTS natal_ai_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  ai_context_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  tarot_context_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS natal_event_delivery_log (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_key TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('in_app', 'push')),
  delivered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, event_key, channel)
);

CREATE INDEX IF NOT EXISTS idx_natal_event_delivery_log_delivered
  ON natal_event_delivery_log(delivered_at);
