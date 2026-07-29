/**
 * Declarative expected schema for the bot SQLite DB.
 * ensureCriticalColumns() and audit-bot assert against this list.
 */

export type ExpectedColumn = {
  name: string;
  /** SQLite type fragment used in ALTER TABLE ADD COLUMN */
  sqlType: string;
  nullable: boolean;
};

export type ExpectedTable = {
  name: string;
  /** Optional CREATE TABLE IF NOT EXISTS for tables introduced after baseline */
  createSql?: string;
  columns: ExpectedColumn[];
};

/** Additive columns from migration 002 (+ 003 timezone fix). */
const BOT_USERS_PREMIUM: ExpectedColumn[] = [
  { name: "timezone_offset_minutes", sqlType: "INTEGER", nullable: true },
  { name: "timezone_source", sqlType: "TEXT", nullable: true },
  { name: "consent_version", sqlType: "TEXT", nullable: true },
  { name: "voice_mode", sqlType: "TEXT", nullable: true },
  { name: "ref_code", sqlType: "TEXT", nullable: true },
  { name: "invited_by", sqlType: "INTEGER", nullable: true },
  { name: "referral_count", sqlType: "INTEGER NOT NULL DEFAULT 0", nullable: false },
  { name: "bonus_spreads", sqlType: "INTEGER NOT NULL DEFAULT 0", nullable: false },
  { name: "last_active_at", sqlType: "TEXT", nullable: true },
  { name: "streak_grace_used", sqlType: "INTEGER NOT NULL DEFAULT 0", nullable: false },
  { name: "unsubscribed_at", sqlType: "TEXT", nullable: true },
  { name: "timezone_asked_at", sqlType: "TEXT", nullable: true },
  { name: "link_welcomed_at", sqlType: "TEXT", nullable: true },
];

const BOT_SESSIONS_PREMIUM: ExpectedColumn[] = [
  { name: "deck_id", sqlType: "TEXT", nullable: true },
  { name: "teaser_seed", sqlType: "TEXT", nullable: true },
  { name: "collage_cache_key", sqlType: "TEXT", nullable: true },
  { name: "plain_token_prefix", sqlType: "TEXT", nullable: true },
  { name: "expired_at", sqlType: "TEXT", nullable: true },
  { name: "quota_day", sqlType: "TEXT", nullable: true },
  { name: "status", sqlType: "TEXT", nullable: true },
  { name: "teaser_delivered_at", sqlType: "TEXT", nullable: true },
  { name: "schema_version", sqlType: "INTEGER", nullable: true },
  { name: "claimable", sqlType: "INTEGER", nullable: true },
];

export const EXPECTED_TABLES: ExpectedTable[] = [
  {
    name: "bot_users",
    columns: [
      { name: "telegram_user_id", sqlType: "INTEGER", nullable: true },
      { name: "chat_id", sqlType: "INTEGER NOT NULL", nullable: false },
      { name: "username", sqlType: "TEXT", nullable: true },
      { name: "first_name", sqlType: "TEXT", nullable: true },
      { name: "language_code", sqlType: "TEXT", nullable: true },
      { name: "age_confirmed_at", sqlType: "TEXT", nullable: true },
      { name: "terms_accepted_at", sqlType: "TEXT", nullable: true },
      { name: "privacy_accepted_at", sqlType: "TEXT", nullable: true },
      { name: "consent_source", sqlType: "TEXT", nullable: true },
      { name: "ref", sqlType: "TEXT", nullable: true },
      { name: "utm_source", sqlType: "TEXT", nullable: true },
      { name: "utm_medium", sqlType: "TEXT", nullable: true },
      { name: "utm_campaign", sqlType: "TEXT", nullable: true },
      { name: "utm_content", sqlType: "TEXT", nullable: true },
      { name: "master_pref", sqlType: "TEXT", nullable: true },
      { name: "reminder_mode", sqlType: "TEXT NOT NULL DEFAULT 'off'", nullable: false },
      { name: "reminder_hour", sqlType: "INTEGER", nullable: true },
      { name: "streak_days", sqlType: "INTEGER NOT NULL DEFAULT 0", nullable: false },
      { name: "streak_last_date", sqlType: "TEXT", nullable: true },
      { name: "blocked_at", sqlType: "TEXT", nullable: true },
      { name: "banned_at", sqlType: "TEXT", nullable: true },
      { name: "zovus_user_id", sqlType: "TEXT", nullable: true },
      { name: "created_at", sqlType: "TEXT NOT NULL", nullable: false },
      { name: "updated_at", sqlType: "TEXT NOT NULL", nullable: false },
      ...BOT_USERS_PREMIUM,
    ],
  },
  {
    name: "bot_guest_sessions",
    columns: [
      { name: "id", sqlType: "TEXT", nullable: true },
      { name: "telegram_user_id", sqlType: "INTEGER NOT NULL", nullable: false },
      { name: "question", sqlType: "TEXT NOT NULL", nullable: false },
      { name: "cards", sqlType: "TEXT NOT NULL", nullable: false },
      { name: "master", sqlType: "TEXT NOT NULL", nullable: false },
      { name: "system", sqlType: "TEXT NOT NULL", nullable: false },
      { name: "spread_id", sqlType: "TEXT NOT NULL", nullable: false },
      { name: "teaser_text", sqlType: "TEXT", nullable: true },
      { name: "teaser_prompt_version", sqlType: "TEXT", nullable: true },
      { name: "teaser_model", sqlType: "TEXT", nullable: true },
      { name: "session_token_hash", sqlType: "TEXT NOT NULL", nullable: false },
      { name: "fingerprint", sqlType: "TEXT", nullable: true },
      { name: "question_source", sqlType: "TEXT", nullable: true },
      { name: "source", sqlType: "TEXT NOT NULL", nullable: false },
      { name: "created_at", sqlType: "TEXT NOT NULL", nullable: false },
      { name: "expires_at", sqlType: "TEXT NOT NULL", nullable: false },
      { name: "claimed_at", sqlType: "TEXT", nullable: true },
      ...BOT_SESSIONS_PREMIUM,
    ],
  },
  {
    name: "bot_llm_usage",
    createSql: `CREATE TABLE IF NOT EXISTS bot_llm_usage (
      telegram_user_id INTEGER NOT NULL,
      day TEXT NOT NULL,
      calls INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (telegram_user_id, day)
    )`,
    columns: [
      { name: "telegram_user_id", sqlType: "INTEGER NOT NULL", nullable: false },
      { name: "day", sqlType: "TEXT NOT NULL", nullable: false },
      { name: "calls", sqlType: "INTEGER NOT NULL DEFAULT 0", nullable: false },
    ],
  },
  {
    name: "bot_tts_usage",
    createSql: `CREATE TABLE IF NOT EXISTS bot_tts_usage (
      telegram_user_id INTEGER NOT NULL,
      day TEXT NOT NULL,
      calls INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (telegram_user_id, day)
    )`,
    columns: [
      { name: "telegram_user_id", sqlType: "INTEGER NOT NULL", nullable: false },
      { name: "day", sqlType: "TEXT NOT NULL", nullable: false },
      { name: "calls", sqlType: "INTEGER NOT NULL DEFAULT 0", nullable: false },
    ],
  },
  {
    name: "bot_schema_migrations",
    createSql: `CREATE TABLE IF NOT EXISTS bot_schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )`,
    columns: [
      { name: "id", sqlType: "TEXT", nullable: true },
      { name: "applied_at", sqlType: "TEXT NOT NULL", nullable: false },
    ],
  },
  {
    name: "bot_spread_claims",
    createSql: `CREATE TABLE IF NOT EXISTS bot_spread_claims (
      telegram_user_id INTEGER NOT NULL,
      question_hash TEXT NOT NULL,
      local_date TEXT NOT NULL,
      session_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (telegram_user_id, question_hash, local_date)
    )`,
    columns: [
      { name: "telegram_user_id", sqlType: "INTEGER NOT NULL", nullable: false },
      { name: "question_hash", sqlType: "TEXT NOT NULL", nullable: false },
      { name: "local_date", sqlType: "TEXT NOT NULL", nullable: false },
      { name: "session_id", sqlType: "TEXT NOT NULL", nullable: false },
      { name: "created_at", sqlType: "TEXT NOT NULL", nullable: false },
    ],
  },
  {
    name: "bot_events",
    columns: [
      { name: "id", sqlType: "INTEGER", nullable: true },
      { name: "name", sqlType: "TEXT NOT NULL", nullable: false },
      { name: "telegram_user_id", sqlType: "INTEGER", nullable: true },
      { name: "payload", sqlType: "TEXT NOT NULL", nullable: false },
      { name: "created_at", sqlType: "TEXT NOT NULL", nullable: false },
    ],
  },
  {
    name: "bot_flow_state",
    columns: [
      { name: "telegram_user_id", sqlType: "INTEGER", nullable: true },
      { name: "flow", sqlType: "TEXT NOT NULL", nullable: false },
      { name: "step", sqlType: "TEXT NOT NULL", nullable: false },
      { name: "data", sqlType: "TEXT NOT NULL", nullable: false },
      { name: "updated_at", sqlType: "TEXT NOT NULL", nullable: false },
    ],
  },
  {
    name: "bot_day_cards",
    columns: [
      { name: "telegram_user_id", sqlType: "INTEGER NOT NULL", nullable: false },
      { name: "day", sqlType: "TEXT NOT NULL", nullable: false },
      { name: "card", sqlType: "TEXT NOT NULL", nullable: false },
      { name: "text", sqlType: "TEXT NOT NULL", nullable: false },
      { name: "created_at", sqlType: "TEXT NOT NULL", nullable: false },
    ],
  },
  {
    name: "bot_processed_updates",
    columns: [
      { name: "update_id", sqlType: "INTEGER", nullable: true },
      { name: "processed_at", sqlType: "TEXT NOT NULL", nullable: false },
    ],
  },
  {
    name: "bot_flags",
    columns: [
      { name: "key", sqlType: "TEXT", nullable: true },
      { name: "value", sqlType: "TEXT NOT NULL", nullable: false },
      { name: "updated_at", sqlType: "TEXT NOT NULL", nullable: false },
    ],
  },
  {
    name: "bot_reminder_log",
    columns: [
      { name: "telegram_user_id", sqlType: "INTEGER NOT NULL", nullable: false },
      { name: "kind", sqlType: "TEXT NOT NULL", nullable: false },
      { name: "day", sqlType: "TEXT NOT NULL", nullable: false },
      { name: "created_at", sqlType: "TEXT NOT NULL", nullable: false },
    ],
  },
];

/** Columns that ensureCriticalColumns may ADD (never drop). */
export function additiveColumns(): Array<{ table: string; column: ExpectedColumn }> {
  const out: Array<{ table: string; column: ExpectedColumn }> = [];
  for (const col of BOT_USERS_PREMIUM) out.push({ table: "bot_users", column: col });
  for (const col of BOT_SESSIONS_PREMIUM) out.push({ table: "bot_guest_sessions", column: col });
  for (const t of EXPECTED_TABLES) {
    if (!t.createSql) continue;
    for (const col of t.columns) out.push({ table: t.name, column: col });
  }
  return out;
}

export function listExpectedColumnNames(table: string): string[] {
  return EXPECTED_TABLES.find((t) => t.name === table)?.columns.map((c) => c.name) ?? [];
}
