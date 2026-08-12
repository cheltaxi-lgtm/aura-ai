PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS bot_users (
  telegram_user_id INTEGER PRIMARY KEY,
  chat_id INTEGER NOT NULL,
  username TEXT,
  first_name TEXT,
  language_code TEXT,
  age_confirmed_at TEXT,
  terms_accepted_at TEXT,
  privacy_accepted_at TEXT,
  consent_source TEXT,
  ref TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  master_pref TEXT DEFAULT 'veronika',
  reminder_mode TEXT NOT NULL DEFAULT 'off',
  reminder_hour INTEGER,
  streak_days INTEGER NOT NULL DEFAULT 0,
  streak_last_date TEXT,
  blocked_at TEXT,
  banned_at TEXT,
  zovus_user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bot_guest_sessions (
  id TEXT PRIMARY KEY,
  telegram_user_id INTEGER NOT NULL,
  question TEXT NOT NULL,
  cards TEXT NOT NULL,
  master TEXT NOT NULL DEFAULT 'veronika',
  system TEXT NOT NULL DEFAULT 'tarot-veronika',
  spread_id TEXT NOT NULL DEFAULT 'triplet',
  teaser_text TEXT,
  teaser_prompt_version TEXT,
  teaser_model TEXT,
  session_token_hash TEXT NOT NULL UNIQUE,
  fingerprint TEXT,
  question_source TEXT,
  source TEXT NOT NULL DEFAULT 'telegram',
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  claimed_at TEXT,
  FOREIGN KEY (telegram_user_id) REFERENCES bot_users(telegram_user_id)
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_created
  ON bot_guest_sessions(telegram_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS bot_flow_state (
  telegram_user_id INTEGER PRIMARY KEY,
  flow TEXT NOT NULL,
  step TEXT NOT NULL,
  data TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL,
  FOREIGN KEY (telegram_user_id) REFERENCES bot_users(telegram_user_id)
);

CREATE TABLE IF NOT EXISTS bot_day_cards (
  telegram_user_id INTEGER NOT NULL,
  day TEXT NOT NULL,
  card TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (telegram_user_id, day),
  FOREIGN KEY (telegram_user_id) REFERENCES bot_users(telegram_user_id)
);

CREATE TABLE IF NOT EXISTS bot_processed_updates (
  update_id INTEGER PRIMARY KEY,
  processed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bot_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  telegram_user_id INTEGER,
  payload TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_name_created
  ON bot_events(name, created_at DESC);

-- hasUserEvent / reminder dedupe lookups go by (user, name).
CREATE INDEX IF NOT EXISTS idx_events_user_name
  ON bot_events(telegram_user_id, name);

CREATE TABLE IF NOT EXISTS bot_flags (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bot_copy (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bot_admin_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  actor TEXT NOT NULL DEFAULT 'cli',
  detail TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bot_jobs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bot_reminder_log (
  telegram_user_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  day TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (telegram_user_id, kind, day)
);
