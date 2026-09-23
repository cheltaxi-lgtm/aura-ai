import { query } from "@/lib/db";
import { dispatchNotification } from "@/lib/notify";
import { dailyReminderEmailHtml, sendEmail } from "@/lib/email/send";
import { getSiteUrl, pickDeliverableEmail } from "@/lib/email/mail-config";
import { ACCOUNT_DELIVERABLE_EMAIL_SQL } from "@/lib/reminder-contacts";
import { reminderUnsubscribeUrl } from "@/lib/reminder-unsubscribe";
import { notifyBotReminder } from "@/lib/telegram/notify-bot-reminder";
import { isDailyReadingUsedToday } from "@/lib/rate-limit-anchors";
import { PRODUCT_CALENDAR_TIMEZONE, productCalendarDate } from "@/lib/product-calendar";
import { finishProactiveContact, reserveProactiveContact } from "@/lib/proactive-contact-policy";

/** Canonical daily reading; old ?dailyCards=1 links remain accepted on the home page. */
export const DAILY_CARDS_REMINDER_CTA = "/?daily=1";

/** Hour in Europe/Moscow when prefs omit both reminderHourMsk and reminderHourUtc. */
export const DEFAULT_REMINDER_HOUR_MSK = 9;

export type NotificationPrefs = {
  dailyEmail: boolean;
  dailyInApp: boolean;
  /** Daily-cards reminder via linked Telegram bot. Explicit opt-in only. */
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
  dailyEmail: false,
  dailyInApp: false,
  dailyTelegram: false,
  reminderHourMsk: DEFAULT_REMINDER_HOUR_MSK,
  bonusEmail: false,
  marketingEmail: false,
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

function parseHour0to23(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isInteger(raw) && raw >= 0 && raw <= 23) return raw;
  if (typeof raw === "string" && /^(?:[0-9]|1[0-9]|2[0-3])$/.test(raw.trim())) {
    return Number(raw.trim());
  }
  return null;
}

/**
 * Convert a legacy UTC clock hour to the product timezone for the current UTC
 * date. Intl handles the timezone rules; no fixed offset is assumed.
 */
function legacyUtcHourInMoscow(utcHour: number, at: Date = new Date()): number {
  const utcDate = at.toISOString().slice(0, 10);
  const utcClock = String(utcHour).padStart(2, "0");
  const instant = new Date(`${utcDate}T${utcClock}:00:00.000Z`);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: PRODUCT_CALENDAR_TIMEZONE,
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  return Number(parts.find((part) => part.type === "hour")?.value);
}

export function parseNotificationPrefs(raw: unknown): NotificationPrefs {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_PREFS };
  const o = raw as Record<string, unknown>;
  const fromMsk = parseHour0to23(o.reminderHourMsk);
  const fromUtc = parseHour0to23(o.reminderHourUtc);
  const reminderHourMsk =
    fromMsk ?? (fromUtc != null ? legacyUtcHourInMoscow(fromUtc) : DEFAULT_PREFS.reminderHourMsk);
  return {
    dailyEmail: o.dailyEmail === true,
    dailyInApp: o.dailyInApp === true,
    dailyTelegram: o.dailyTelegram === true,
    reminderHourMsk,
    bonusEmail: o.bonusEmail === true,
    marketingEmail: o.marketingEmail === true,
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
  const res = await query<{ notification_prefs: unknown }>(
    `UPDATE users
        SET notification_prefs = COALESCE(notification_prefs, '{}'::jsonb) || $2::jsonb
      WHERE id = $1
      RETURNING notification_prefs`,
    [userId, JSON.stringify(patch)]
  );
  return parseNotificationPrefs(res.rows[0]?.notification_prefs);
}

export type DailyCardsReminderDeliveryPlan = {
  inApp: boolean;
  email: boolean;
  telegram: boolean;
};

/**
 * Master gate = user_accounts.daily_cards_reminder.
 * dailyEmail / dailyInApp are channel prefs only.
 * Availability comes from the canonical daily_readings row and purge anchor.
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

/**
 * Preferred reminder hour in Europe/Moscow.
 * Legacy reminderHourUtc 6 → 9 MSK. Missing both keys → DEFAULT_REMINDER_HOUR_MSK (9).
 */
const PREFERRED_HOUR_MSK_SQL = `COALESCE(
       (u.notification_prefs->>'reminderHourMsk')::int,
       CASE
         WHEN (u.notification_prefs->>'reminderHourUtc') IS NOT NULL
         THEN EXTRACT(HOUR FROM (
           (date_trunc('day', now() AT TIME ZONE 'UTC')
             + make_interval(hours => (u.notification_prefs->>'reminderHourUtc')::int))
           AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Moscow'
         ))::int
         ELSE ${DEFAULT_REMINDER_HOUR_MSK}
       END
     )`;

/** Opted-in accounts at this MSK hour with at least one channel pref on. Same-day catch-up after the preferred hour. */
export async function getDailyReminderCandidates(hourMsk: number, dailyDate = productCalendarDate()): Promise<
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
     CROSS JOIN LATERAL (
       SELECT ${PREFERRED_HOUR_MSK_SQL} AS hour_msk
     ) pref
     WHERE ua.daily_cards_reminder = TRUE
     AND (
       COALESCE((u.notification_prefs->>'dailyEmail')::boolean, false) = true
       OR COALESCE((u.notification_prefs->>'dailyInApp')::boolean, false) = true
       OR (ti.telegram_user_id IS NOT NULL AND COALESCE((u.notification_prefs->>'dailyTelegram')::boolean, false) = true)
     )
     AND (
       pref.hour_msk = $1
       OR (
         pref.hour_msk < $1
         AND NOT EXISTS (
           SELECT 1 FROM daily_reminder_log l
           WHERE l.user_id = u.id AND l.sent_date = $2::date
         )
       )
     )`,
    [hourMsk, dailyDate]
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
  channel: "in_app" | "email" | "telegram",
  dailyDate = productCalendarDate()
): Promise<boolean> {
  const res = await query(
    `SELECT 1 FROM daily_reminder_log
     WHERE user_id = $1 AND channel = $2 AND sent_date = $3::date
     LIMIT 1`,
    [userId, channel, dailyDate]
  );
  return res.rows.length > 0;
}

/** Claim calendar-day slot first so cron retries cannot double-insert. */
async function claimReminderSlot(
  userId: string,
  channel: "in_app" | "email" | "telegram",
  dailyDate: string
): Promise<boolean> {
  const { rowCount } = await query(
    `INSERT INTO daily_reminder_log (user_id, channel, sent_date) VALUES ($1, $2, $3::date)
     ON CONFLICT (user_id, sent_date, channel) DO NOTHING`,
    [userId, channel, dailyDate]
  );
  return (rowCount ?? 0) > 0;
}

export async function sendDailyRemindersForHour(hourMsk: number): Promise<{
  inApp: number;
  email: number;
  telegram: number;
}> {
  const siteUrl = getSiteUrl();
  const dailyDate = productCalendarDate();
  const candidates = await getDailyReminderCandidates(hourMsk, dailyDate);
  let inApp = 0;
  let email = 0;
  let telegram = 0;

  for (const user of candidates) {
    const dailyReading = await isDailyReadingUsedToday(user.userId, dailyDate);
    const alreadySentInApp = await alreadySentReminderToday(user.userId, "in_app", dailyDate);
    const alreadySentEmail = await alreadySentReminderToday(user.userId, "email", dailyDate);
    const alreadySentTelegram = await alreadySentReminderToday(user.userId, "telegram", dailyDate);
    const plan = resolveDailyCardsReminderDelivery({
      dailyCardsReminder: user.dailyCardsReminder,
      cooldownAllowed: !dailyReading.used,
      dailyInApp: user.prefs.dailyInApp,
      dailyEmail: user.prefs.dailyEmail,
      dailyTelegram: user.prefs.dailyTelegram,
      hasEmail: Boolean(user.email),
      hasTelegram: user.telegramUserId != null,
      alreadySentInApp,
      alreadySentEmail,
      alreadySentTelegram,
    });

    if (!plan.inApp && !plan.email && !plan.telegram) continue;
    const reservation = await reserveProactiveContact(
      user.userId,
      "daily_cards",
      `daily_cards:${dailyDate}`
    );
    if (!reservation) continue;
    let delivered = false;
    try {
      if (plan.inApp && (await claimReminderSlot(user.userId, "in_app", dailyDate))) {
        await dispatchNotification({
          userId: user.userId,
          type: "daily_reading_reminder",
          title: "Расклад на сутки ждёт вас",
          body: "Откройте расклад на сутки — узнайте энергию сегодняшнего дня.",
          ctaPath: DAILY_CARDS_REMINDER_CTA,
          ctaLabel: "Открыть расклад на сутки",
        });
        inApp++;
        delivered = true;
      }

      if (plan.email && user.email && (await claimReminderSlot(user.userId, "email", dailyDate))) {
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
          delivered = true;
        } else {
          await query(
            `DELETE FROM daily_reminder_log
             WHERE user_id = $1 AND channel = 'email' AND sent_date = $2::date`,
            [user.userId, dailyDate]
          );
        }
      }

      if (
        plan.telegram &&
        user.telegramUserId != null &&
        (await claimReminderSlot(user.userId, "telegram", dailyDate))
      ) {
        const unsub = await reminderUnsubscribeUrl(user.accountId, "daily_cards");
        const sent = await notifyBotReminder({
          telegramUserId: user.telegramUserId,
          sourceProfileUserId: user.userId,
          kind: "daily_cards",
          title: "Расклад на сутки ждёт вас",
          body: "Бесплатный расклад на сутки готов. Откройте, когда будет минута.",
          ctaUrl: `${siteUrl}${DAILY_CARDS_REMINDER_CTA}`,
          ctaLabel: "Открыть расклад на сутки",
          unsubscribeUrl: unsub,
        });
        if (sent.delivered) {
          telegram++;
          delivered = true;
        } else {
          await query(
            `DELETE FROM daily_reminder_log
             WHERE user_id = $1 AND channel = 'telegram' AND sent_date = $2::date`,
            [user.userId, dailyDate]
          );
        }
      }
    } finally {
      await finishProactiveContact(reservation.id, delivered);
    }
  }

  return { inApp, email, telegram };
}
