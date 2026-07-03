import { query } from "@/lib/db";
import { dispatchNotification } from "@/lib/notify";
import { dailyReminderEmailHtml, sendEmail } from "@/lib/email/send";

export type NotificationPrefs = {
  dailyEmail: boolean;
  dailyInApp: boolean;
  /** Hour in Europe/Moscow (0–23). Default 9:00. */
  reminderHourMsk: number;
};

const DEFAULT_PREFS: NotificationPrefs = {
  dailyEmail: true,
  dailyInApp: true,
  reminderHourMsk: 9,
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

/** Users who want a daily reminder at the current MSK hour and haven't drawn today. */
export async function getDailyReminderCandidates(hourMsk: number): Promise<
  Array<{
    userId: string;
    name: string;
    email: string | null;
    prefs: NotificationPrefs;
  }>
> {
  const res = await query<{
    user_id: string;
    name: string;
    email: string | null;
    notification_prefs: unknown;
  }>(
    `SELECT u.id AS user_id, u.name, ua.email, u.notification_prefs
     FROM users u
     LEFT JOIN user_accounts ua ON ua.profile_user_id = u.id
     WHERE (
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
     ) = $1
     AND NOT EXISTS (
       SELECT 1 FROM daily_readings dr
       WHERE dr.user_id = u.id AND dr.reading_date = CURRENT_DATE
     )`,
    [hourMsk]
  );

  return res.rows.map((row) => ({
    userId: row.user_id,
    name: row.name,
    email: row.email,
    prefs: parseNotificationPrefs(row.notification_prefs),
  }));
}

async function alreadySentToday(userId: string, channel: "in_app" | "email"): Promise<boolean> {
  const res = await query(
    `SELECT 1 FROM daily_reminder_log WHERE user_id = $1 AND sent_date = CURRENT_DATE AND channel = $2 LIMIT 1`,
    [userId, channel]
  );
  return res.rows.length > 0;
}

async function markSent(userId: string, channel: "in_app" | "email"): Promise<void> {
  await query(
    `INSERT INTO daily_reminder_log (user_id, channel) VALUES ($1, $2)
     ON CONFLICT (user_id, sent_date, channel) DO NOTHING`,
    [userId, channel]
  );
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
    if (user.prefs.dailyInApp && !(await alreadySentToday(user.userId, "in_app"))) {
      await dispatchNotification({
        userId: user.userId,
        type: "daily_reading_reminder",
        title: "Карты дня ждут вас",
        body: "Откройте расклад на сутки — узнайте энергию сегодняшнего дня.",
        ctaPath: "/?daily=1",
        ctaLabel: "Открыть карты дня",
      });
      await markSent(user.userId, "in_app");
      inApp++;
    }

    if (
      user.prefs.dailyEmail &&
      user.email &&
      !(await alreadySentToday(user.userId, "email"))
    ) {
      const sent = await sendEmail({
        to: user.email,
        subject: "Zovus — ваш расклад на сегодня",
        html: dailyReminderEmailHtml(user.name, siteUrl),
        text: `${user.name}, откройте расклад на сутки: ${siteUrl}/?daily=1`,
        template: "daily_reminder",
      });
      if (sent) {
        await markSent(user.userId, "email");
        email++;
      }
    }
  }

  return { inApp, email };
}
