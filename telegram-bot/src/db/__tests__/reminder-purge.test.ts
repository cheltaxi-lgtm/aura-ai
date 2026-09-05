/**
 * Reminder dedupe + purge hygiene tests. Run via: npm test
 */
import { getDb, migrate } from "../client.js";
import { ensureCriticalColumns, migrateUp } from "../migrate-runner.js";
import {
  claimUpdate,
  completeUpdate,
  markUpdateIrreversible,
  heartbeatUpdate,
  confirmAge,
  confirmConsent,
  createGuestSession,
  deleteUserData,
  findSessionById,
  getUser,
  markReminderSent,
  purgeExpiredGuestSessions,
  purgeProcessedUpdates,
  reminderSentWithinDays,
  setZovusUserId,
  upsertUser,
  usersForReactivation,
} from "../repos.js";
import { SPREAD_QUESTION_STEPS } from "../../flows/spread-steps.js";
import { createSessionToken, hashSessionToken } from "../../domain/session/token.js";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

function seedUser(uid: number) {
  upsertUser({ telegramUserId: uid, chatId: uid, firstName: "T" });
  confirmAge(uid);
  confirmConsent(uid);
  return getUser(uid)!;
}

function makeSession(uid: number, sid: string) {
  const tok = createSessionToken();
  createGuestSession({
    id: sid,
    telegramUserId: uid,
    question: "Вопрос для очистки старый",
    cards: [{ id: 1, name: "A", reversed: false, position: 0 }],
    teaserText: "тизер",
    teaserPromptVersion: "a",
    teaserModel: "a",
    teaserSeed: "a",
    tokenHash: hashSessionToken(tok),
    plainToken: tok,
    fingerprint: `fp-${sid}`,
    questionSource: "chip",
  });
}

function backdateSession(sid: string, fields: { expires_at?: string; claimed_at?: string }): void {
  const db = getDb();
  if (fields.expires_at) {
    db.prepare(`UPDATE bot_guest_sessions SET expires_at = ? WHERE id = ?`).run(
      fields.expires_at,
      sid
    );
  }
  if (fields.claimed_at) {
    db.prepare(`UPDATE bot_guest_sessions SET claimed_at = ? WHERE id = ?`).run(
      fields.claimed_at,
      sid
    );
  }
}

function main(): void {
  migrate();
  migrateUp();
  ensureCriticalColumns();

  // (1) spread question steps: both catalog entry and free-text prompt accept text
  {
    assert(SPREAD_QUESTION_STEPS.has("await_question"), "steps: await_question accepted");
    assert(SPREAD_QUESTION_STEPS.has("await_free_text"), "steps: await_free_text accepted");
    assert(!SPREAD_QUESTION_STEPS.has("drawing"), "steps: drawing must not accept text");
  }

  // (2) reminderSentWithinDays: matrix follow-up must not re-send inside the window
  {
    const uid = 920_001;
    deleteUserData(uid);
    seedUser(uid);
    const kind = "matrix_period_d7";
    assert(!reminderSentWithinDays(uid, kind, 4), "reminder: none yet");
    markReminderSent(uid, kind);
    assert(reminderSentWithinDays(uid, kind, 4), "reminder: seen within 4d");
    assert(!reminderSentWithinDays(uid, "other_kind", 4), "reminder: other kind unseen");
    // Backdate the log row by 5 days → outside the 4-day suppression window.
    const fiveDaysAgo = new Date(Date.now() - 5 * 86_400_000).toISOString();
    getDb()
      .prepare(`UPDATE bot_reminder_log SET created_at = ? WHERE telegram_user_id = ? AND kind = ?`)
      .run(fiveDaysAgo, uid, kind);
    assert(!reminderSentWithinDays(uid, kind, 4), "reminder: 5d old is outside 4d window");
    assert(reminderSentWithinDays(uid, kind, 6), "reminder: 5d old is inside 6d window");
    deleteUserData(uid);
  }

  // (3) purgeProcessedUpdates: old rows go, fresh rows stay
  {
    const freshId = 921_000_001;
    const staleId = 921_000_002;
    getDb().prepare(`DELETE FROM bot_processed_updates WHERE update_id IN (?, ?)`).run(freshId, staleId);
    assert(claimUpdate(freshId), "updates: fresh claimed");
    assert(claimUpdate(staleId), "updates: stale claimed");
    const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000).toISOString();
    getDb()
      .prepare(`UPDATE bot_processed_updates SET processed_at = ? WHERE update_id = ?`)
      .run(tenDaysAgo, staleId);
    const n = purgeProcessedUpdates();
    assert(n >= 1, "updates: at least the stale row purged");
    const stale = getDb()
      .prepare(`SELECT 1 AS ok FROM bot_processed_updates WHERE update_id = ?`)
      .get(staleId);
    const fresh = getDb()
      .prepare(`SELECT 1 AS ok FROM bot_processed_updates WHERE update_id = ?`)
      .get(freshId);
    assert(!stale, "updates: stale gone");
    assert(Boolean(fresh), "updates: fresh kept");
    getDb().prepare(`DELETE FROM bot_processed_updates WHERE update_id = ?`).run(freshId);
  }

  // (4) purgeExpiredGuestSessions: grace window + claimed rows preserved
  {
    const uid = 920_004;
    deleteUserData(uid);
    seedUser(uid);
    const hourAgo = new Date(Date.now() - 3600_000).toISOString();
    const eightDaysAgo = new Date(Date.now() - 8 * 86_400_000).toISOString();

    makeSession(uid, "purge-grace");
    backdateSession("purge-grace", { expires_at: hourAgo });

    makeSession(uid, "purge-old");
    backdateSession("purge-old", { expires_at: eightDaysAgo });

    makeSession(uid, "purge-claimed");
    backdateSession("purge-claimed", { expires_at: eightDaysAgo, claimed_at: eightDaysAgo });

    const purged = purgeExpiredGuestSessions();
    assert(purged >= 1, "purge: old unclaimed removed");
    assert(
      Boolean(findSessionById("purge-grace")),
      "purge: recently expired kept (CTA «Срок истёк» UX)"
    );
    assert(!findSessionById("purge-old"), "purge: 8d expired unclaimed gone");
    assert(
      Boolean(findSessionById("purge-claimed")),
      "purge: claimed rows preserved for admin metrics"
    );
    deleteUserData(uid);
  }

  // (5) processed-update lease: crashed work can be recovered after timeout,
  // while a live claim remains idempotently suppressed.
  {
    const liveId = 921_000_003;
    const crashedId = 921_000_004;
    getDb().prepare(`DELETE FROM bot_processed_updates WHERE update_id IN (?, ?)`).run(liveId, crashedId);
    assert(claimUpdate(liveId), "updates: live claimed");
    assert(!claimUpdate(liveId), "updates: live duplicate suppressed");
    assert(claimUpdate(crashedId), "updates: crashed initial claim");
    const old = new Date(Date.now() - 16 * 60_000).toISOString();
    getDb().prepare(`UPDATE bot_processed_updates SET processed_at = ? WHERE update_id = ?`).run(old, crashedId);
    assert(claimUpdate(crashedId), "updates: stale lease recovered");
    completeUpdate(crashedId);
    getDb().prepare(`UPDATE bot_processed_updates SET processed_at = ? WHERE update_id = ?`).run(old, crashedId);
    assert(!claimUpdate(crashedId), "updates: completed action never replays after lease timeout");
    markUpdateIrreversible(liveId);
    getDb().prepare(`UPDATE bot_processed_updates SET processed_at = ? WHERE update_id = ?`).run(old, liveId);
    assert(!claimUpdate(liveId), "updates: irreversible action never replays after timeout");
    getDb().prepare(`DELETE FROM bot_processed_updates WHERE update_id IN (?, ?)`).run(liveId, crashedId);
    getDb().prepare(`INSERT INTO bot_processed_updates (update_id, processed_at) VALUES (?, ?)`).run(liveId, old);
    assert(!claimUpdate(liveId), "updates: legacy rows default to completed, not replayable");
    assert(claimUpdate(crashedId), "updates: heartbeat test claimed");
    getDb().prepare(`UPDATE bot_processed_updates SET processed_at = ? WHERE update_id = ?`).run(old, crashedId);
    heartbeatUpdate(crashedId);
    assert(!claimUpdate(crashedId), "updates: live heartbeat renews lease");
    getDb().prepare(`UPDATE bot_processed_updates SET owner_id = 'other-process' WHERE update_id = ?`).run(crashedId);
    let fenced = false;
    try { markUpdateIrreversible(crashedId); } catch { fenced = true; }
    assert(fenced, "updates: expired owner cannot start an irreversible action");
    getDb().prepare(`DELETE FROM bot_processed_updates WHERE update_id IN (?, ?)`).run(liveId, crashedId);
  }

  // (6) usersForReactivation: site-linked accounts excluded (site win-back owns them)
  {
    const uidFree = 920_005;
    const uidLinked = 920_006;
    deleteUserData(uidFree);
    deleteUserData(uidLinked);
    seedUser(uidFree);
    seedUser(uidLinked);
    const sevenDaysAgo = new Date(Date.now() - 7.5 * 86_400_000).toISOString();
    getDb()
      .prepare(`UPDATE bot_users SET last_active_at = ? WHERE telegram_user_id IN (?, ?)`)
      .run(sevenDaysAgo, uidFree, uidLinked);
    setZovusUserId(uidLinked, "site-user-linked-1");
    const picked = usersForReactivation(7).map((u) => u.telegram_user_id);
    assert(picked.includes(uidFree), "reactivation: unlinked inactive user picked");
    assert(!picked.includes(uidLinked), "reactivation: site-linked user excluded");
    markReminderSent(uidFree, "reactivation_7");
    assert(
      !usersForReactivation(7).some((u) => u.telegram_user_id === uidFree),
      "reactivation: sent users leave capped batch so later users progress"
    );
    deleteUserData(uidFree);
    deleteUserData(uidLinked);
  }

  console.log("ok: spread-steps / reminder-dedupe / purges / update-lease / reactivation-scope");
}

main();
