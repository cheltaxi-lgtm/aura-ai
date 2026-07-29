import { randomUUID } from "node:crypto";
import { botConfig } from "../config.js";
import { hashQuestion } from "../domain/question/hash.js";
import { GUEST_SCHEMA_VERSION } from "../domain/session/guest-contract.js";
import { localDateKey } from "../domain/time/local-date.js";
import type { DrawnCard, GuestSymbol } from "../domain/deck/types.js";
import { getDb, nowIso, todayInTz } from "./client.js";

export type BotUser = {
  telegram_user_id: number;
  chat_id: number;
  username: string | null;
  first_name: string | null;
  language_code: string | null;
  age_confirmed_at: string | null;
  terms_accepted_at: string | null;
  privacy_accepted_at: string | null;
  consent_source: string | null;
  consent_version?: string | null;
  ref: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  master_pref: string | null;
  reminder_mode: "morning" | "evening" | "off";
  reminder_hour: number | null;
  streak_days: number;
  streak_last_date: string | null;
  streak_grace_used?: number | null;
  blocked_at: string | null;
  banned_at: string | null;
  zovus_user_id: string | null;
  timezone_offset_minutes?: number | null;
  timezone_source?: "default" | "user" | null;
  voice_mode?: "text" | "text_voice" | null;
  ref_code?: string | null;
  invited_by?: number | null;
  referral_count?: number | null;
  bonus_spreads?: number | null;
  last_active_at?: string | null;
  unsubscribed_at?: string | null;
  timezone_asked_at?: string | null;
  link_welcomed_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type Attribution = {
  ref?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  master?: string;
};

export type GuestSessionRow = {
  id: string;
  telegram_user_id: number;
  question: string;
  cards: string;
  master: string;
  system: string;
  spread_id: string;
  teaser_text: string | null;
  teaser_prompt_version: string | null;
  teaser_model: string | null;
  session_token_hash: string;
  plain_token_prefix?: string | null;
  fingerprint: string | null;
  question_source: string | null;
  source: string;
  created_at: string;
  expires_at: string;
  claimed_at: string | null;
  quota_day?: string | null;
  /** ok | failed | pending; NULL legacy rows count as ok */
  status?: string | null;
  teaser_delivered_at?: string | null;
  schema_version?: number | null;
  /** 1 = claimable on site; 0 = legacy / unclaimable */
  claimable?: number | null;
  /** Tracked CTA URL for resend (same exposure as Telegram message). Cleared on claim. */
  cta_url?: string | null;
};

/** Window to release undelivered spread claim (ms). */
export const SPREAD_SLOT_RELEASE_WINDOW_MS = 15 * 60 * 1000;

export function upsertUser(input: {
  telegramUserId: number;
  chatId: number;
  username?: string;
  firstName?: string;
  languageCode?: string;
  attribution?: Attribution;
}): BotUser {
  const db = getDb();
  const existing = db
    .prepare(`SELECT * FROM bot_users WHERE telegram_user_id = ?`)
    .get(input.telegramUserId) as BotUser | undefined;
  const now = nowIso();

  if (!existing) {
    db.prepare(
      `INSERT INTO bot_users (
        telegram_user_id, chat_id, username, first_name, language_code,
        ref, utm_source, utm_medium, utm_campaign, utm_content, master_pref,
        timezone_offset_minutes, timezone_source,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 180, 'default', ?, ?)`
    ).run(
      input.telegramUserId,
      input.chatId,
      input.username ?? null,
      input.firstName ?? null,
      input.languageCode ?? null,
      input.attribution?.ref ?? null,
      input.attribution?.utm_source ?? null,
      input.attribution?.utm_medium ?? null,
      input.attribution?.utm_campaign ?? null,
      input.attribution?.utm_content ?? null,
      input.attribution?.master ?? botConfig.masterId,
      now,
      now
    );
  } else {
    db.prepare(
      `UPDATE bot_users SET
        chat_id = ?,
        username = COALESCE(?, username),
        first_name = COALESCE(?, first_name),
        language_code = COALESCE(?, language_code),
        updated_at = ?
       WHERE telegram_user_id = ?`
    ).run(
      input.chatId,
      input.username ?? null,
      input.firstName ?? null,
      input.languageCode ?? null,
      now,
      input.telegramUserId
    );

    // First-touch attribution only
    if (input.attribution) {
      const a = input.attribution;
      db.prepare(
        `UPDATE bot_users SET
          ref = COALESCE(ref, ?),
          utm_source = COALESCE(utm_source, ?),
          utm_medium = COALESCE(utm_medium, ?),
          utm_campaign = COALESCE(utm_campaign, ?),
          utm_content = COALESCE(utm_content, ?),
          master_pref = COALESCE(master_pref, ?)
         WHERE telegram_user_id = ?`
      ).run(
        a.ref ?? null,
        a.utm_source ?? null,
        a.utm_medium ?? null,
        a.utm_campaign ?? null,
        a.utm_content ?? null,
        a.master ?? null,
        input.telegramUserId
      );
    }
  }

  return getUser(input.telegramUserId)!;
}

export function getUser(telegramUserId: number): BotUser | null {
  return (
    (getDb().prepare(`SELECT * FROM bot_users WHERE telegram_user_id = ?`).get(telegramUserId) as
      | BotUser
      | undefined) ?? null
  );
}

export function hasGates(user: BotUser): boolean {
  return Boolean(user.age_confirmed_at && user.terms_accepted_at && user.privacy_accepted_at);
}

export function confirmAge(telegramUserId: number): void {
  const now = nowIso();
  getDb()
    .prepare(
      `UPDATE bot_users SET age_confirmed_at = COALESCE(age_confirmed_at, ?), updated_at = ? WHERE telegram_user_id = ?`
    )
    .run(now, now, telegramUserId);
}

export function confirmConsent(telegramUserId: number): void {
  const now = nowIso();
  getDb()
    .prepare(
      `UPDATE bot_users SET
        terms_accepted_at = COALESCE(terms_accepted_at, ?),
        privacy_accepted_at = COALESCE(privacy_accepted_at, ?),
        consent_source = 'telegram',
        consent_version = COALESCE(consent_version, ?),
        updated_at = ?
       WHERE telegram_user_id = ?`
    )
    .run(now, now, botConfig.consentVersion, now, telegramUserId);
}

export function setReminderMode(
  telegramUserId: number,
  mode: "morning" | "evening" | "off",
  hour: number | null
): void {
  getDb()
    .prepare(
      `UPDATE bot_users SET reminder_mode = ?, reminder_hour = ?, updated_at = ? WHERE telegram_user_id = ?`
    )
    .run(mode, hour, nowIso(), telegramUserId);
}

export function markBlocked(telegramUserId: number): void {
  getDb()
    .prepare(`UPDATE bot_users SET blocked_at = ?, updated_at = ? WHERE telegram_user_id = ?`)
    .run(nowIso(), nowIso(), telegramUserId);
}

export function banUser(telegramUserId: number): void {
  getDb()
    .prepare(`UPDATE bot_users SET banned_at = ?, updated_at = ? WHERE telegram_user_id = ?`)
    .run(nowIso(), nowIso(), telegramUserId);
}

export function touchStreak(telegramUserId: number): number {
  const user = getUser(telegramUserId);
  if (!user) return 0;
  const today = localDateKey(user);
  if (user.streak_last_date === today) return user.streak_days;

  let next = 1;
  let grace = user.streak_grace_used ?? 0;
  if (user.streak_last_date) {
    const prev = new Date(`${user.streak_last_date}T12:00:00Z`);
    const cur = new Date(`${today}T12:00:00Z`);
    const diffDays = Math.round((cur.getTime() - prev.getTime()) / 86400000);
    if (diffDays === 1) {
      next = user.streak_days + 1;
      grace = 0;
    } else if (diffDays === 2 && grace === 0) {
      // Soft miss: one skipped day does not reset
      next = user.streak_days + 1;
      grace = 1;
    }
  }

  getDb()
    .prepare(
      `UPDATE bot_users SET streak_days = ?, streak_last_date = ?, streak_grace_used = ?, updated_at = ?, last_active_at = ? WHERE telegram_user_id = ?`
    )
    .run(next, today, grace, nowIso(), nowIso(), telegramUserId);
  return next;
}

export function setFlow(
  telegramUserId: number,
  flow: string,
  step: string,
  data: Record<string, unknown> = {}
): void {
  getDb()
    .prepare(
      `INSERT INTO bot_flow_state (telegram_user_id, flow, step, data, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(telegram_user_id) DO UPDATE SET
         flow = excluded.flow,
         step = excluded.step,
         data = excluded.data,
         updated_at = excluded.updated_at`
    )
    .run(telegramUserId, flow, step, JSON.stringify(data), nowIso());
}

export function getFlow(telegramUserId: number): {
  flow: string;
  step: string;
  data: Record<string, unknown>;
} | null {
  const row = getDb()
    .prepare(`SELECT flow, step, data FROM bot_flow_state WHERE telegram_user_id = ?`)
    .get(telegramUserId) as { flow: string; step: string; data: string } | undefined;
  if (!row) return null;
  return {
    flow: row.flow,
    step: row.step,
    data: JSON.parse(row.data || "{}") as Record<string, unknown>,
  };
}

export function clearFlow(telegramUserId: number): void {
  getDb().prepare(`DELETE FROM bot_flow_state WHERE telegram_user_id = ?`).run(telegramUserId);
}

export function claimUpdate(updateId: number): boolean {
  try {
    getDb()
      .prepare(`INSERT INTO bot_processed_updates (update_id, processed_at) VALUES (?, ?)`)
      .run(updateId, nowIso());
    return true;
  } catch {
    return false;
  }
}

export function releaseUpdate(updateId: number): void {
  getDb().prepare(`DELETE FROM bot_processed_updates WHERE update_id = ?`).run(updateId);
}

export function trackEvent(
  name: string,
  telegramUserId: number | null,
  payload: Record<string, unknown> = {}
): void {
  getDb()
    .prepare(
      `INSERT INTO bot_events (name, telegram_user_id, payload, created_at) VALUES (?, ?, ?, ?)`
    )
    .run(name, telegramUserId, JSON.stringify(payload), nowIso());
}

export function countTripletsToday(telegramUserId: number, user?: BotUser | null): number {
  const u = user ?? getUser(telegramUserId);
  const day = localDateKey(u);
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS c FROM bot_guest_sessions
       WHERE telegram_user_id = ?
         AND COALESCE(quota_day, substr(created_at,1,10)) = ?
         AND COALESCE(status, 'ok') != 'failed'`
    )
    .get(telegramUserId, day) as { c: number };
  return row.c;
}

export function getLastGuestSession(telegramUserId: number): GuestSessionRow | null {
  return (
    (getDb()
      .prepare(
        `SELECT * FROM bot_guest_sessions
         WHERE telegram_user_id = ? AND COALESCE(status, 'ok') != 'failed'
         ORDER BY created_at DESC LIMIT 1`
      )
      .get(telegramUserId) as GuestSessionRow | undefined) ?? null
  );
}

export type SpreadClaimResult =
  | { claimed: true; sessionId: string }
  | { claimed: false; sessionId: string; reason: "duplicate" };

/**
 * Atomic UNIQUE claim for (user, question_hash, local_date).
 * On conflict returns the existing session_id without creating a second spread.
 */
export function claimSpreadSlot(
  telegramUserId: number,
  question: string,
  sessionId: string,
  user?: BotUser | null
): SpreadClaimResult {
  const u = user ?? getUser(telegramUserId);
  const qHash = hashQuestion(question);
  const day = localDateKey(u);
  try {
    getDb()
      .prepare(
        `INSERT INTO bot_spread_claims (telegram_user_id, question_hash, local_date, session_id, created_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(telegramUserId, qHash, day, sessionId, nowIso());
    return { claimed: true, sessionId };
  } catch {
    const existing = getDb()
      .prepare(
        `SELECT session_id FROM bot_spread_claims
         WHERE telegram_user_id = ? AND question_hash = ? AND local_date = ?`
      )
      .get(telegramUserId, qHash, day) as { session_id: string } | undefined;
    trackEvent("duplicate_update_suppressed", telegramUserId, {
      reason: "spread_claim_unique",
      local_date: day,
    });
    return {
      claimed: false,
      sessionId: existing?.session_id ?? sessionId,
      reason: "duplicate",
    };
  }
}

export function findSessionById(sessionId: string): GuestSessionRow | null {
  return (
    (getDb().prepare(`SELECT * FROM bot_guest_sessions WHERE id = ?`).get(sessionId) as
      | GuestSessionRow
      | undefined) ?? null
  );
}

/** First N chars of the token body after `zg_` — debug/admin only, not enough to guess. */
export function plainTokenPrefixFromToken(plainToken: string): string {
  const body = plainToken.startsWith("zg_") ? plainToken.slice(3) : plainToken;
  return body.slice(0, botConfig.plainTokenPrefixLen);
}

export function createGuestSession(input: {
  id?: string;
  telegramUserId: number;
  question: string;
  cards: GuestSymbol[];
  teaserText: string;
  teaserPromptVersion: string;
  teaserModel: string;
  teaserSeed: string;
  tokenHash: string;
  /** Plain token used only to derive short prefix; never stored in full. */
  plainToken?: string;
  fingerprint: string;
  questionSource: "chip" | "free";
  collageCacheKey?: string;
  /** Tracked CTA URL (may embed token in path — same as Telegram CTA). */
  ctaUrl?: string | null;
}): GuestSessionRow {
  const id = input.id ?? randomUUID();
  const created = nowIso();
  const expires = new Date(Date.now() + botConfig.sessionTtlMs).toISOString();
  const user = getUser(input.telegramUserId);
  const quotaDay = localDateKey(user);
  const prefix = input.plainToken ? plainTokenPrefixFromToken(input.plainToken) : null;
  getDb()
    .prepare(
      `INSERT INTO bot_guest_sessions (
        id, telegram_user_id, question, cards, master, system, spread_id, deck_id,
        teaser_text, teaser_prompt_version, teaser_model, teaser_seed,
        session_token_hash, plain_token_prefix, fingerprint, question_source, source, collage_cache_key,
        created_at, expires_at, claimed_at, quota_day, status, teaser_delivered_at,
        schema_version, claimable, cta_url
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'telegram', ?, ?, ?, NULL, ?, 'pending', NULL, ?, 1, ?)`
    )
    .run(
      id,
      input.telegramUserId,
      input.question,
      JSON.stringify(input.cards),
      botConfig.masterId,
      botConfig.system,
      botConfig.spreadId,
      botConfig.deckId,
      input.teaserText,
      input.teaserPromptVersion,
      input.teaserModel,
      input.teaserSeed,
      input.tokenHash,
      prefix,
      input.fingerprint,
      input.questionSource,
      input.collageCacheKey ?? id,
      created,
      expires,
      quotaDay,
      GUEST_SCHEMA_VERSION,
      input.ctaUrl ?? null
    );
  return getDb().prepare(`SELECT * FROM bot_guest_sessions WHERE id = ?`).get(id) as GuestSessionRow;
}

export function setSessionCtaUrl(sessionId: string, ctaUrl: string): void {
  getDb()
    .prepare(`UPDATE bot_guest_sessions SET cta_url = ? WHERE id = ?`)
    .run(ctaUrl, sessionId);
}

export function clearSessionCtaUrl(sessionId: string): void {
  getDb()
    .prepare(`UPDATE bot_guest_sessions SET cta_url = NULL WHERE id = ?`)
    .run(sessionId);
}

/** Latest unclaimed claimable session with a CTA URL (for profile / resend). */
export function findLatestUnclaimedCtaSession(
  telegramUserId: number
): GuestSessionRow | null {
  const now = nowIso();
  return (
    (getDb()
      .prepare(
        `SELECT * FROM bot_guest_sessions
         WHERE telegram_user_id = ?
           AND claimed_at IS NULL
           AND COALESCE(claimable, 0) = 1
           AND COALESCE(status, 'ok') != 'failed'
           AND expires_at > ?
           AND cta_url IS NOT NULL
           AND length(cta_url) > 0
         ORDER BY created_at DESC
         LIMIT 1`
      )
      .get(telegramUserId, now) as GuestSessionRow | undefined) ?? null
  );
}

export function markTeaserDelivered(sessionId: string, at: string = nowIso()): void {
  getDb()
    .prepare(
      `UPDATE bot_guest_sessions
       SET teaser_delivered_at = ?, status = 'ok'
       WHERE id = ? AND teaser_delivered_at IS NULL`
    )
    .run(at, sessionId);
}

export type ReleaseSlotResult =
  | { released: true; reason: "released" }
  | {
      released: false;
      reason: "teaser_delivered" | "window_elapsed" | "no_claim" | "already_failed";
    };

/**
 * Release spread claim if teaser was never delivered and claim age < 15 minutes.
 * Marks session failed (row kept). Does not delete user data.
 */
export function releaseFailedSpreadSlot(input: {
  telegramUserId: number;
  question: string;
  sessionId: string;
  user?: BotUser | null;
  nowMs?: number;
}): ReleaseSlotResult {
  const u = input.user ?? getUser(input.telegramUserId);
  const qHash = hashQuestion(input.question);
  const day = localDateKey(u);
  const now = input.nowMs ?? Date.now();

  const sess = findSessionById(input.sessionId);
  if (sess?.teaser_delivered_at) {
    return { released: false, reason: "teaser_delivered" };
  }
  if (sess?.status === "failed") {
    // Ensure claim is gone so retry can proceed
    getDb()
      .prepare(
        `DELETE FROM bot_spread_claims
         WHERE telegram_user_id = ? AND question_hash = ? AND local_date = ?`
      )
      .run(input.telegramUserId, qHash, day);
    return { released: false, reason: "already_failed" };
  }

  const claim = getDb()
    .prepare(
      `SELECT session_id, created_at FROM bot_spread_claims
       WHERE telegram_user_id = ? AND question_hash = ? AND local_date = ?`
    )
    .get(input.telegramUserId, qHash, day) as
    | { session_id: string; created_at: string }
    | undefined;

  if (!claim) {
    if (sess) {
      getDb()
        .prepare(`UPDATE bot_guest_sessions SET status = 'failed' WHERE id = ?`)
        .run(input.sessionId);
    }
    return { released: false, reason: "no_claim" };
  }

  const ageMs = now - new Date(claim.created_at).getTime();
  if (ageMs > SPREAD_SLOT_RELEASE_WINDOW_MS) {
    return { released: false, reason: "window_elapsed" };
  }

  if (sess) {
    getDb()
      .prepare(`UPDATE bot_guest_sessions SET status = 'failed' WHERE id = ?`)
      .run(input.sessionId);
  }

  getDb()
    .prepare(
      `DELETE FROM bot_spread_claims
       WHERE telegram_user_id = ? AND question_hash = ? AND local_date = ?`
    )
    .run(input.telegramUserId, qHash, day);

  trackEvent("spread_failed_slot_released", input.telegramUserId, {
    session_id: input.sessionId,
    question_hash: qHash,
    local_date: day,
    age_ms: ageMs,
  });

  return { released: true, reason: "released" };
}

export function hasSpreadClaim(
  telegramUserId: number,
  question: string,
  user?: BotUser | null
): boolean {
  const u = user ?? getUser(telegramUserId);
  const row = getDb()
    .prepare(
      `SELECT 1 AS ok FROM bot_spread_claims
       WHERE telegram_user_id = ? AND question_hash = ? AND local_date = ?`
    )
    .get(telegramUserId, hashQuestion(question), localDateKey(u)) as { ok: number } | undefined;
  return Boolean(row);
}

export function findSessionsByTokenPrefix(prefix: string, limit = 20): GuestSessionRow[] {
  const p = prefix.trim();
  if (!p) return [];
  return getDb()
    .prepare(
      `SELECT * FROM bot_guest_sessions
       WHERE plain_token_prefix = ?
       ORDER BY created_at DESC LIMIT ?`
    )
    .all(p, limit) as GuestSessionRow[];
}

export function listSessions(telegramUserId: number, limit = 10): GuestSessionRow[] {
  return getDb()
    .prepare(
      `SELECT * FROM bot_guest_sessions WHERE telegram_user_id = ? ORDER BY created_at DESC LIMIT ?`
    )
    .all(telegramUserId, limit) as GuestSessionRow[];
}

export function countSessions(telegramUserId: number): number {
  const row = getDb()
    .prepare(`SELECT COUNT(*) AS c FROM bot_guest_sessions WHERE telegram_user_id = ?`)
    .get(telegramUserId) as { c: number };
  return row.c;
}

export function countSessionsSince(telegramUserId: number, sinceIso: string): number {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS c FROM bot_guest_sessions
       WHERE telegram_user_id = ? AND created_at >= ? AND COALESCE(status, 'ok') != 'failed'`
    )
    .get(telegramUserId, sinceIso) as { c: number };
  return row.c;
}

export function getDayCard(telegramUserId: number, day?: string): {
  card: DrawnCard;
  text: string;
} | null {
  const key = day ?? localDateKey(getUser(telegramUserId));
  const row = getDb()
    .prepare(`SELECT card, text FROM bot_day_cards WHERE telegram_user_id = ? AND day = ?`)
    .get(telegramUserId, key) as { card: string; text: string } | undefined;
  if (!row) return null;
  return { card: JSON.parse(row.card) as DrawnCard, text: row.text };
}

export function saveDayCard(telegramUserId: number, card: DrawnCard, text: string): void {
  getDb()
    .prepare(
      `INSERT INTO bot_day_cards (telegram_user_id, day, card, text, created_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(
      telegramUserId,
      localDateKey(getUser(telegramUserId)),
      JSON.stringify(card),
      text,
      nowIso()
    );
}

export function flagEnabled(key: string, fallback: boolean): boolean {
  const row = getDb().prepare(`SELECT value FROM bot_flags WHERE key = ?`).get(key) as
    | { value: string }
    | undefined;
  if (!row) return fallback;
  return row.value === "1" || row.value === "true";
}

export function setFlag(key: string, enabled: boolean): void {
  getDb()
    .prepare(
      `INSERT INTO bot_flags (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    )
    .run(key, enabled ? "1" : "0", nowIso());
}

export function deleteUserData(telegramUserId: number): void {
  const db = getDb();
  db.exec("BEGIN");
  try {
    db.prepare(`DELETE FROM bot_reminder_log WHERE telegram_user_id = ?`).run(telegramUserId);
    db.prepare(`DELETE FROM bot_day_cards WHERE telegram_user_id = ?`).run(telegramUserId);
    db.prepare(`DELETE FROM bot_flow_state WHERE telegram_user_id = ?`).run(telegramUserId);
    db.prepare(`DELETE FROM bot_spread_claims WHERE telegram_user_id = ?`).run(telegramUserId);
    db.prepare(`DELETE FROM bot_guest_sessions WHERE telegram_user_id = ?`).run(telegramUserId);
    db.prepare(`DELETE FROM bot_events WHERE telegram_user_id = ?`).run(telegramUserId);
    db.prepare(`DELETE FROM bot_users WHERE telegram_user_id = ?`).run(telegramUserId);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

export function listUsers(limit = 100): BotUser[] {
  return getDb()
    .prepare(`SELECT * FROM bot_users ORDER BY created_at DESC LIMIT ?`)
    .all(limit) as BotUser[];
}

/** Users inactive for exactly `days` calendar days (reactivation window). */
export function usersForReactivation(days: number, limit = 200): BotUser[] {
  const now = Date.now();
  const start = new Date(now - (days + 1) * 86_400_000).toISOString();
  const end = new Date(now - days * 86_400_000).toISOString();
  return getDb()
    .prepare(
      `SELECT * FROM bot_users
       WHERE blocked_at IS NULL
         AND banned_at IS NULL
         AND (unsubscribed_at IS NULL OR unsubscribed_at = '')
         AND last_active_at IS NOT NULL
         AND last_active_at > ?
         AND last_active_at <= ?
       ORDER BY last_active_at ASC
       LIMIT ?`
    )
    .all(start, end, limit) as BotUser[];
}

/** Active opted-in users for weekly digest (capped). */
export function usersForWeeklyDigest(limit = 500): BotUser[] {
  return getDb()
    .prepare(
      `SELECT * FROM bot_users
       WHERE blocked_at IS NULL
         AND banned_at IS NULL
         AND age_confirmed_at IS NOT NULL
         AND (unsubscribed_at IS NULL OR unsubscribed_at = '')
       ORDER BY last_active_at DESC
       LIMIT ?`
    )
    .all(limit) as BotUser[];
}

/** ISO week key YYYY-Www for digest dedupe. */
export function isoWeekKey(d = new Date()): string {
  const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function audit(action: string, detail: Record<string, unknown> = {}, actor = "cli"): void {
  getDb()
    .prepare(
      `INSERT INTO bot_admin_audit (action, actor, detail, created_at) VALUES (?, ?, ?, ?)`
    )
    .run(action, actor, JSON.stringify(detail), nowIso());
}

export function reminderAlreadySent(
  telegramUserId: number,
  kind: string,
  day?: string
): boolean {
  const user = getUser(telegramUserId);
  const key = day ?? localDateKey(user);
  const row = getDb()
    .prepare(
      `SELECT 1 AS ok FROM bot_reminder_log WHERE telegram_user_id = ? AND kind = ? AND day = ?`
    )
    .get(telegramUserId, kind, key) as { ok: number } | undefined;
  return Boolean(row);
}

export function markReminderSent(telegramUserId: number, kind: string): void {
  const user = getUser(telegramUserId);
  getDb()
    .prepare(
      `INSERT OR IGNORE INTO bot_reminder_log (telegram_user_id, kind, day, created_at) VALUES (?, ?, ?, ?)`
    )
    .run(telegramUserId, kind, localDateKey(user), nowIso());
}

export function usersForReminder(mode: "morning" | "evening"): BotUser[] {
  return getDb()
    .prepare(
      `SELECT * FROM bot_users
       WHERE reminder_mode = ?
         AND blocked_at IS NULL
         AND banned_at IS NULL
         AND age_confirmed_at IS NOT NULL
         AND (unsubscribed_at IS NULL OR unsubscribed_at = '')`
    )
    .all(mode) as BotUser[];
}

export function abandonedFlows(olderThanMs: number): Array<{
  telegram_user_id: number;
  chat_id: number;
  data: string;
  updated_at: string;
}> {
  const cutoff = new Date(Date.now() - olderThanMs).toISOString();
  return getDb()
    .prepare(
      `SELECT s.telegram_user_id, u.chat_id, s.data, s.updated_at
       FROM bot_flow_state s
       JOIN bot_users u ON u.telegram_user_id = s.telegram_user_id
       WHERE s.flow = 'spread' AND s.step = 'await_question' AND s.updated_at < ?
         AND u.blocked_at IS NULL`
    )
    .all(cutoff) as Array<{
    telegram_user_id: number;
    chat_id: number;
    data: string;
    updated_at: string;
  }>;
}

export function exportEventsCsv(): string {
  const rows = getDb()
    .prepare(
      `SELECT id, name, telegram_user_id, payload, created_at FROM bot_events ORDER BY id ASC`
    )
    .all() as Array<{
    id: number;
    name: string;
    telegram_user_id: number | null;
    payload: string;
    created_at: string;
  }>;
  const header = "id,name,telegram_user_id,payload,created_at";
  const body = rows.map((r) =>
    [r.id, r.name, r.telegram_user_id ?? "", JSON.stringify(r.payload).replaceAll('"', '""'), r.created_at]
      .map((c, i) => (i === 3 ? `"${c}"` : String(c)))
      .join(",")
  );
  return [header, ...body].join("\n");
}

export function effectiveTripletLimit(user: BotUser): number {
  return botConfig.tripletDailyLimit + (user.bonus_spreads ?? 0);
}

const TZ_HOP_GUARD_MS = 20 * 60 * 60 * 1000;

export function canDrawTriplet(user: BotUser): boolean {
  const todayCount = countTripletsToday(user.telegram_user_id, user);
  const limit = effectiveTripletLimit(user);
  if (todayCount >= limit) return false;

  // TZ-hop guard: a recent draw that falls on another quota_day under the new
  // offset must not unlock a second free triplet without a bonus.
  if (todayCount < botConfig.tripletDailyLimit) {
    const last = getLastGuestSession(user.telegram_user_id);
    if (last) {
      const ageMs = Date.now() - new Date(last.created_at).getTime();
      if (ageMs >= 0 && ageMs < TZ_HOP_GUARD_MS) {
        const lastDay = last.quota_day ?? localDateKey(user, new Date(last.created_at));
        const today = localDateKey(user);
        if (lastDay !== today && (user.bonus_spreads ?? 0) <= 0) {
          return false;
        }
      }
    }
  }
  return true;
}

export function consumeBonusSpread(telegramUserId: number): void {
  getDb()
    .prepare(
      `UPDATE bot_users SET bonus_spreads = CASE WHEN COALESCE(bonus_spreads,0) > 0 THEN bonus_spreads - 1 ELSE 0 END, updated_at = ? WHERE telegram_user_id = ?`
    )
    .run(nowIso(), telegramUserId);
}

export function findSessionByTokenHash(hash: string): GuestSessionRow | null {
  return (
    (getDb()
      .prepare(`SELECT * FROM bot_guest_sessions WHERE session_token_hash = ?`)
      .get(hash) as GuestSessionRow | undefined) ?? null
  );
}

export function expireSessions(): number {
  const now = nowIso();
  const res = getDb().prepare(
    `UPDATE bot_guest_sessions SET expired_at = COALESCE(expired_at, ?)
     WHERE expires_at < ? AND claimed_at IS NULL AND expired_at IS NULL`
  ).run(now, now);
  return Number(res.changes ?? 0);
}

export function hasLlmQuota(telegramUserId: number): boolean {
  const day = localDateKey(getUser(telegramUserId));
  const row = getDb()
    .prepare(`SELECT calls FROM bot_llm_usage WHERE telegram_user_id = ? AND day = ?`)
    .get(telegramUserId, day) as { calls: number } | undefined;
  return (row?.calls ?? 0) < botConfig.llmDailyCap;
}

/** Increment after a successful LLM call (not before). */
export function consumeLlmQuota(telegramUserId: number): boolean {
  if (!hasLlmQuota(telegramUserId)) return false;
  const day = localDateKey(getUser(telegramUserId));
  getDb()
    .prepare(
      `INSERT INTO bot_llm_usage (telegram_user_id, day, calls) VALUES (?, ?, 1)
       ON CONFLICT(telegram_user_id, day) DO UPDATE SET calls = calls + 1`
    )
    .run(telegramUserId, day);
  return true;
}

export function hasTtsQuota(telegramUserId: number): boolean {
  const day = localDateKey(getUser(telegramUserId));
  const row = getDb()
    .prepare(`SELECT calls FROM bot_tts_usage WHERE telegram_user_id = ? AND day = ?`)
    .get(telegramUserId, day) as { calls: number } | undefined;
  return (row?.calls ?? 0) < botConfig.ttsDailyCap;
}

/** Increment after voice was successfully delivered (not before synthesize). */
export function consumeTtsQuota(telegramUserId: number): boolean {
  if (!hasTtsQuota(telegramUserId)) return false;
  const day = localDateKey(getUser(telegramUserId));
  getDb()
    .prepare(
      `INSERT INTO bot_tts_usage (telegram_user_id, day, calls) VALUES (?, ?, 1)
       ON CONFLICT(telegram_user_id, day) DO UPDATE SET calls = calls + 1`
    )
    .run(telegramUserId, day);
  return true;
}

export function ensureRefCode(telegramUserId: number): string {
  const user = getUser(telegramUserId);
  if (user?.ref_code) return user.ref_code;
  const code = `r${telegramUserId.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  getDb()
    .prepare(`UPDATE bot_users SET ref_code = ?, updated_at = ? WHERE telegram_user_id = ?`)
    .run(code, nowIso(), telegramUserId);
  return code;
}

export function applyReferral(inviteeId: number, refCode: string): boolean {
  const inviter = getDb()
    .prepare(`SELECT * FROM bot_users WHERE ref_code = ?`)
    .get(refCode) as BotUser | undefined;
  if (!inviter || inviter.telegram_user_id === inviteeId) return false;
  const invitee = getUser(inviteeId);
  if (!invitee || invitee.invited_by) return false;
  getDb()
    .prepare(
      `UPDATE bot_users SET invited_by = ?, updated_at = ? WHERE telegram_user_id = ? AND invited_by IS NULL`
    )
    .run(inviter.telegram_user_id, nowIso(), inviteeId);
  getDb()
    .prepare(
      `UPDATE bot_users SET referral_count = COALESCE(referral_count,0) + 1,
        bonus_spreads = COALESCE(bonus_spreads,0) + 1, updated_at = ? WHERE telegram_user_id = ?`
    )
    .run(nowIso(), inviter.telegram_user_id);
  trackEvent("referral_joined", inviteeId, { inviter: inviter.telegram_user_id });
  return true;
}

export function setVoiceMode(telegramUserId: number, mode: "text" | "text_voice"): void {
  getDb()
    .prepare(`UPDATE bot_users SET voice_mode = ?, updated_at = ? WHERE telegram_user_id = ?`)
    .run(mode, nowIso(), telegramUserId);
}

export function setTimezoneOffset(telegramUserId: number, minutes: number): void {
  getDb()
    .prepare(
      `UPDATE bot_users SET
        timezone_offset_minutes = ?,
        timezone_asked_at = ?,
        timezone_source = 'user',
        updated_at = ?
       WHERE telegram_user_id = ?`
    )
    .run(minutes, nowIso(), nowIso(), telegramUserId);
  trackEvent("timezone_set", telegramUserId, { offset: minutes, source: "user" });
}

/** Soft-skip TZ prompt after first spread; keep default Moscow. */
export function skipTimezonePrompt(telegramUserId: number): void {
  getDb()
    .prepare(
      `UPDATE bot_users SET timezone_asked_at = COALESCE(timezone_asked_at, ?), updated_at = ?
       WHERE telegram_user_id = ?`
    )
    .run(nowIso(), nowIso(), telegramUserId);
  trackEvent("timezone_skip", telegramUserId, {});
}

/** True when user still on default TZ and has not answered/skipped the soft prompt. */
export function needsSoftTimezonePrompt(user: BotUser): boolean {
  if (user.timezone_source === "user") return false;
  if (user.timezone_asked_at) return false;
  return true;
}

export function needsUserTimezoneForReminders(user: BotUser): boolean {
  return user.timezone_source !== "user";
}

export function formatTimezoneLabel(user: BotUser): string {
  const mins = user.timezone_offset_minutes ?? 180;
  const hours = mins / 60;
  const sign = hours >= 0 ? "+" : "";
  const source =
    user.timezone_source === "user"
      ? "выбран вами"
      : "по умолчанию (Москва)";
  return `UTC${sign}${hours} · ${source}`;
}

export function setUnsubscribed(telegramUserId: number): void {
  getDb()
    .prepare(
      `UPDATE bot_users SET unsubscribed_at = ?, reminder_mode = 'off', updated_at = ? WHERE telegram_user_id = ?`
    )
    .run(nowIso(), nowIso(), telegramUserId);
}

export function localHourForUser(user: BotUser): number {
  const offset = user.timezone_offset_minutes;
  if (offset == null) {
    return Number(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: botConfig.timezone,
        hour: "numeric",
        hour12: false,
      })
        .formatToParts(new Date())
        .find((p) => p.type === "hour")?.value ?? "0"
    );
  }
  const utc = new Date();
  const local = new Date(utc.getTime() + offset * 60_000);
  return local.getUTCHours();
}

export function metricsSummary(): Record<string, number> {
  const day = todayInTz();
  const count = (name: string) => {
    const row = getDb()
      .prepare(
        `SELECT COUNT(*) AS c FROM bot_events WHERE name = ? AND substr(created_at,1,10) = ?`
      )
      .get(name, day) as { c: number };
    return row.c;
  };
  return {
    users_new: (
      getDb()
        .prepare(`SELECT COUNT(*) AS c FROM bot_users WHERE substr(created_at,1,10) = ?`)
        .get(day) as { c: number }
    ).c,
    spreads: (
      getDb()
        .prepare(`SELECT COUNT(*) AS c FROM bot_guest_sessions WHERE substr(created_at,1,10) = ?`)
        .get(day) as { c: number }
    ).c,
    cta_click: count("cta_click"),
    cta_sent: count("cta_sent"),
    receipt_claimed: count("receipt_claimed"),
    teaser_shown: count("teaser_shown"),
    ritual_completed: count("ritual_completed"),
    crisis_detected: count("crisis_detected"),
    voice_sent: count("voice_sent"),
    voice_failed: count("voice_failed"),
  };
}
