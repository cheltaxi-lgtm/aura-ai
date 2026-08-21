import { query } from "@/lib/db";
import { dispatchNotification } from "@/lib/notify";
import { dailyReminderEmailHtml, sendEmail } from "@/lib/email/send";
import { getSiteUrl, pickDeliverableEmail } from "@/lib/email/mail-config";
import { ACCOUNT_DELIVERABLE_EMAIL_SQL } from "@/lib/reminder-contacts";
import { reminderUnsubscribeUrl } from "@/lib/reminder-unsubscribe";
import { notifyBotReminder } from "@/lib/telegram/notify-bot-reminder";
import { checkTripletCooldown } from "@/lib/triplet-limit-server";

/** Authenticated 3-cards-of-the-day flow (not daily energy, not guest redraw). */
export const DAILY_CARDS_REMINDER_CTA = "/?dailyCards=1";

export type NotificationPrefs = {
  dailyEmail: boolean;
  dailyInApp: boolean;
  /** Daily-cards reminder via linked Telegram bot. Default on. */
  dailyTelegram: boolean;
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
  /**
   * Permission only — no sender in this change.
   * Missing / false = not granted. Never infer true.
   */
  weeklyDigestEmail: boolean;
  /** Server-authoritative quiet window after opt-in shown/declined. */
  retentionOptInQuietUntil: string | null;
};

const DEFAULT_PREFS: NotificationPrefs = {
  dailyEmail: true,
  dailyInApp: true,
  dailyTelegram: true,
  reminderHourMsk: 6,
  bonusEmail: true,
  marketingEmail: true,
  reportReadyEmail: true,
  reportReadyTelegram: true,
  weeklyDigestEmail: false,
  retentionOptInQuietUntil: null,
};

function parseIsoOrNull(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

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
    dailyTelegram: o.dailyTelegram !== false,
    reminderHourMsk,
    bonusEmail: o.bonusEmail !== false,
    marketingEmail: o.marketingEmail !== false,
    reportReadyEmail: o.reportReadyEmail !== false,
    reportReadyTelegram: o.reportReadyTelegram !== false,
    weeklyDigestEmail: o.weeklyDigestEmail === true,
    retentionOptInQuietUntil: parseIsoOrNull(o.retentionOptInQuietUntil),
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
  telegram: boolean;
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
  dailyTelegram: boolean;
  hasEmail: boolean;
  hasTelegram: boolean;
  alreadySentInApp: boolean;
  alreadySentEmail: boolean;
  alreadySentTelegram: boolean;
}): DailyCardsReminderDeliveryPlan {
  if (!input.dailyCardsReminder || !input.cooldownAllowed) {
    return { inApp: false, email: false, telegram: false };
  }
  return {
    inApp: input.dailyInApp === true && !input.alreadySentInApp,
    email: input.dailyEmail === true && input.hasEmail && !input.alreadySentEmail,
    telegram:
      input.dailyTelegram === true && input.hasTelegram === true && !input.alreadySentTelegram,
  };
}

/** Opted-in accounts at this MSK hour with at least one channel pref on. */
export async function getDailyReminderCandidates(hourMsk: number): Promise<
  Array<{
    userId: string;
    accountId: string;
    name: string;
    email: string | null;
    telegramUserId: number | null;
    prefs: NotificationPrefs;
    dailyCardsReminder: boolean;
  }>
> {
  const res = await query<{
    user_id: string;
    account_id: string;
    name: string;
    deliverable_email: string | null;
    telegram_user_id: string | null;
    notification_prefs: unknown;
    daily_cards_reminder: boolean;
  }>(
    `SELECT u.id AS user_id, ua.id AS account_id, u.name,
            (${ACCOUNT_DELIVERABLE_EMAIL_SQL}) AS deliverable_email,
            ti.telegram_user_id::text,
            u.notification_prefs, ua.daily_cards_reminder
     FROM users u
     INNER JOIN user_accounts ua ON ua.profile_user_id = u.id
     LEFT JOIN user_telegram_identities ti ON ti.user_account_id = ua.id
     WHERE ua.daily_cards_reminder = TRUE
     AND (
       COALESCE((u.notification_prefs->>'dailyEmail')::boolean, true) = true
       OR COALESCE((u.notification_prefs->>'dailyInApp')::boolean, true) = true
       OR ti.telegram_user_id IS NOT NULL
     )
     AND COALESCE(
       (u.notification_prefs->>'reminderHourMsk')::int,
       CASE
         WHEN (u.notification_prefs->>'reminderHourUtc') IS NOT NULL
         THEN ((u.notification_prefs->>'reminderHourUtc')::int + 3) % 24
         ELSE 6
       END
     ) = $1`,
    [hourMsk]
  );

  return res.rows.map((row) => {
    const tg = row.telegram_user_id ? Number(row.telegram_user_id) : NaN;
    return {
      userId: row.user_id,
      accountId: row.account_id,
      name: row.name,
      email: pickDeliverableEmail(row.deliverable_email),
      telegramUserId: Number.isInteger(tg) && tg > 0 ? tg : null,
      prefs: parseNotificationPrefs(row.notification_prefs),
      dailyCardsReminder: Boolean(row.daily_cards_reminder),
    };
  });
}

/**
 * True if a reminder was already logged today.
 * Availability re-opens every day while the user has not drawn — dedupe is per
 * calendar day; claimReminderSlot enforces the same slot atomically.
 */
export async function alreadySentReminderToday(
  userId: string,
  channel: "in_app" | "email" | "telegram"
): Promise<boolean> {
  const res = await query(
    `SELECT 1 FROM daily_reminder_log
     WHERE user_id = $1 AND channel = $2 AND sent_date = CURRENT_DATE
     LIMIT 1`,
    [userId, channel]
  );
  return res.rows.length > 0;
}

/** Claim calendar-day slot first so cron retries cannot double-insert. */
async function claimReminderSlot(
  userId: string,
  channel: "in_app" | "email" | "telegram"
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
  telegram: number;
}> {
  const siteUrl = getSiteUrl();
  const candidates = await getDailyReminderCandidates(hourMsk);
  let inApp = 0;
  let email = 0;
  let telegram = 0;

  for (const user of candidates) {
    const cooldown = await checkTripletCooldown(user.userId);
    const alreadySentInApp = await alreadySentReminderToday(user.userId, "in_app");
    const alreadySentEmail = await alreadySentReminderToday(user.userId, "email");
    const alreadySentTelegram = await alreadySentReminderToday(user.userId, "telegram");
    const plan = resolveDailyCardsReminderDelivery({
      dailyCardsReminder: user.dailyCardsReminder,
      cooldownAllowed: cooldown.allowed,
      dailyInApp: user.prefs.dailyInApp,
      dailyEmail: user.prefs.dailyEmail,
      dailyTelegram: user.prefs.dailyTelegram,
      hasEmail: Boolean(user.email),
      hasTelegram: user.telegramUserId != null,
      alreadySentInApp,
      alreadySentEmail,
      alreadySentTelegram,
    });

    if (plan.inApp && (await claimReminderSlot(user.userId, "in_app"))) {
      await dispatchNotification({
        userId: user.userId,
        type: "daily_reading_reminder",
        title: "Карты дня ждут вас",
        body: "Откройте расклад на сутки — узнайте энергию сегодняшнего дня.",
        ctaPath: DAILY_CARDS_REMINDER_CTA,
        ctaLabel: "Открыть карты дня",
      });
      inApp++;
    }

    if (plan.email && user.email && (await claimReminderSlot(user.userId, "email"))) {
      const unsub = await reminderUnsubscribeUrl(user.accountId, "daily_cards");
      const sent = await sendEmail({
        to: user.email,
        subject: "Zovus — ваш расклад на сегодня",
        html: dailyReminderEmailHtml(user.name, siteUrl, unsub),
        text: `${user.name}, откройте расклад на сутки: ${siteUrl}${DAILY_CARDS_REMINDER_CTA}\nОтключить: ${unsub}`,
        template: "daily_reminder",
        listUnsubscribeUrl: unsub,
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

    if (
      plan.telegram &&
      user.telegramUserId != null &&
      (await claimReminderSlot(user.userId, "telegram"))
    ) {
      const unsub = await reminderUnsubscribeUrl(user.accountId, "daily_cards");
      const sent = await notifyBotReminder({
        telegramUserId: user.telegramUserId,
        kind: "daily_cards",
        title: "Карты дня ждут вас",
        body: "Бесплатный расклад на сутки готов. Откройте, когда будет минута.",
        ctaUrl: `${siteUrl}${DAILY_CARDS_REMINDER_CTA}`,
        ctaLabel: "Открыть карты дня",
        unsubscribeUrl: unsub,
      });
      if (sent.delivered) {
        telegram++;
      } else {
        await query(
          `DELETE FROM daily_reminder_log
           WHERE user_id = $1 AND channel = 'telegram' AND sent_date = CURRENT_DATE`,
          [user.userId]
        );
      }
    }
  }

  return { inApp, email, telegram };
}
