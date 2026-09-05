import { Bot, InlineKeyboard } from "grammy";
import { botConfig } from "../config.js";
import { copy } from "../copy/ru.js";
import {
  abandonedFlows,
  countSessionsSince,
  isoWeekKey,
  localHourForUser,
  markReminderSent,
  reminderAlreadySent,
  reminderSentWithinDays,
  trackEvent,
  usersForMatrixPeriodFollowup,
  usersForReactivation,
  usersForReminder,
  usersForWeeklyDigest,
} from "../db/repos.js";
import { isRemindersEnabled, isWeeklyDigestEnabled } from "../flags.js";
import { CB, reactivationKeyboard } from "../keyboards/index.js";
import { deliverReminder } from "./reminder-delivery.js";
import { siteHdDaily } from "../domain/site-client.js";

async function safeReminder(fn: () => Promise<void>, telegramUserId: number, kind: string): Promise<void> {
  try {
    await deliverReminder(telegramUserId, kind, fn);
  } catch {
    // Persistent storage faults after acceptance preserve the claim; do not let
    // one recipient prevent the rest of this tick from being evaluated.
    console.error("[reminders] delivery state unavailable", { telegramUserId, kind });
  }
}

let reminderTickRunning = false;

export async function runReminderTick(bot: Bot): Promise<void> {
  if (reminderTickRunning) return;
  reminderTickRunning = true;
  try {
    await runReminderTickUnsafe(bot);
  } finally {
    reminderTickRunning = false;
  }
}

async function runReminderTickUnsafe(bot: Bot): Promise<void> {
  if (isRemindersEnabled()) {
    for (const mode of ["morning", "evening"] as const) {
      const users = usersForReminder(mode);
      for (const u of users) {
        if (u.unsubscribed_at) continue;
        const hour = localHourForUser(u);
        const target = mode === "morning" ? u.reminder_hour ?? 9 : u.reminder_hour ?? 20;
        if (hour !== target) continue;
        if (reminderAlreadySent(u.telegram_user_id, mode)) continue;
        let text: string = mode === "morning" ? copy.reminderMorning : copy.reminderEvening;
        if (mode === "morning") {
          // Best-effort HD transit digest; never blocks the base reminder.
          try {
            const { data } = await siteHdDaily(u.telegram_user_id);
            if (data.ok && Array.isArray(data.lines) && data.lines.length) {
              text = `${text}\n\n🧬 Дизайн Человека сегодня:\n${data.lines.join("\n")}`;
            }
          } catch {
            /* site bridge down — send base reminder */
          }
        }
        await safeReminder(async () => {
          await bot.api.sendMessage(u.chat_id, text);
          markReminderSent(u.telegram_user_id, mode);
          trackEvent("reminder_sent", u.telegram_user_id, { kind: mode });
        }, u.telegram_user_id, mode);
      }
    }

    const abandoned = abandonedFlows(botConfig.abandonedHours * 3600_000);
    for (const row of abandoned) {
      // A stale flow stays "abandoned" for days — nudge at most every 3 days.
      if (reminderSentWithinDays(row.telegram_user_id, "abandoned", 3)) continue;
      await safeReminder(async () => {
        await bot.api.sendMessage(row.chat_id, copy.abandoned);
        markReminderSent(row.telegram_user_id, "abandoned");
        trackEvent("reminder_sent", row.telegram_user_id, { kind: "abandoned" });
      }, row.telegram_user_id, "abandoned");
    }

    // Reactivation 7/14/30 — SQL-scoped, not a blind listUsers scan.
    const reactivationNow = Date.now();
    for (const d of [7, 14, 30]) {
      const kind = `reactivation_${d}`;
      let cursor = 0;
      while (true) {
        const page = usersForReactivation(d, 200, kind, cursor, reactivationNow);
        if (!page.length) break;
        for (const u of page) {
          cursor = u.telegram_user_id;
          if (reminderAlreadySent(u.telegram_user_id, kind)) continue;
          await safeReminder(async () => {
            await bot.api.sendMessage(u.chat_id, copy.reactivation(d), {
              reply_markup: reactivationKeyboard(),
            });
            markReminderSent(u.telegram_user_id, kind);
            trackEvent("reactivation_sent", u.telegram_user_id, { days: d });
          }, u.telegram_user_id, kind);
        }
      }
    }

    // Matrix period follow-up ~D7 after full report (free period node refresh).
    for (const u of usersForMatrixPeriodFollowup()) {
      const kind = "matrix_period_d7";
      // Selection window spans 2 days — suppress re-sends within it.
      if (reminderSentWithinDays(u.telegram_user_id, kind, 4)) continue;
      const kb = new InlineKeyboard()
        .text("📅 Узел периода", CB.mxPeriod)
        .row()
        .text("🗺 Зоны", CB.mxZones);
      await safeReminder(async () => {
        await bot.api.sendMessage(
          u.chat_id,
          "Через неделю после полной матрицы — обновите узел периода. Это бесплатно: что в фокусе сейчас и короткая практика на 7 дней.",
          { reply_markup: kb }
        );
        markReminderSent(u.telegram_user_id, kind);
        trackEvent("reminder_sent", u.telegram_user_id, { kind });
      }, u.telegram_user_id, kind);
    }
  }

  await runWeeklyDigestTick(bot);
}

/** Sunday ~11:00 local (user offset): short weekly digest when flag enabled. */
export async function runWeeklyDigestTick(bot: Bot): Promise<void> {
  if (!isWeeklyDigestEnabled()) return;

  const now = Date.now();
  const weekAgo = new Date(now - 7 * 86_400_000).toISOString();

  // At Sunday 11 local all supported offsets are in the same ISO week as UTC.
  const week = isoWeekKey(new Date(now));
  const kind = `digest_${week}`;
  let cursor = 0;
  while (true) {
    const page = usersForWeeklyDigest(500, kind, cursor);
    if (!page.length) break;
    for (const u of page) {
      cursor = u.telegram_user_id;
      const local = new Date(now + (u.timezone_offset_minutes ?? 180) * 60_000);
      if (local.getUTCDay() !== 0 || local.getUTCHours() !== 11) continue;

      if (reminderAlreadySent(u.telegram_user_id, kind)) continue;

      const spreads = countSessionsSince(u.telegram_user_id, weekAgo);
      await safeReminder(async () => {
        await bot.api.sendMessage(
          u.chat_id,
          copy.weeklyDigest({ streak: u.streak_days ?? 0, spreads })
        );
        markReminderSent(u.telegram_user_id, kind);
        trackEvent("digest_sent", u.telegram_user_id, { week });
      }, u.telegram_user_id, kind);
    }
  }
}
