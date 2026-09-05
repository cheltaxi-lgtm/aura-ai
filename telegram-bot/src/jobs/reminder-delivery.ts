import { randomUUID } from "node:crypto";
import { getDb } from "../db/client.js";
import { getUser, markBlocked } from "../db/repos.js";
import { isRemindersEnabled, isWeeklyDigestEnabled } from "../flags.js";
import { withUserActivity } from "../middleware/activity.js";
import { isUserErasing } from "../domain/user-erasure.js";

const DAY = 86_400_000;
type Failure = { error_code?: number; parameters?: { retry_after?: number } };

/** Reserve before the network call. A lost response is never replayed automatically. */
export async function deliverReminder(
  telegramUserId: number,
  kind: string,
  send: () => Promise<void>,
): Promise<void> {
  if (isUserErasing(telegramUserId)) return;
  return withUserActivity(telegramUserId, () => deliverReminderActive(telegramUserId, kind, send));
}

async function deliverReminderActive(telegramUserId: number, kind: string, send: () => Promise<void>): Promise<void> {
  // Re-read after earlier network work (e.g. the HD daily fetch), immediately
  // before claiming and sending. No await separates this check and the claim.
  const user = getUser(telegramUserId);
  if (!user || user.blocked_at || user.banned_at || user.unsubscribed_at) return;
  if (kind.startsWith("digest_") ? !isWeeklyDigestEnabled() : !isRemindersEnabled()) return;
  if ((kind === "morning" || kind === "evening") && user.reminder_mode !== kind) return;
  const now = Date.now();
  const offset = (user.timezone_offset_minutes ?? 180) * 60_000;
  const nextLocalDay = (Math.floor((now + offset) / DAY) + 1) * DAY - offset;
  const suppressUntil = kind === "abandoned" ? now + 3 * DAY
    : kind === "matrix_period_d7" ? now + 4 * DAY
    : kind.startsWith("digest_") ? now + 8 * DAY
    : kind.startsWith("reactivation_") ? now + 2 * DAY : nextLocalDay;
  const owner = randomUUID();
  const db = getDb();
  let claimed = false;
  try {
    const claim = db.prepare(`INSERT INTO bot_reminder_delivery
    (telegram_user_id, kind, state, owner_id, attempts, retry_at, suppress_until, updated_at)
    SELECT ?, ?, 'sending', ?, 1, 0, ?, ?
    WHERE EXISTS (SELECT 1 FROM bot_users WHERE telegram_user_id = ?
      AND blocked_at IS NULL AND banned_at IS NULL AND (unsubscribed_at IS NULL OR unsubscribed_at = ''))
      AND NOT EXISTS (SELECT 1 FROM bot_user_erasure WHERE telegram_user_id = ? AND status != 'completed')
    ON CONFLICT(telegram_user_id, kind) DO UPDATE SET
      state = 'sending', owner_id = excluded.owner_id, updated_at = excluded.updated_at,
      retry_at = 0, suppress_until = excluded.suppress_until,
      attempts = CASE WHEN bot_reminder_delivery.suppress_until <= excluded.updated_at
        THEN 1 ELSE bot_reminder_delivery.attempts + 1 END
    WHERE bot_reminder_delivery.suppress_until <= excluded.updated_at
      OR (bot_reminder_delivery.state = 'retry' AND bot_reminder_delivery.retry_at <= excluded.updated_at
        AND bot_reminder_delivery.attempts < 3)`)
      .run(telegramUserId, kind, owner, suppressUntil, now, telegramUserId, telegramUserId);
    claimed = Number(claim.changes) === 1;
  } catch (err) {
    // Another process may hold SQLite's short writer lock. No delivery started,
    // so leave this recipient for a later tick without failing the batch.
    if ([5, 6].includes((err as { errcode?: number }).errcode ?? 0)) return;
    throw err;
  }
  if (!claimed) return;
  try {
    await send();
    db.prepare(`UPDATE bot_reminder_delivery SET state = 'sent', updated_at = ?
      WHERE telegram_user_id = ? AND kind = ? AND owner_id = ?`).run(Date.now(), telegramUserId, kind, owner);
  } catch (err) {
    const failure = err as Failure;
    // Only Telegram's explicit 429 is known not to have delivered the message.
    // Transport errors/timeouts and process death retain suppression, avoiding spam.
    const seconds = failure.parameters?.retry_after;
    const retry = failure.error_code === 429 && typeof seconds === "number" && Number.isFinite(seconds) && seconds >= 0;
    db.prepare(`UPDATE bot_reminder_delivery SET state = ?, retry_at = ?, updated_at = ?
      WHERE telegram_user_id = ? AND kind = ? AND owner_id = ?`)
      .run(retry ? "retry" : "uncertain", retry ? Date.now() + Math.max(1, seconds!) * 1000 : 0,
        Date.now(), telegramUserId, kind, owner);
    if (failure.error_code === 403) markBlocked(telegramUserId);
    console.error("[reminders] delivery deferred", { telegramUserId, kind, outcome: retry ? "retry_after" : "uncertain" });
  }
}
