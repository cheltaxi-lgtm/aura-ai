import { Bot } from "grammy";
import { botConfig } from "../config.js";
import { copy } from "../copy/ru.js";
import {
  abandonedFlows,
  countSessionsSince,
  isoWeekKey,
  localHourForUser,
  markReminderSent,
  reminderAlreadySent,
  trackEvent,
  usersForReactivation,
  usersForReminder,
  usersForWeeklyDigest,
} from "../db/repos.js";
import { isRemindersEnabled, isWeeklyDigestEnabled } from "../flags.js";
import { reactivationKeyboard } from "../keyboards/index.js";
import { withBlockDetect } from "../middleware/stack.js";

export async function runReminderTick(bot: Bot): Promise<void> {
  if (isRemindersEnabled()) {
    for (const mode of ["morning", "evening"] as const) {
      const users = usersForReminder(mode);
      for (const u of users) {
        if (u.unsubscribed_at) continue;
        const hour = localHourForUser(u);
        const target = mode === "morning" ? u.reminder_hour ?? 9 : u.reminder_hour ?? 20;
        if (hour !== target) continue;
        if (reminderAlreadySent(u.telegram_user_id, mode)) continue;
        const text = mode === "morning" ? copy.reminderMorning : copy.reminderEvening;
        await withBlockDetect(async () => {
          await bot.api.sendMessage(u.chat_id, text);
          markReminderSent(u.telegram_user_id, mode);
          trackEvent("reminder_sent", u.telegram_user_id, { kind: mode });
        }, u.telegram_user_id);
      }
    }

    const abandoned = abandonedFlows(botConfig.abandonedHours * 3600_000);
    for (const row of abandoned) {
      if (reminderAlreadySent(row.telegram_user_id, "abandoned")) continue;
      await withBlockDetect(async () => {
        await bot.api.sendMessage(row.chat_id, copy.abandoned);
        markReminderSent(row.telegram_user_id, "abandoned");
        trackEvent("reminder_sent", row.telegram_user_id, { kind: "abandoned" });
      }, row.telegram_user_id);
    }

    // Reactivation 7/14/30 — SQL-scoped, not a blind listUsers scan.
    for (const d of [7, 14, 30]) {
      for (const u of usersForReactivation(d)) {
        const kind = `reactivation_${d}`;
        if (reminderAlreadySent(u.telegram_user_id, kind)) continue;
        await withBlockDetect(async () => {
          await bot.api.sendMessage(u.chat_id, copy.reactivation(d), {
            reply_markup: reactivationKeyboard(),
          });
          markReminderSent(u.telegram_user_id, kind);
          trackEvent("reactivation_sent", u.telegram_user_id, { days: d });
        }, u.telegram_user_id);
      }
    }
  }

  await runWeeklyDigestTick(bot);
}

/** Sunday ~11:00 local (user offset): short weekly digest when flag enabled. */
export async function runWeeklyDigestTick(bot: Bot): Promise<void> {
  if (!isWeeklyDigestEnabled()) return;

  const week = isoWeekKey();
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();

  for (const u of usersForWeeklyDigest()) {
    const hour = localHourForUser(u);
    const local = new Date(Date.now() + (u.timezone_offset_minutes ?? 180) * 60_000);
    if (local.getUTCDay() !== 0 || hour !== 11) continue;

    const kind = `digest_${week}`;
    if (reminderAlreadySent(u.telegram_user_id, kind)) continue;

    const spreads = countSessionsSince(u.telegram_user_id, weekAgo);
    await withBlockDetect(async () => {
      await bot.api.sendMessage(
        u.chat_id,
        copy.weeklyDigest({ streak: u.streak_days ?? 0, spreads })
      );
      markReminderSent(u.telegram_user_id, kind);
      trackEvent("digest_sent", u.telegram_user_id, { week });
    }, u.telegram_user_id);
  }
}
