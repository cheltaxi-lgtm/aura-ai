-- Aura — полная схема PostgreSQL (2026)
-- Монтируется в Docker через docker-compose.yml

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

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
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- === Чат ===
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  character_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id);

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

-- === Аккаунты (регистрация / ЛК) ===
CREATE TABLE IF NOT EXISTS user_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  profile_user_id UUID REFERENCES users(id),
  is_unlimited BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
  'Марина',
  'Таро · Расклады · Ритуалы',
  80,
  'Говоришь тепло, образно, с отсылками к лунным циклам.',
  '🌹'
) ON CONFLICT (slug) DO NOTHING;

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
  ('features', '{"maintenanceMode":false,"registrationEnabled":true,"recaptchaEnabled":false,"freeQuestionLimit":2,"demoPayments":true}'),
  ('prompts', '{"globalPrefix":"Ты — мастер эзотерической платформы Aura. Отвечай на русском."}'),
  ('tts', '{"enabled":false,"model":"google/gemini-3.1-flash-tts-preview","fallbackModel":"hexgrad/kokoro-82m","fallbackEnabled":true,"chunkChars":4000}'),
  ('visual', '{"enabled":true,"model":"bytedance-seed/seedream-4.5","fallbackModel":"google/gemini-3.1-flash-image-preview","fallbackEnabled":true,"defaultQuality":"standard","stylePrefix":"Aura mystical esoteric platform, cinematic lighting, rich colors, highly detailed digital art, no watermark, no UI elements","scenes":{"zodiac_avatar":true,"tarot_atmosphere":true,"destiny_card":true,"scene_illustration":true,"final_report":true}}')
ON CONFLICT (key) DO NOTHING;

-- === Runes (internal currency) ===
CREATE TABLE IF NOT EXISTS rune_transactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type            TEXT NOT NULL CHECK (type IN ('purchase', 'spend', 'bonus', 'refund')),
  amount          INTEGER NOT NULL,
  balance_after   INTEGER NOT NULL,
  description     TEXT NOT NULL,
  action_type     TEXT,
  payment_id      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rune_transactions_user
  ON rune_transactions (user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rune_transactions_payment_purchase
  ON rune_transactions (payment_id)
  WHERE type = 'purchase' AND payment_id IS NOT NULL;

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
