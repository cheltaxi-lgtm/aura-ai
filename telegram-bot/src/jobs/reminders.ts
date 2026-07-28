import { Bot } from "grammy";
import { botConfig } from "../config.js";
import { copy } from "../copy/ru.js";
import {
  abandonedFlows,
  flagEnabled,
  listUsers,
  localHourForUser,
  markReminderSent,
  reminderAlreadySent,
  trackEvent,
  usersForReminder,
} from "../db/repos.js";
import { reactivationKeyboard } from "../keyboards/index.js";
import { withBlockDetect } from "../middleware/stack.js";

export async function runReminderTick(bot: Bot): Promise<void> {
  if (!flagEnabled("reminders_enabled", botConfig.flags.remindersEnabled)) return;

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

  // Reactivation 7/14/30
  const now = Date.now();
  for (const u of listUsers(500)) {
    if (u.unsubscribed_at || u.blocked_at || !u.last_active_at) continue;
    const days = Math.floor((now - new Date(u.last_active_at).getTime()) / 86400000);
    for (const d of [7, 14, 30]) {
      if (days !== d) continue;
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
