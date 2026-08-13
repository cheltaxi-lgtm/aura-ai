import { query } from "@/lib/db";
import { dispatchNotification } from "@/lib/notify";
import { dailyReminderEmailHtml, sendEmail } from "@/lib/email/send";
import { checkTripletCooldown } from "@/lib/triplet-limit-server";

/** Authenticated 3-cards-of-the-day flow (not daily energy, not guest redraw). */
export const DAILY_CARDS_REMINDER_CTA = "/?dailyCards=1";

export type NotificationPrefs = {
  dailyEmail: boolean;
  dailyInApp: boolean;
  /** Hour in Europe/Moscow (0–23). Default 9:00. */
  reminderHourMsk: number;
  /** Evening email when daily rune bonus is claimable. */
  bonusEmail: boolean;
  /** Win-back emails for inactive users (requires marketing_consent). */
  marketingEmail: boolean;
  /** Transactional "paid report is ready" email. Default on. */
  reportReadyEmail: boolean;
  /** Transactional "paid report is ready" Telegram DM. Default on. */
  reportReadyTelegram: boolean;
};

const DEFAULT_PREFS: NotificationPrefs = {
  dailyEmail: true,
  dailyInApp: true,
  reminderHourMsk: 9,
  bonusEmail: true,
  marketingEmail: true,
  reportReadyEmail: true,
  reportReadyTelegram: true,
};

export function parseNotificationPrefs(raw: unknown): NotificationPrefs {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_PREFS };
  const o = raw as Record<string, unknown>;
  let reminderHourMsk = DEFAULT_PREFS.reminderHourMsk;
  if (typeof o.reminderHourMsk === "number" && o.reminderHourMsk >= 0 && o.reminderHourMsk <= 23) {
    reminderHourMsk = o.reminderHourMsk;
  } else if (typeof o.reminderHourUtc === "number" && o.reminderHourUtc >= 0 && o.reminderHourUtc <= 23) {
    reminderHourMsk = (o.reminderHourUtc + 3) % 24;
  }
  return {
    dailyEmail: o.dailyEmail !== false,
    dailyInApp: o.dailyInApp !== false,
    reminderHourMsk,
    bonusEmail: o.bonusEmail !== false,
    marketingEmail: o.marketingEmail !== false,
    reportReadyEmail: o.reportReadyEmail !== false,
    reportReadyTelegram: o.reportReadyTelegram !== false,
  };
}

export async function getNotificationPrefs(userId: string): Promise<NotificationPrefs> {
  const res = await query<{ notification_prefs: unknown }>(
    `SELECT notification_prefs FROM users WHERE id = $1 LIMIT 1`,
    [userId]
  );
  return parseNotificationPrefs(res.rows[0]?.notification_prefs);
}

export async function updateNotificationPrefs(
  userId: string,
  patch: Partial<NotificationPrefs>
): Promise<NotificationPrefs> {
  const current = await getNotificationPrefs(userId);
  const next = { ...current, ...patch };
  await query(`UPDATE users SET notification_prefs = $2::jsonb WHERE id = $1`, [
    userId,
    JSON.stringify(next),
  ]);
  return next;
}

export type DailyCardsReminderDeliveryPlan = {
  inApp: boolean;
  email: boolean;
};

/**
 * Master gate = user_accounts.daily_cards_reminder.
 * dailyEmail / dailyInApp are channel prefs only.
 * cooldownAllowed = P0 checkTripletCooldown (daily_triplet / lastDailyTripletDrawAt).
 */
export function resolveDailyCardsReminderDelivery(input: {
  dailyCardsReminder: boolean;
  cooldownAllowed: boolean;
  dailyInApp: boolean;
  dailyEmail: boolean;
  hasEmail: boolean;
  alreadySentInApp: boolean;
  alreadySentEmail: boolean;
}): DailyCardsReminderDeliveryPlan {
  if (!input.dailyCardsReminder || !input.cooldownAllowed) {
    return { inApp: false, email: false };
  }
  return {
    inApp: input.dailyInApp === true && !input.alreadySentInApp,
    email: input.dailyEmail === true && input.hasEmail && !input.alreadySentEmail,
  };
}

/** Opted-in accounts at this MSK hour with at least one channel pref on. */
export async function getDailyReminderCandidates(hourMsk: number): Promise<
  Array<{
    userId: string;
    name: string;
    email: string | null;
    prefs: NotificationPrefs;
    dailyCardsReminder: boolean;
  }>
> {
  const res = await query<{
    user_id: string;
    name: string;
    email: string | null;
    notification_prefs: unknown;
    daily_cards_reminder: boolean;
  }>(
    `SELECT u.id AS user_id, u.name, ua.email, u.notification_prefs, ua.daily_cards_reminder
     FROM users u
     INNER JOIN user_accounts ua ON ua.profile_user_id = u.id
     WHERE ua.daily_cards_reminder = TRUE
     AND (
       COALESCE((u.notification_prefs->>'dailyEmail')::boolean, true) = true
       OR COALESCE((u.notification_prefs->>'dailyInApp')::boolean, true) = true
     )
     AND COALESCE(
       (u.notification_prefs->>'reminderHourMsk')::int,
       CASE
         WHEN (u.notification_prefs->>'reminderHourUtc') IS NOT NULL
         THEN ((u.notification_prefs->>'reminderHourUtc')::int + 3) % 24
         ELSE 9
       END
     ) = $1`,
    [hourMsk]
  );

  return res.rows.map((row) => ({
    userId: row.user_id,
    name: row.name,
    email: row.email,
    prefs: parseNotificationPrefs(row.notification_prefs),
    dailyCardsReminder: Boolean(row.daily_cards_reminder),
  }));
}

/** True if a reminder was already logged in this availability window (since last daily draw). */
export async function alreadySentThisAvailabilityWindow(
  userId: string,
  channel: "in_app" | "email",
  lastDailyAt: string | null
): Promise<boolean> {
  if (lastDailyAt) {
    const res = await query(
      `SELECT 1 FROM daily_reminder_log
       WHERE user_id = $1 AND channel = $2 AND created_at > $3::timestamptz
       LIMIT 1`,
      [userId, channel, lastDailyAt]
    );
    return res.rows.length > 0;
  }
  const res = await query(
    `SELECT 1 FROM daily_reminder_log WHERE user_id = $1 AND channel = $2 LIMIT 1`,
    [userId, channel]
  );
  return res.rows.length > 0;
}

/** Claim calendar-day slot first so cron retries cannot double-insert. */
async function claimReminderSlot(
  userId: string,
  channel: "in_app" | "email"
): Promise<boolean> {
  const { rowCount } = await query(
    `INSERT INTO daily_reminder_log (user_id, channel) VALUES ($1, $2)
     ON CONFLICT (user_id, sent_date, channel) DO NOTHING`,
    [userId, channel]
  );
  return (rowCount ?? 0) > 0;
}

export async function sendDailyRemindersForHour(hourMsk: number): Promise<{
  inApp: number;
  email: number;
}> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://zovus.ru";
  const candidates = await getDailyReminderCandidates(hourMsk);
  let inApp = 0;
  let email = 0;

  for (const user of candidates) {
    const cooldown = await checkTripletCooldown(user.userId);
    const alreadySentInApp = await alreadySentThisAvailabilityWindow(
      user.userId,
      "in_app",
      cooldown.lastTripletAt
    );
    const alreadySentEmail = await alreadySentThisAvailabilityWindow(
      user.userId,
      "email",
      cooldown.lastTripletAt
    );
    const plan = resolveDailyCardsReminderDelivery({
      dailyCardsReminder: user.dailyCardsReminder,
      cooldownAllowed: cooldown.allowed,
      dailyInApp: user.prefs.dailyInApp,
      dailyEmail: user.prefs.dailyEmail,
      hasEmail: Boolean(user.email),
      alreadySentInApp,
      alreadySentEmail,
    });

    if (plan.inApp && (await claimReminderSlot(user.userId, "in_app"))) {
      await dispatchNotification({
        userId: user.userId,
        type: "daily_reading_reminder",
        title: "Карты дня ждут вас",
        body: "Откройте 3 карты дня — узнайте энергию сегодняшнего дня.",
        ctaPath: DAILY_CARDS_REMINDER_CTA,
        ctaLabel: "Открыть карты дня",
      });
      inApp++;
    }

    if (plan.email && user.email && (await claimReminderSlot(user.userId, "email"))) {
      const sent = await sendEmail({
        to: user.email,
        subject: "Zovus — ваш расклад на сегодня",
        html: dailyReminderEmailHtml(user.name, siteUrl),
        text: `${user.name}, откройте 3 карты дня: ${siteUrl}${DAILY_CARDS_REMINDER_CTA}`,
        template: "daily_reminder",
      });
      if (sent) {
        email++;
      } else {
        await query(
          `DELETE FROM daily_reminder_log
           WHERE user_id = $1 AND channel = 'email' AND sent_date = CURRENT_DATE`,
          [user.userId]
        );
      }
    }
  }

  return { inApp, email };
}
