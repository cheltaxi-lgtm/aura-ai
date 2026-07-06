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
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed')),
  awaiting_context BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE INDEX IF NOT EXISTS idx_sessions_user_character
  ON sessions (user_id, character_key, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_sessions_active
  ON sessions (user_id, character_key, status, updated_at DESC);

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
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  profile_user_id UUID REFERENCES users(id),
  is_unlimited BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_accounts_profile_user_id_unique UNIQUE (profile_user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_accounts_unlimited ON user_accounts(is_unlimited)
  WHERE is_unlimited = TRUE;

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
  ('runes', '{"enabled":true,"rubPerRune":2,"starterRunes":30,"freeQuestions":2,"costs":{"QUESTION":10,"VISION_ANALYSIS":30,"READING":15,"DESTINY_CARD":20,"JOINT_READING":25,"DAILY_AMULET":5,"FINAL_REPORT":30}}')
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
  shown_receipt   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rune_transactions_user
  ON rune_transactions (user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rune_transactions_payment_purchase
  ON rune_transactions (payment_id)
  WHERE type = 'purchase' AND payment_id IS NOT NULL;

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
  session_id      UUID REFERENCES sessions(id) ON DELETE SET NULL,
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
    CHECK (ritual_type IN ('love','money','protection','luck','release')),
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
  rune_charged          BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at            TIMESTAMPTZ NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_joint_readings_token ON joint_readings (token);

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
