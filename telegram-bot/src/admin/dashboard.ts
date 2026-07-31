/**
 * Rich admin dashboard queries over bot SQLite.
 */
import { FLAG_KEYS } from "../flags.js";
import { getDb, todayInTz } from "../db/client.js";
import {
  audit,
  banUser,
  flagEnabled,
  getUser,
  metricsSummary,
  setFlag,
  type BotUser,
} from "../db/repos.js";
import { botConfig } from "../config.js";

type SqlParam = string | number | null;

function countSql(sql: string, params: SqlParam[] = []): number {
  const row = getDb().prepare(sql).get(...params) as { c: number } | undefined;
  return Number(row?.c ?? 0);
}

function dayOffset(daysAgo: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

function eventCountSince(name: string, sinceIsoDay: string): number {
  return countSql(
    `SELECT COUNT(*) AS c FROM bot_events WHERE name = ? AND substr(created_at,1,10) >= ?`,
    [name, sinceIsoDay]
  );
}

export function unbanUser(telegramUserId: number): void {
  getDb()
    .prepare(
      `UPDATE bot_users SET banned_at = NULL, updated_at = ? WHERE telegram_user_id = ?`
    )
    .run(new Date().toISOString(), telegramUserId);
}

export function listFlags(): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  const defaults: Record<string, boolean> = {
    bot_enabled: botConfig.flags.botEnabled,
    day_card_enabled: botConfig.flags.dayCardEnabled,
    reminders_enabled: botConfig.flags.remindersEnabled,
    ritual_reveal_enabled: botConfig.flags.ritualRevealEnabled,
    tts_enabled: botConfig.flags.ttsEnabled,
    llm_enabled: botConfig.flags.llmEnabled,
    share_card_enabled: botConfig.flags.shareCardEnabled,
    weekly_digest_enabled: botConfig.flags.weeklyDigestEnabled,
  };
  for (const key of FLAG_KEYS) {
    out[key] = flagEnabled(key, defaults[key] ?? true);
  }
  return out;
}

export type AdminUserRow = {
  telegram_user_id: number;
  username: string | null;
  first_name: string | null;
  zovus_user_id: string | null;
  linked: boolean;
  age_confirmed: boolean;
  banned: boolean;
  blocked: boolean;
  streak_days: number;
  reminder_mode: string;
  utm_source: string | null;
  utm_campaign: string | null;
  last_active_at: string | null;
  created_at: string;
};

function mapUser(u: BotUser): AdminUserRow {
  return {
    telegram_user_id: u.telegram_user_id,
    username: u.username,
    first_name: u.first_name,
    zovus_user_id: u.zovus_user_id,
    linked: Boolean(u.zovus_user_id),
    age_confirmed: Boolean(u.age_confirmed_at),
    banned: Boolean(u.banned_at),
    blocked: Boolean(u.blocked_at),
    streak_days: u.streak_days ?? 0,
    reminder_mode: u.reminder_mode ?? "off",
    utm_source: u.utm_source,
    utm_campaign: u.utm_campaign,
    last_active_at: u.last_active_at ?? null,
    created_at: u.created_at,
  };
}

export function adminListUsers(opts?: {
  limit?: number;
  q?: string;
  filter?: "all" | "linked" | "banned" | "blocked" | "active7d";
}): { items: AdminUserRow[]; total: number } {
  const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 200);
  const q = (opts?.q || "").trim().toLowerCase();
  const filter = opts?.filter ?? "all";
  const since7 = new Date(Date.now() - 7 * 86_400_000).toISOString();

  let where = "1=1";
  const params: SqlParam[] = [];
  if (filter === "linked") where += " AND zovus_user_id IS NOT NULL AND zovus_user_id != ''";
  if (filter === "banned") where += " AND banned_at IS NOT NULL";
  if (filter === "blocked") where += " AND blocked_at IS NOT NULL";
  if (filter === "active7d") {
    where += " AND last_active_at IS NOT NULL AND last_active_at >= ?";
    params.push(since7);
  }
  if (q) {
    where +=
      " AND (CAST(telegram_user_id AS TEXT) LIKE ? OR lower(COALESCE(username,'')) LIKE ? OR lower(COALESCE(first_name,'')) LIKE ?)";
    const like = `%${q}%`;
    params.push(like, like, like);
  }

  const total = countSql(`SELECT COUNT(*) AS c FROM bot_users WHERE ${where}`, params);
  const rows = getDb()
    .prepare(
      `SELECT * FROM bot_users WHERE ${where} ORDER BY COALESCE(last_active_at, created_at) DESC LIMIT ?`
    )
    .all(...params, limit) as BotUser[];
  return { items: rows.map(mapUser), total };
}

export function adminListEvents(opts?: {
  limit?: number;
  name?: string;
  telegramUserId?: number;
}): Array<{
  id: number;
  name: string;
  telegram_user_id: number | null;
  payload: Record<string, unknown>;
  created_at: string;
}> {
  const limit = Math.min(Math.max(opts?.limit ?? 80, 1), 300);
  const clauses: string[] = [];
  const params: SqlParam[] = [];
  if (opts?.name?.trim()) {
    clauses.push("name = ?");
    params.push(opts.name.trim());
  }
  if (opts?.telegramUserId && opts.telegramUserId > 0) {
    clauses.push("telegram_user_id = ?");
    params.push(opts.telegramUserId);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = getDb()
    .prepare(
      `SELECT id, name, telegram_user_id, payload, created_at
       FROM bot_events ${where}
       ORDER BY id DESC LIMIT ?`
    )
    .all(...params, limit) as Array<{
    id: number;
    name: string;
    telegram_user_id: number | null;
    payload: string;
    created_at: string;
  }>;
  return rows.map((r) => {
    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(r.payload || "{}") as Record<string, unknown>;
    } catch {
      payload = { raw: r.payload };
    }
    return {
      id: r.id,
      name: r.name,
      telegram_user_id: r.telegram_user_id,
      payload,
      created_at: r.created_at,
    };
  });
}

export function buildAdminDashboard() {
  const day = todayInTz();
  const d7 = dayOffset(6);
  const d30 = dayOffset(29);
  const active7iso = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const active30iso = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const today = {
    ...metricsSummary(),
    bot_start: countSql(
      `SELECT COUNT(*) AS c FROM bot_events WHERE name = 'bot_start' AND substr(created_at,1,10) = ?`,
      [day]
    ),
    age_gate_pass: countSql(
      `SELECT COUNT(*) AS c FROM bot_events WHERE name = 'age_gate_pass' AND substr(created_at,1,10) = ?`,
      [day]
    ),
    consent_given: countSql(
      `SELECT COUNT(*) AS c FROM bot_events WHERE name = 'consent_given' AND substr(created_at,1,10) = ?`,
      [day]
    ),
    matrix_full_ready: countSql(
      `SELECT COUNT(*) AS c FROM bot_events WHERE name = 'matrix_full_ready' AND substr(created_at,1,10) = ?`,
      [day]
    ),
    catalog_opened: countSql(
      `SELECT COUNT(*) AS c FROM bot_events WHERE name = 'catalog_opened' AND substr(created_at,1,10) = ?`,
      [day]
    ),
    site_reading_delivered: countSql(
      `SELECT COUNT(*) AS c FROM bot_events WHERE name = 'site_reading_delivered' AND substr(created_at,1,10) = ?`,
      [day]
    ),
    reminder_sent: countSql(
      `SELECT COUNT(*) AS c FROM bot_events WHERE name = 'reminder_sent' AND substr(created_at,1,10) = ?`,
      [day]
    ),
  };

  const totals = {
    users: countSql(`SELECT COUNT(*) AS c FROM bot_users`),
    linked: countSql(
      `SELECT COUNT(*) AS c FROM bot_users WHERE zovus_user_id IS NOT NULL AND zovus_user_id != ''`
    ),
    ageConfirmed: countSql(
      `SELECT COUNT(*) AS c FROM bot_users WHERE age_confirmed_at IS NOT NULL`
    ),
    banned: countSql(`SELECT COUNT(*) AS c FROM bot_users WHERE banned_at IS NOT NULL`),
    blocked: countSql(`SELECT COUNT(*) AS c FROM bot_users WHERE blocked_at IS NOT NULL`),
    unsubscribed: countSql(
      `SELECT COUNT(*) AS c FROM bot_users WHERE unsubscribed_at IS NOT NULL AND unsubscribed_at != ''`
    ),
    active7d: countSql(
      `SELECT COUNT(*) AS c FROM bot_users WHERE last_active_at IS NOT NULL AND last_active_at >= ?`,
      [active7iso]
    ),
    active30d: countSql(
      `SELECT COUNT(*) AS c FROM bot_users WHERE last_active_at IS NOT NULL AND last_active_at >= ?`,
      [active30iso]
    ),
    guestSessions: countSql(`SELECT COUNT(*) AS c FROM bot_guest_sessions`),
    guestClaimed: countSql(
      `SELECT COUNT(*) AS c FROM bot_guest_sessions WHERE claimed_at IS NOT NULL`
    ),
    openFlows: countSql(`SELECT COUNT(*) AS c FROM bot_flow_state`),
  };

  const funnel7d = {
    bot_start: eventCountSince("bot_start", d7),
    age_gate_pass: eventCountSince("age_gate_pass", d7),
    consent_given: eventCountSince("consent_given", d7),
    teaser_shown: eventCountSince("teaser_shown", d7),
    cta_click: eventCountSince("cta_click", d7),
    receipt_claimed: eventCountSince("receipt_claimed", d7),
    site_reading_delivered: eventCountSince("site_reading_delivered", d7),
    matrix_full_ready: eventCountSince("matrix_full_ready", d7),
    catalog_opened: eventCountSince("catalog_opened", d7),
    crisis_detected: eventCountSince("crisis_detected", d7),
  };

  const topEvents7d = getDb()
    .prepare(
      `SELECT name, COUNT(*) AS c FROM bot_events
       WHERE substr(created_at,1,10) >= ?
       GROUP BY name ORDER BY c DESC LIMIT 25`
    )
    .all(d7) as Array<{ name: string; c: number }>;

  const eventsByDay = getDb()
    .prepare(
      `SELECT substr(created_at,1,10) AS day, COUNT(*) AS c
       FROM bot_events
       WHERE substr(created_at,1,10) >= ?
       GROUP BY day ORDER BY day ASC`
    )
    .all(d30) as Array<{ day: string; c: number }>;

  const usersByDay = getDb()
    .prepare(
      `SELECT substr(created_at,1,10) AS day, COUNT(*) AS c
       FROM bot_users
       WHERE substr(created_at,1,10) >= ?
       GROUP BY day ORDER BY day ASC`
    )
    .all(d30) as Array<{ day: string; c: number }>;

  const utmTop = getDb()
    .prepare(
      `SELECT COALESCE(NULLIF(utm_source,''), '(none)') AS source, COUNT(*) AS c
       FROM bot_users GROUP BY source ORDER BY c DESC LIMIT 15`
    )
    .all() as Array<{ source: string; c: number }>;

  const campaignTop = getDb()
    .prepare(
      `SELECT COALESCE(NULLIF(utm_campaign,''), '(none)') AS campaign, COUNT(*) AS c
       FROM bot_users GROUP BY campaign ORDER BY c DESC LIMIT 15`
    )
    .all() as Array<{ campaign: string; c: number }>;

  const llmToday = countSql(
    `SELECT COALESCE(SUM(calls),0) AS c FROM bot_llm_usage WHERE day = ?`,
    [day]
  );
  const ttsToday = countSql(
    `SELECT COALESCE(SUM(calls),0) AS c FROM bot_tts_usage WHERE day = ?`,
    [day]
  );

  const reminderModes = getDb()
    .prepare(
      `SELECT reminder_mode AS mode, COUNT(*) AS c FROM bot_users GROUP BY reminder_mode`
    )
    .all() as Array<{ mode: string; c: number }>;

  return {
    ok: true as const,
    generatedAt: new Date().toISOString(),
    day,
    health: {
      db: "ok" as const,
      botEnabled: listFlags().bot_enabled,
      timezone: botConfig.timezone,
    },
    today,
    totals,
    funnel7d,
    topEvents7d: topEvents7d.map((r) => ({ name: r.name, count: r.c })),
    eventsByDay: eventsByDay.map((r) => ({ day: r.day, count: r.c })),
    usersByDay: usersByDay.map((r) => ({ day: r.day, count: r.c })),
    utmTop: utmTop.map((r) => ({ source: r.source, count: r.c })),
    campaignTop: campaignTop.map((r) => ({ campaign: r.campaign, count: r.c })),
    reminderModes: reminderModes.map((r) => ({ mode: r.mode, count: r.c })),
    usage: { llmToday, ttsToday },
    flags: listFlags(),
    recentUsers: adminListUsers({ limit: 12 }).items,
    recentEvents: adminListEvents({ limit: 30 }),
  };
}

export function adminSetFlag(key: string, enabled: boolean, actor: string): {
  ok: boolean;
  error?: string;
  flags?: Record<string, boolean>;
} {
  if (!(FLAG_KEYS as readonly string[]).includes(key)) {
    return { ok: false, error: "unknown_flag" };
  }
  setFlag(key, enabled);
  audit("set_flag", { key, enabled }, actor);
  return { ok: true, flags: listFlags() };
}

export function adminBan(
  telegramUserId: number,
  banned: boolean,
  actor: string
): { ok: boolean; error?: string; user?: AdminUserRow } {
  const existing = getUser(telegramUserId);
  if (!existing) return { ok: false, error: "not_found" };
  if (banned) banUser(telegramUserId);
  else unbanUser(telegramUserId);
  audit(banned ? "ban" : "unban", { telegram_user_id: telegramUserId }, actor);
  const updated = getUser(telegramUserId);
  return { ok: true, user: updated ? mapUser(updated) : undefined };
}
