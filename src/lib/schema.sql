-- Zovus вЂ” РїРѕР»РЅР°СЏ СЃС…РµРјР° PostgreSQL (2026)
-- РњРѕРЅС‚РёСЂСѓРµС‚СЃСЏ РІ Docker С‡РµСЂРµР· docker-compose.yml (fresh DB).
-- РЎСѓС‰РµСЃС‚РІСѓСЋС‰РёРµ Р±Р°Р·С‹: npm run migrate (scripts/migrate.mjs + scripts/migrations/*.sql).
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS vector;

-- === SPEC: Users (РїСЂРѕС„РёР»СЊ; birth_date optional for stub consumer accounts) ===
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  gender TEXT NOT NULL CHECK (gender IN ('male', 'female')),
  birth_date DATE,
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
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT users_rune_balance_nonneg CHECK (rune_balance >= 0)
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
    'numerology_reading', 'hd_report', 'hd_composite_report', 'pro_premium_report',
    'aura_reading', 'palm_reading'
  )),
  status        TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed', 'needs_regeneration')),
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
  next_attempt_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  queue_wait_ms INTEGER,
  generation_ms INTEGER,
  llm_calls INTEGER,
  llm_cost_rub NUMERIC(12, 4),
  retry_429_count INTEGER NOT NULL DEFAULT 0,
  progress JSONB NOT NULL DEFAULT '{}'::jsonb
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

CREATE TABLE IF NOT EXISTS async_job_notification_deliveries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id          UUID NOT NULL REFERENCES async_jobs(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel         TEXT NOT NULL CHECK (channel IN ('in_app', 'email', 'telegram')),
  status          TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'delivered', 'failed', 'skipped')),
  title           TEXT NOT NULL,
  cta_path        TEXT,
  attempt_count   INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at    TIMESTAMPTZ,
  last_error      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(job_id, channel)
);

CREATE INDEX IF NOT EXISTS idx_report_deliveries_due
  ON async_job_notification_deliveries (next_attempt_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_async_jobs_needs_regeneration
  ON async_jobs (updated_at DESC)
  WHERE status = 'needs_regeneration';
CREATE INDEX IF NOT EXISTS idx_async_jobs_report_pending
  ON async_jobs (created_at)
  WHERE status = 'pending'
    AND kind IN (
      'hd_report',
      'hd_composite_report',
      'pro_premium_report',
      'numerology_reading',
      'natal_interpretation',
      'natal_forecast',
      'natal_compatibility'
    );

-- === SPEC: History (СЃРµР°РЅСЃС‹ Рё РєРѕРЅС‚РµРєСЃС‚) ===
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

-- === SPEC: Influencers (B2B Р±Р»РѕРіРµСЂС‹) ===
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

-- === РЎРµСЃСЃРёРё (Р°РЅРѕРЅРёРјРЅС‹Рµ Рё РїСЂРёРІСЏР·Р°РЅРЅС‹Рµ) ===
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
  numerolog_tool_params JSONB,
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
  message_count INT NOT NULL DEFAULT 0,
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

-- === Р§Р°С‚ ===
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

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_chat_messages_content_trgm
  ON chat_messages USING GIN (content gin_trgm_ops);

CREATE OR REPLACE FUNCTION sync_session_message_count() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE sessions SET message_count = message_count + 1 WHERE id = NEW.session_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE sessions SET message_count = GREATEST(0, message_count - 1) WHERE id = OLD.session_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_chat_messages_count_insert ON chat_messages;
CREATE TRIGGER trg_chat_messages_count_insert
  AFTER INSERT ON chat_messages
  FOR EACH ROW EXECUTE FUNCTION sync_session_message_count();

DROP TRIGGER IF EXISTS trg_chat_messages_count_delete ON chat_messages;
CREATE TRIGGER trg_chat_messages_count_delete
  AFTER DELETE ON chat_messages
  FOR EACH ROW EXECUTE FUNCTION sync_session_message_count();

-- === SPEC: Payments ===
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id TEXT UNIQUE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
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
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_session_id ON payments(session_id);

-- === РђРєРєР°СѓРЅС‚С‹ (СЂРµРіРёСЃС‚СЂР°С†РёСЏ / Р›Рљ) ===
CREATE TABLE IF NOT EXISTS user_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  name TEXT NOT NULL,
  profile_user_id UUID REFERENCES users(id),
  is_unlimited BOOLEAN NOT NULL DEFAULT FALSE,
  token_version INTEGER NOT NULL DEFAULT 0,
  terms_accepted_at TIMESTAMPTZ,
  age_confirmed_at TIMESTAMPTZ,
  marketing_consent BOOLEAN NOT NULL DEFAULT TRUE,
  marketing_consent_at TIMESTAMPTZ,
  registration_attribution JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ,
  daily_cards_reminder BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT user_accounts_profile_user_id_unique UNIQUE (profile_user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_accounts_unlimited ON user_accounts(is_unlimited)
  WHERE is_unlimited = TRUE;

ALTER TABLE user_accounts
  ADD COLUMN IF NOT EXISTS daily_cards_reminder BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

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
  emoji TEXT DEFAULT 'рџ”®',
  split_percent INT NOT NULL DEFAULT 80,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- === White-label Р±Р»РѕРіРµСЂС‹ (СЂР°СЃС€РёСЂРµРЅРёРµ influencers) ===
CREATE TABLE IF NOT EXISTS bloggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  title TEXT,
  split_percent INT NOT NULL DEFAULT 80,
  style_notes TEXT,
  emoji TEXT DEFAULT 'рџ”®',
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

-- Р”РµРјРѕ white-label
INSERT INTO bloggers (slug, display_name, title, split_percent, style_notes, emoji)
VALUES (
  'gadalka_marina',
  'Marina',
  'РўР°СЂРѕ В· Р Р°СЃРєР»Р°РґС‹ В· Р РёС‚СѓР°Р»С‹',
  80,
  'Р“РѕРІРѕСЂРёС€СЊ С‚РµРїР»Рѕ, РѕР±СЂР°Р·РЅРѕ, СЃ РѕС‚СЃС‹Р»РєР°РјРё Рє Р»СѓРЅРЅС‹Рј С†РёРєР»Р°Рј.',
  'рџЊ№'
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
  ('prompts', '{"globalPrefix":"РўС‹ вЂ” РјР°СЃС‚РµСЂ СЌР·РѕС‚РµСЂРёС‡РµСЃРєРѕР№ РїР»Р°С‚С„РѕСЂРјС‹ Zovus. РћС‚РІРµС‡Р°Р№ РЅР° СЂСѓСЃСЃРєРѕРј."}'),
  ('tts', '{"enabled":false,"model":"google/gemini-3.1-flash-tts-preview","fallbackModel":"hexgrad/kokoro-82m","fallbackEnabled":true,"chunkChars":4000}'),
  ('visual', '{"enabled":true,"model":"bytedance-seed/seedream-4.5","fallbackModel":"google/gemini-3.1-flash-image-preview","fallbackEnabled":true,"defaultQuality":"standard","stylePrefix":"Zovus mystical esoteric platform, cinematic lighting, rich colors, highly detailed digital art, no watermark, no UI elements","scenes":{"zodiac_avatar":true,"tarot_atmosphere":true,"destiny_card":true,"scene_illustration":true,"final_report":true}}'),
  ('runes', '{"enabled":true,"rubPerRune":5,"starterRunes":30,"freeQuestions":2,"costs":{"QUESTION":10,"VISION_ANALYSIS":30,"READING":15,"INTENTION_SPREAD":20,"DESTINY_CARD":20,"JOINT_READING":25,"DAILY_AMULET":5,"DAILY_EXTENDED":10,"FINAL_REPORT":30,"NATAL_READING":300,"FORECAST_REPORT":20,"SYNASTRY_REPORT":30,"NUMEROLOGY_SESSION":100,"MATRIX_SUBJECT_REPORT":100,"HD_REPORT":300,"HD_COMPOSITE_REPORT":300}}')
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
  idempotency_key TEXT,
  -- Soft link to sessions.id (bot product dedupe resume; no FK).
  result_session_id UUID,
  refund_of_transaction_id UUID REFERENCES rune_transactions(id) ON DELETE SET NULL,
  shown_receipt   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rune_transactions_user
  ON rune_transactions (user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rune_transactions_payment_purchase
  ON rune_transactions (payment_id)
  WHERE type = 'purchase' AND payment_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_rune_transactions_bonus_payment_id
  ON rune_transactions (payment_id)
  WHERE type = 'bonus' AND payment_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_rune_transactions_refund_once
  ON rune_transactions (refund_of_transaction_id)
  WHERE type = 'refund' AND refund_of_transaction_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_rune_transactions_spend_idempotency
  ON rune_transactions (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rune_transactions_result_session
  ON rune_transactions (result_session_id)
  WHERE result_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rune_transactions_unshown
  ON rune_transactions (user_id, created_at DESC)
  WHERE shown_receipt = FALSE
    AND type IN ('purchase', 'achievement', 'daily_bonus', 'bonus');

-- async_jobs is created earlier; attach spend FK once rune_transactions exists (101 / 077).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'async_jobs_charge_transaction_id_fkey'
  ) THEN
    ALTER TABLE async_jobs
      ADD CONSTRAINT async_jobs_charge_transaction_id_fkey
      FOREIGN KEY (charge_transaction_id)
      REFERENCES rune_transactions(id)
      ON DELETE SET NULL;
  END IF;
END $$;

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
  ('starter',  'РСЃРєР°С‚РµР»СЊ',    50,   99,    0,   false, 1),
  ('adept',    'РџРѕСЃРІСЏС‰С‘РЅРЅС‹Р№', 150,  249,   15,  true,  2),
  ('keeper',   'РҐСЂР°РЅРёС‚РµР»СЊ',   500,  699,   75,  false, 3),
  ('chosen',   'РР·Р±СЂР°РЅРЅС‹Р№',   1500, 1690,  300, false, 4)
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
  archive_tier TEXT NOT NULL DEFAULT 'hot'
    CHECK (archive_tier IN ('hot', 'warm', 'archived')),
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

CREATE INDEX IF NOT EXISTS idx_user_facts_entity
  ON user_facts (user_id, entity_key)
  WHERE entity_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_facts_archive
  ON user_facts (user_id, archive_tier, status);

CREATE INDEX IF NOT EXISTS idx_user_facts_core
  ON user_facts (user_id, predicate_key)
  WHERE status = 'active' AND archive_tier IN ('hot', 'warm');

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

CREATE TABLE IF NOT EXISTS user_memory_state_snapshots (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  state_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  supporting_fact_ids UUID[] NOT NULL DEFAULT '{}',
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  algorithm_version TEXT NOT NULL DEFAULT 'p1.1',
  PRIMARY KEY (user_id, domain)
);

CREATE TABLE IF NOT EXISTS user_memory_episodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  entity_key TEXT,
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'historical')),
  supporting_fact_ids UUID[] NOT NULL DEFAULT '{}',
  episode_key TEXT NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  algorithm_version TEXT NOT NULL DEFAULT 'p1.1',
  UNIQUE (user_id, episode_key)
);

CREATE INDEX IF NOT EXISTS idx_user_memory_episodes_user_domain
  ON user_memory_episodes (user_id, domain);

CREATE INDEX IF NOT EXISTS idx_user_memory_episodes_user_entity
  ON user_memory_episodes (user_id, entity_key)
  WHERE entity_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS user_memory_intelligence_dirty (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  dirty_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  processing_at TIMESTAMPTZ,
  generation INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_user_memory_intelligence_dirty_due
  ON user_memory_intelligence_dirty (dirty_at ASC)
  WHERE processing_at IS NULL;

CREATE TABLE IF NOT EXISTS user_memory_intelligence_metrics (
  metric TEXT PRIMARY KEY,
  value BIGINT NOT NULL DEFAULT 0
);

INSERT INTO user_memory_intelligence_metrics (metric, value)
VALUES ('rebuild_truncated', 0)
ON CONFLICT (metric) DO NOTHING;

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
  created_at TIMESTAMPTZ DEFAULT NOW(),
  idempotency_key TEXT
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications (user_id, created_at DESC) WHERE read = FALSE;
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_user_idempotency
  ON notifications (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- === РўРµС…РїРѕРґРґРµСЂР¶РєР° (РѕР±СЂР°С‰РµРЅРёСЏ РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№) ===
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
    "reminderHourMsk": 9
  }'::jsonb;

CREATE TABLE IF NOT EXISTS daily_reminder_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sent_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  channel    TEXT NOT NULL CHECK (channel IN ('in_app', 'email', 'telegram')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, sent_date, channel)
);

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

-- Guest Natal artifacts (pre-auth). Claim via hashed opaque cookie token.
CREATE TABLE IF NOT EXISTS natal_guest_charts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  birth_date DATE NOT NULL,
  birth_time TEXT,
  time_known BOOLEAN NOT NULL DEFAULT FALSE,
  place_label TEXT NOT NULL,
  birth_lat DOUBLE PRECISION NOT NULL,
  birth_lon DOUBLE PRECISION NOT NULL,
  birth_tzid TEXT NOT NULL,
  birth_fingerprint TEXT NOT NULL,
  chart_data JSONB NOT NULL,
  engine_version TEXT NOT NULL,
  claim_token_hash TEXT NOT NULL,
  claimed_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  claimed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT natal_guest_charts_claim_state CHECK (
    (claimed_user_id IS NULL AND claimed_at IS NULL)
    OR (claimed_user_id IS NOT NULL AND claimed_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_natal_guest_charts_claim_hash
  ON natal_guest_charts (claim_token_hash);

CREATE INDEX IF NOT EXISTS idx_natal_guest_charts_expires_unclaimed
  ON natal_guest_charts (expires_at)
  WHERE claimed_user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_natal_guest_charts_claimed_user
  ON natal_guest_charts (claimed_user_id)
  WHERE claimed_user_id IS NOT NULL;

-- Public landing reviews (migration 141 snapshot parity).
CREATE TABLE IF NOT EXISTS landing_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seed_key TEXT UNIQUE,
  source TEXT NOT NULL DEFAULT 'user',
  status TEXT NOT NULL DEFAULT 'pending',
  rating SMALLINT NOT NULL,
  author_name TEXT NOT NULL,
  city TEXT,
  product TEXT NOT NULL DEFAULT 'general',
  body TEXT NOT NULL,
  user_account_id UUID REFERENCES user_accounts(id) ON DELETE SET NULL,
  ip_hash TEXT,
  admin_note TEXT,
  moderated_by TEXT,
  moderated_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT landing_reviews_source_check
    CHECK (source IN ('seed', 'user')),
  CONSTRAINT landing_reviews_status_check
    CHECK (status IN ('pending', 'approved', 'rejected')),
  CONSTRAINT landing_reviews_rating_check
    CHECK (rating >= 1 AND rating <= 5),
  CONSTRAINT landing_reviews_product_check
    CHECK (product IN ('tarot', 'matrix', 'natal', 'hd', 'photo', 'general'))
);

CREATE INDEX IF NOT EXISTS idx_landing_reviews_public
  ON landing_reviews (status, published_at DESC, id DESC)
  WHERE status = 'approved';

CREATE INDEX IF NOT EXISTS idx_landing_reviews_moderation
  ON landing_reviews (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_landing_reviews_user
  ON landing_reviews (user_account_id, created_at DESC)
  WHERE user_account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_landing_reviews_ip
  ON landing_reviews (ip_hash, created_at DESC)
  WHERE source = 'user';

-- Guest Aura snapshots (pre-auth). Only the structured vision result is stored —
-- never the original face photo. Claim via hashed opaque cookie token.
CREATE TABLE IF NOT EXISTS aura_subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('self', 'other')),
  display_name TEXT NOT NULL,
  name_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_aura_subjects_one_self
  ON aura_subjects (user_id)
  WHERE kind = 'self';

CREATE UNIQUE INDEX IF NOT EXISTS idx_aura_subjects_other_name
  ON aura_subjects (user_id, name_key)
  WHERE kind = 'other';

CREATE INDEX IF NOT EXISTS idx_aura_subjects_user
  ON aura_subjects (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS aura_guest_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot JSONB NOT NULL,
  engine_version TEXT NOT NULL,
  claim_token_hash TEXT NOT NULL,
  photo_hash TEXT,
  subject_id UUID REFERENCES aura_subjects(id) ON DELETE SET NULL,
  subject_kind TEXT CHECK (subject_kind IN ('self', 'other')),
  subject_name TEXT,
  claimed_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  claimed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT aura_guest_snapshots_claim_state CHECK (
    (claimed_user_id IS NULL AND claimed_at IS NULL)
    OR (claimed_user_id IS NOT NULL AND claimed_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_aura_guest_snapshots_claim_hash
  ON aura_guest_snapshots (claim_token_hash);

CREATE INDEX IF NOT EXISTS idx_aura_guest_snapshots_expires_unclaimed
  ON aura_guest_snapshots (expires_at)
  WHERE claimed_user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_aura_guest_snapshots_claimed_user
  ON aura_guest_snapshots (claimed_user_id)
  WHERE claimed_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_aura_guest_snapshots_photo_hash
  ON aura_guest_snapshots (photo_hash)
  WHERE photo_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_aura_guest_snapshots_subject
  ON aura_guest_snapshots (subject_id)
  WHERE subject_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS palm_guest_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot JSONB NOT NULL,
  engine_version TEXT NOT NULL,
  claim_token_hash TEXT NOT NULL,
  photo_hash TEXT,
  claimed_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  claimed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT palm_guest_snapshots_claim_state CHECK (
    (claimed_user_id IS NULL AND claimed_at IS NULL)
    OR (claimed_user_id IS NOT NULL AND claimed_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_palm_guest_snapshots_claim_hash
  ON palm_guest_snapshots (claim_token_hash);

CREATE INDEX IF NOT EXISTS idx_palm_guest_snapshots_expires_unclaimed
  ON palm_guest_snapshots (expires_at)
  WHERE claimed_user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_palm_guest_snapshots_claimed_user
  ON palm_guest_snapshots (claimed_user_id)
  WHERE claimed_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_palm_guest_snapshots_photo_hash
  ON palm_guest_snapshots (photo_hash)
  WHERE photo_hash IS NOT NULL;

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

CREATE TABLE IF NOT EXISTS matrix_subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('self', 'child', 'partner', 'other')),
  display_name TEXT,
  birth_date DATE NOT NULL,
  birth_time TIME,
  birth_city TEXT,
  birth_lat DOUBLE PRECISION,
  birth_lon DOUBLE PRECISION,
  as_of_date DATE,
  calculation_version TEXT,
  matrix_snapshot JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_matrix_subjects_self
  ON matrix_subjects (user_id) WHERE kind = 'self';

CREATE INDEX IF NOT EXISTS idx_matrix_subjects_user
  ON matrix_subjects (user_id, created_at DESC);

-- Guest Matrix pending identity (pre-auth). Claim via hashed opaque cookie token.
CREATE TABLE IF NOT EXISTS matrix_guest_pending (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  birth_date DATE NOT NULL,
  display_name TEXT,
  as_of_date DATE NOT NULL,
  calculation_version TEXT NOT NULL,
  methodology_id TEXT NOT NULL DEFAULT 'zovus-matrix-legacy',
  matrix_snapshot JSONB NOT NULL,
  claim_token_hash TEXT NOT NULL,
  claimed_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  claimed_subject_id UUID REFERENCES matrix_subjects(id) ON DELETE SET NULL,
  claimed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT matrix_guest_pending_claim_state CHECK (
    (claimed_user_id IS NULL AND claimed_at IS NULL AND claimed_subject_id IS NULL)
    OR (claimed_user_id IS NOT NULL AND claimed_at IS NOT NULL AND claimed_subject_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_matrix_guest_pending_claim_hash
  ON matrix_guest_pending (claim_token_hash);

CREATE INDEX IF NOT EXISTS idx_matrix_guest_pending_expires_unclaimed
  ON matrix_guest_pending (expires_at)
  WHERE claimed_user_id IS NULL;

-- Guest Matrix pair compatibility (pre-auth). Claim via hashed opaque cookie token.
CREATE TABLE IF NOT EXISTS matrix_pair_guest_pending (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date_a DATE NOT NULL,
  date_b DATE NOT NULL,
  name_a TEXT,
  name_b TEXT,
  calculation_version TEXT NOT NULL,
  methodology_id TEXT NOT NULL DEFAULT 'zovus-matrix-legacy',
  compat_snapshot JSONB NOT NULL,
  claim_token_hash TEXT NOT NULL,
  claimed_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  claimed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT matrix_pair_guest_pending_claim_state CHECK (
    (claimed_user_id IS NULL AND claimed_at IS NULL)
    OR (claimed_user_id IS NOT NULL AND claimed_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_matrix_pair_guest_pending_claim_hash
  ON matrix_pair_guest_pending (claim_token_hash);

CREATE INDEX IF NOT EXISTS idx_matrix_pair_guest_pending_expires_unclaimed
  ON matrix_pair_guest_pending (expires_at)
  WHERE claimed_user_id IS NULL;

CREATE TABLE IF NOT EXISTS numerology_report_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tool_id TEXT NOT NULL,
  subject_id UUID NOT NULL REFERENCES matrix_subjects(id) ON DELETE CASCADE,
  birth_date DATE NOT NULL,
  calculation_version TEXT NOT NULL DEFAULT 'matrix-v1',
  methodology_id TEXT NOT NULL DEFAULT 'zovus-matrix-legacy',
  renderer_version TEXT,
  as_of_date DATE,
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
    subject_id,
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

CREATE INDEX IF NOT EXISTS idx_numerology_report_history_subject
  ON numerology_report_history(subject_id);

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

-- === Synced from migrations 083пїЅ090 (fresh install parity) ===


-- from scripts/migrations/083_migrate_partner_leads.sql

-- Partnership inbound leads (separate from support tickets).

CREATE TABLE IF NOT EXISTS partner_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  company TEXT NOT NULL,
  website TEXT,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  admin_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT partner_leads_status_check
    CHECK (status IN ('new', 'in_progress', 'done', 'spam'))
);

CREATE INDEX IF NOT EXISTS idx_partner_leads_created
  ON partner_leads (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_partner_leads_status_created
  ON partner_leads (status, created_at DESC);


-- from scripts/migrations/084_migrate_ads_schema.sql

-- Ads Autopilot isolated schema. Rollback: DROP SCHEMA ads CASCADE;
CREATE SCHEMA IF NOT EXISTS ads;

CREATE TABLE IF NOT EXISTS ads.click (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  yclid TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,
  landing_path TEXT NOT NULL DEFAULT '/',
  visitor_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ads_click_created_at_idx ON ads.click (created_at);
CREATE INDEX IF NOT EXISTS ads_click_yclid_idx ON ads.click (yclid) WHERE yclid IS NOT NULL;

CREATE TABLE IF NOT EXISTS ads.click_user (
  click_id UUID NOT NULL REFERENCES ads.click(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (click_id, user_id),
  UNIQUE (user_id)
);

CREATE TABLE IF NOT EXISTS ads.conversion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  click_id UUID REFERENCES ads.click(id) ON DELETE SET NULL,
  visitor_hash TEXT,
  type TEXT NOT NULL CHECK (type IN (
    'deck_view','card_pick','spread_submit','teaser_view','registration','claim',
    'first_rune_spend','first_payment','repeat_payment'
  )),
  amount_rub NUMERIC(12,2),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  uploaded_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS ads_conversion_user_type_uidx
  ON ads.conversion (user_id, type)
  WHERE user_id IS NOT NULL AND type IN (
    'registration','claim','first_rune_spend','first_payment'
  );
-- timestamptz::date is not IMMUTABLE (session TZ). UTC wrapper is required for the index.
CREATE OR REPLACE FUNCTION ads.utc_date(ts timestamptz)
RETURNS date
LANGUAGE sql
IMMUTABLE
AS $$ SELECT ($1 AT TIME ZONE 'UTC')::date $$;

CREATE UNIQUE INDEX IF NOT EXISTS ads_conversion_micro_day_uidx
  ON ads.conversion (click_id, type, ads.utc_date(occurred_at))
  WHERE click_id IS NOT NULL AND type IN (
    'deck_view','card_pick','spread_submit','teaser_view'
  );
CREATE INDEX IF NOT EXISTS ads_conversion_occurred_at_idx ON ads.conversion (occurred_at);

CREATE TABLE IF NOT EXISTS ads.daily_stats (
  date DATE NOT NULL,
  campaign_id BIGINT NOT NULL DEFAULT 0,
  adgroup_id BIGINT NOT NULL DEFAULT 0,
  criterion_id BIGINT NOT NULL DEFAULT 0,
  impressions BIGINT NOT NULL DEFAULT 0,
  clicks BIGINT NOT NULL DEFAULT 0,
  cost_rub NUMERIC(12,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (date, campaign_id, adgroup_id, criterion_id)
);

CREATE TABLE IF NOT EXISTS ads.entity_snapshot (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  level TEXT NOT NULL CHECK (level IN ('campaign','adgroup','ad','keyword')),
  external_id TEXT NOT NULL,
  parent_id TEXT,
  name TEXT,
  status TEXT,
  moderation_status TEXT,
  daily_budget_rub NUMERIC(12,2),
  bid_rub NUMERIC(12,2),
  strategy_mode TEXT,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (level, external_id)
);

CREATE TABLE IF NOT EXISTS ads.keyword_candidate (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phrase TEXT NOT NULL,
  normalized TEXT NOT NULL,
  source TEXT NOT NULL,
  cluster_key TEXT,
  landing_path TEXT,
  freq_exact INTEGER,
  freq_phrase INTEGER,
  forecast_cpc_rub NUMERIC(12,2),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','pushed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ads_keyword_candidate_norm_idx ON ads.keyword_candidate (normalized);

CREATE TABLE IF NOT EXISTS ads.keyword_stat (
  phrase TEXT NOT NULL,
  region INTEGER NOT NULL DEFAULT 225,
  freq_exact INTEGER,
  freq_phrase INTEGER,
  seasonality_json JSONB,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (phrase, region)
);

CREATE TABLE IF NOT EXISTS ads.negative_keyword (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phrase TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'account'
    CHECK (scope IN ('account','campaign','adgroup')),
  scope_id TEXT,
  reason TEXT,
  auto BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ads.search_query (
  date DATE NOT NULL,
  campaign_id BIGINT NOT NULL DEFAULT 0,
  adgroup_id BIGINT NOT NULL DEFAULT 0,
  query TEXT NOT NULL,
  matched_keyword TEXT,
  clicks INTEGER NOT NULL DEFAULT 0,
  cost_rub NUMERIC(12,2) NOT NULL DEFAULT 0,
  deck_views INTEGER NOT NULL DEFAULT 0,
  spread_submits INTEGER NOT NULL DEFAULT 0,
  registrations INTEGER NOT NULL DEFAULT 0,
  decision TEXT,
  decided_at TIMESTAMPTZ,
  PRIMARY KEY (date, campaign_id, adgroup_id, query)
);

CREATE TABLE IF NOT EXISTS ads.funnel_daily (
  date DATE NOT NULL,
  campaign_id BIGINT NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  deck_views INTEGER NOT NULL DEFAULT 0,
  spread_submits INTEGER NOT NULL DEFAULT 0,
  teaser_views INTEGER NOT NULL DEFAULT 0,
  registrations INTEGER NOT NULL DEFAULT 0,
  claims INTEGER NOT NULL DEFAULT 0,
  first_payments INTEGER NOT NULL DEFAULT 0,
  revenue_rub NUMERIC(12,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (date, campaign_id)
);

CREATE TABLE IF NOT EXISTS ads.economics_snapshot (
  date DATE NOT NULL,
  cohort_days INTEGER NOT NULL DEFAULT 30,
  registrations INTEGER NOT NULL DEFAULT 0,
  payers INTEGER NOT NULL DEFAULT 0,
  revenue_rub NUMERIC(12,2) NOT NULL DEFAULT 0,
  arpu_per_registration_rub NUMERIC(12,2),
  cr_reg_to_payer NUMERIC(12,6),
  avg_check_rub NUMERIC(12,2),
  max_allowed_cpa_reg_rub NUMERIC(12,2),
  sample_size INTEGER NOT NULL DEFAULT 0,
  confidence TEXT NOT NULL DEFAULT 'low'
    CHECK (confidence IN ('low','medium','high')),
  PRIMARY KEY (date, cohort_days)
);

CREATE TABLE IF NOT EXISTS ads.rule_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule TEXT NOT NULL,
  target_level TEXT,
  target_id TEXT,
  decision TEXT NOT NULL,
  reason_json JSONB,
  applied BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ads.approval_request (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN (
    'budget_increase','bid_increase','global_cap_increase','new_landing',
    'new_cluster','mode_switch','optimization_goal_switch'
  )),
  target_level TEXT,
  target_id TEXT,
  current_value JSONB,
  proposed_value JSONB,
  rationale_json JSONB,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  decided_by UUID,
  decided_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS ads.action_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  payload_json JSONB,
  result_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ads.config (
  key TEXT PRIMARY KEY,
  value_json JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT
);

CREATE TABLE IF NOT EXISTS ads.alert (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  severity TEXT NOT NULL CHECK (severity IN ('info','warning','critical')),
  code TEXT NOT NULL,
  message TEXT NOT NULL,
  payload_json JSONB,
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Feature flags + discovery budget seed (source of truth also in config/ads/budget.yaml)
INSERT INTO ads.config (key, value_json, updated_by) VALUES
  ('ads.enabled', 'false'::jsonb, 'migration084'),
  ('ads.rules.enabled', 'false'::jsonb, 'migration084'),
  ('ads.autopilot.write', 'false'::jsonb, 'migration084'),
  ('budget', '{
    "mode":"discovery",
    "target_romi":3,
    "discovery_daily_cap_rub":300,
    "discovery_total_budget_rub":9000,
    "discovery_target_cpa_reg_rub":150,
    "discovery_max_cpa_reg_rub":400,
    "discovery_target_registrations":100,
    "discovery_freq_min":100,
    "discovery_freq_max":5000,
    "global_daily_cap_rub":300,
    "campaign_daily_budget_rub":300,
    "negative_min_clicks":30,
    "rules_window_days":3,
    "min_clicks_per_entity":30,
    "approval_ttl_hours":48,
    "ctr_min":0.005,
    "cpa_start_kill_rub":100,
    "cpa_reg_kill_rub":250,
    "cpa_rune_kill_rub":500
  }'::jsonb, 'migration084')
ON CONFLICT (key) DO NOTHING;


-- from scripts/migrations/085_migrate_ads_source_snapshots.sql

-- Ads Autopilot: cached read-only snapshots from Direct / Metrika / Webmaster.
-- No FK to public. Rollback pieces: DROP TABLE ads.source_snapshot, ads.metrika_goal_stat, ads.webmaster_query_daily;

CREATE TABLE IF NOT EXISTS ads.source_snapshot (
  source TEXT PRIMARY KEY CHECK (source IN ('direct','metrika','webmaster','health')),
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ok BOOLEAN NOT NULL DEFAULT FALSE,
  error TEXT,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS ads.metrika_goal_stat (
  date DATE NOT NULL,
  goal_id BIGINT NOT NULL,
  goal_name TEXT,
  reaches INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (date, goal_id)
);
CREATE INDEX IF NOT EXISTS ads_metrika_goal_stat_date_idx ON ads.metrika_goal_stat (date);

CREATE TABLE IF NOT EXISTS ads.webmaster_query_daily (
  date DATE NOT NULL,
  query TEXT NOT NULL,
  clicks INTEGER NOT NULL DEFAULT 0,
  shows INTEGER NOT NULL DEFAULT 0,
  position NUMERIC(8,2),
  PRIMARY KEY (date, query)
);
CREATE INDEX IF NOT EXISTS ads_webmaster_query_daily_date_idx ON ads.webmaster_query_daily (date);

-- Observe mode: admin UI + source sync without spending (beacon still needs ads.enabled)
INSERT INTO ads.config (key, value_json, updated_by) VALUES
  ('ads.observe', 'true'::jsonb, 'migration085')
ON CONFLICT (key) DO NOTHING;


-- from scripts/migrations/086_migrate_ads_budget_guards.sql

-- Ads Autopilot budget protection layer (B1вЂ“B7).
-- Rollback: DROP TABLE ads.budget_ledger; DROP TABLE ads.health_check;
--           DELETE FROM ads.config WHERE key LIKE 'hard_%' OR key LIKE 'budget_warn%'
--             OR key LIKE 'stats_stale%' OR key LIKE 'discovery_max_days%'
--             OR key LIKE 'landing_timeout%' OR key LIKE 'guard.%';
--           ALTER TABLE ads.entity_snapshot DROP COLUMN IF EXISTS pause_reason;

CREATE TABLE IF NOT EXISTS ads.budget_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  campaign_id BIGINT NOT NULL DEFAULT 0,
  cost_rub NUMERIC(12,2) NOT NULL DEFAULT 0,
  source TEXT NOT NULL CHECK (source IN ('direct_report','realtime_estimate')),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ads_budget_ledger_date_idx ON ads.budget_ledger (date);
CREATE INDEX IF NOT EXISTS ads_budget_ledger_recorded_idx ON ads.budget_ledger (recorded_at DESC);

CREATE TABLE IF NOT EXISTS ads.health_check (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('landing','api_direct','api_metrika','cron_freshness')),
  status_code INTEGER,
  latency_ms INTEGER,
  ok BOOLEAN NOT NULL DEFAULT FALSE,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  detail_json JSONB
);
CREATE INDEX IF NOT EXISTS ads_health_check_kind_checked_idx
  ON ads.health_check (kind, checked_at DESC);
CREATE INDEX IF NOT EXISTS ads_health_check_target_idx ON ads.health_check (target);

ALTER TABLE ads.entity_snapshot
  ADD COLUMN IF NOT EXISTS pause_reason TEXT;

INSERT INTO ads.config (key, value_json, updated_by) VALUES
  ('hard_total_budget_rub', '9000'::jsonb, 'migration086'),
  ('budget_warn_pct', '90'::jsonb, 'migration086'),
  ('stats_stale_warn_hours', '24'::jsonb, 'migration086'),
  ('stats_stale_stop_hours', '48'::jsonb, 'migration086'),
  ('discovery_max_days', '45'::jsonb, 'migration086'),
  ('landing_timeout_ms', '5000'::jsonb, 'migration086'),
  ('guard.sync_stats_fail_streak', '0'::jsonb, 'migration086'),
  ('guard.landing_paused_ids', '[]'::jsonb, 'migration086'),
  ('guard.cpa_paused_ids', '[]'::jsonb, 'migration086'),
  ('guard.protection_status', '{}'::jsonb, 'migration086')
ON CONFLICT (key) DO NOTHING;


-- from scripts/migrations/087_migrate_ads_wordstat_source.sql

-- Allow Wordstat snapshots in ads.source_snapshot.
-- Rollback: recreate check without 'wordstat'.

ALTER TABLE ads.source_snapshot DROP CONSTRAINT IF EXISTS source_snapshot_source_check;
ALTER TABLE ads.source_snapshot
  ADD CONSTRAINT source_snapshot_source_check
  CHECK (source IN ('direct','metrika','webmaster','health','wordstat'));


-- from scripts/migrations/088_migrate_ads_wordstat_history.sql

-- Wordstat run history + per-phrase points (append-only).
-- Rollback: DROP TABLE ads.wordstat_phrase_point; DROP TABLE ads.wordstat_run;

CREATE TABLE IF NOT EXISTS ads.wordstat_run (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ok BOOLEAN NOT NULL DEFAULT FALSE,
  error TEXT,
  region INTEGER NOT NULL DEFAULT 225,
  seeds TEXT[] NOT NULL DEFAULT '{}',
  phrase_count INTEGER NOT NULL DEFAULT 0,
  in_theme_count INTEGER NOT NULL DEFAULT 0,
  in_band_count INTEGER NOT NULL DEFAULT 0,
  new_count INTEGER NOT NULL DEFAULT 0,
  risen_count INTEGER NOT NULL DEFAULT 0,
  fallen_count INTEGER NOT NULL DEFAULT 0,
  lost_count INTEGER NOT NULL DEFAULT 0,
  median_shows_theme INTEGER,
  max_shows INTEGER NOT NULL DEFAULT 0,
  diff_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  meta_json JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS ads_wordstat_run_fetched_idx
  ON ads.wordstat_run (fetched_at DESC);

CREATE INDEX IF NOT EXISTS ads_wordstat_run_ok_fetched_idx
  ON ads.wordstat_run (ok, fetched_at DESC);

CREATE TABLE IF NOT EXISTS ads.wordstat_phrase_point (
  run_id UUID NOT NULL REFERENCES ads.wordstat_run (id) ON DELETE CASCADE,
  phrase_norm TEXT NOT NULL,
  phrase TEXT NOT NULL,
  shows INTEGER NOT NULL,
  seeds TEXT[] NOT NULL DEFAULT '{}',
  bucket TEXT NOT NULL DEFAULT 'with'
    CHECK (bucket IN ('with', 'also')),
  in_theme BOOLEAN NOT NULL DEFAULT FALSE,
  in_band BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (run_id, phrase_norm)
);

CREATE INDEX IF NOT EXISTS ads_wordstat_phrase_point_theme_idx
  ON ads.wordstat_phrase_point (run_id, in_theme, shows DESC);


-- from scripts/migrations/090_migrate_telegram_auth_bridge.sql

-- Telegram login/link via bot deep-link (BotFather Login Widget domain optional).
CREATE TABLE IF NOT EXISTS telegram_auth_challenges (
  token TEXT PRIMARY KEY,
  purpose TEXT NOT NULL CHECK (purpose IN ('login', 'register', 'link')),
  user_account_id UUID NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
  accepted_terms BOOLEAN NOT NULL DEFAULT FALSE,
  age_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  marketing_consent BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'consumed', 'expired')),
  telegram_user_id BIGINT NULL,
  telegram_username TEXT NULL,
  telegram_first_name TEXT NULL,
  telegram_photo_url TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  confirmed_at TIMESTAMPTZ NULL,
  consumed_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_telegram_auth_challenges_status_expires
  ON telegram_auth_challenges (status, expires_at);

CREATE INDEX IF NOT EXISTS idx_telegram_auth_challenges_account
  ON telegram_auth_challenges (user_account_id)
  WHERE user_account_id IS NOT NULL;


CREATE INDEX IF NOT EXISTS idx_oauth_transactions_link_account
  ON oauth_transactions(link_account_id)
  WHERE link_account_id IS NOT NULL;

-- ── Human Design (migrations 094–106; bootstrap snapshot) ──
CREATE TABLE IF NOT EXISTS hd_charts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  guest_id TEXT,
  birth_date DATE NOT NULL,
  birth_time TEXT,
  time_unknown BOOLEAN NOT NULL DEFAULT FALSE,
  timezone TEXT NOT NULL,
  place_name TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lon DOUBLE PRECISION NOT NULL,
  fingerprint TEXT NOT NULL,
  chart JSONB NOT NULL,
  engine_version TEXT NOT NULL,
  subject_kind TEXT NOT NULL DEFAULT 'self',
  subject_name TEXT,
  relation_to_self TEXT CHECK (
    relation_to_self IS NULL
    OR relation_to_self IN ('partner', 'friend', 'child', 'colleague', 'business')
  ),
  -- Binary gender for other-person charts (LLM Russian address). NULL for self.
  gender TEXT CHECK (gender IS NULL OR gender IN ('male', 'female')),
  -- SHA-256 hex of `hd-claim:v1:${raw}` (migration 109 hashed legacy plaintext).
  claim_token TEXT,
  owner_key UUID GENERATED ALWAYS AS (COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid)) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS hd_charts_fingerprint_owner_key ON hd_charts (fingerprint, owner_key);
CREATE INDEX IF NOT EXISTS idx_hd_charts_user ON hd_charts(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_hd_charts_guest ON hd_charts(guest_id) WHERE guest_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_hd_charts_claim_token ON hd_charts (claim_token) WHERE claim_token IS NOT NULL;

CREATE TABLE IF NOT EXISTS hd_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chart_id UUID NOT NULL REFERENCES hd_charts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done','error','needs_regeneration')),
  report_text TEXT,
  model TEXT,
  transaction_id UUID,
  error TEXT,
  quality_findings JSONB,
  quality_updated_at TIMESTAMPTZ,
  cost_rub NUMERIC(12, 4),
  llm_calls INTEGER,
  token_usage JSONB,
  package_id TEXT NOT NULL DEFAULT 'max' CHECK (package_id IN ('depth', 'max')),
  included_asks_remaining INTEGER NOT NULL DEFAULT 5,
  report_tone TEXT NOT NULL DEFAULT 'personal' CHECK (report_tone IN ('personal', 'child', 'work')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_hd_reports_chart ON hd_reports(chart_id);
CREATE INDEX IF NOT EXISTS idx_hd_reports_user ON hd_reports(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hd_reports_needs_regen
  ON hd_reports (created_at DESC)
  WHERE status = 'needs_regeneration';

CREATE TABLE IF NOT EXISTS hd_report_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES hd_reports(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hd_report_messages_report ON hd_report_messages(report_id, created_at);

CREATE TABLE IF NOT EXISTS hd_composite_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  base_chart_id UUID NOT NULL REFERENCES hd_charts(id) ON DELETE CASCADE,
  partner_chart_id UUID NOT NULL REFERENCES hd_charts(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'error')),
  report_text TEXT,
  model TEXT,
  transaction_id TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS hd_composite_reports_pair_user_key
  ON hd_composite_reports (base_chart_id, partner_chart_id, user_id);
CREATE INDEX IF NOT EXISTS hd_composite_reports_user_idx ON hd_composite_reports (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS hd_center_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chart_id UUID NOT NULL REFERENCES hd_charts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  center TEXT NOT NULL,
  insight_text TEXT NOT NULL,
  transaction_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS hd_center_insights_owner_key
  ON hd_center_insights (chart_id, user_id, center);
