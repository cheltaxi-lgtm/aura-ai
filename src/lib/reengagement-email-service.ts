import { getRuneSettings } from "@/lib/rune-settings";
import { query } from "@/lib/db";
import { DAILY_BONUS_AMOUNT } from "@/lib/rune-daily-constants";
import {
  dailyBonusReminderEmailHtml,
  inactiveUserEmailHtml,
  inactiveUserEmailText,
  sendEmail,
} from "@/lib/email/send";
import { getSiteUrl, pickDeliverableEmail } from "@/lib/email/mail-config";
import { parseNotificationPrefs } from "@/lib/daily-reminder-service";
import { ACCOUNT_DELIVERABLE_EMAIL_SQL } from "@/lib/reminder-contacts";
import { reminderUnsubscribeUrl } from "@/lib/reminder-unsubscribe";
import { finishProactiveContact, reserveProactiveContact } from "@/lib/proactive-contact-policy";

export const INACTIVE_WINBACK_TEMPLATES = ["inactive_7d", "inactive_14d"] as const;
export type InactiveWinbackTemplate = (typeof INACTIVE_WINBACK_TEMPLATES)[number];
export const INACTIVE_WINBACK_CAP_DAYS = 7;

const DAY_MS = 86_400_000;

export function resolveInactiveWinbackStage(
  lastLoginAt: Date | string | null | undefined,
  now: Date = new Date()
): InactiveWinbackTemplate | null {
  if (lastLoginAt == null || lastLoginAt === "") return null;
  const last = lastLoginAt instanceof Date ? lastLoginAt : new Date(lastLoginAt);
  if (!Number.isFinite(last.getTime())) return null;
  const ageMs = now.getTime() - last.getTime();
  if (ageMs >= 14 * DAY_MS) return "inactive_14d";
  if (ageMs >= 7 * DAY_MS) return "inactive_7d";
  return null;
}

async function alreadySentToday(userId: string, template: string): Promise<boolean> {
  const res = await query(
    `SELECT 1 FROM reengagement_email_log
     WHERE user_id = $1 AND template = $2 AND sent_date = CURRENT_DATE LIMIT 1`,
    [userId, template]
  );
  return res.rows.length > 0;
}

async function markSent(userId: string, template: string): Promise<void> {
  await query(
    `INSERT INTO reengagement_email_log (user_id, template)
     VALUES ($1, $2) ON CONFLICT (user_id, template, sent_date) DO NOTHING`,
    [userId, template]
  );
}

export async function sentInactiveStageThisEpisode(
  userId: string,
  template: InactiveWinbackTemplate,
  lastLoginAt: Date | string
): Promise<boolean> {
  const res = await query(
    `SELECT 1 FROM reengagement_email_log
     WHERE user_id = $1 AND template = $2 AND created_at > $3::timestamptz
     LIMIT 1`,
    [userId, template, lastLoginAt]
  );
  return res.rows.length > 0;
}

export async function hasRecentProactiveInactiveWinback(
  userId: string,
  withinDays = INACTIVE_WINBACK_CAP_DAYS
): Promise<boolean> {
  const res = await query(
    `SELECT 1 FROM reengagement_email_log
     WHERE user_id = $1
       AND template IN ('inactive_7d', 'inactive_14d')
       AND created_at > NOW() - ($2::int || ' days')::interval
     LIMIT 1`,
    [userId, withinDays]
  );
  return res.rows.length > 0;
}

/** Evening nudge: free daily runes waiting (bonus claimable, not yet taken today). */
export async function sendDailyBonusReminderEmails(): Promise<number> {
  if (!(await getRuneSettings()).enabled) return 0;
  const siteUrl = getSiteUrl();
  const res = await query<{
    user_id: string;
    account_id: string;
    name: string;
    deliverable_email: string | null;
    notification_prefs: unknown;
  }>(
    `SELECT u.id AS user_id, ua.id AS account_id, u.name,
            (${ACCOUNT_DELIVERABLE_EMAIL_SQL}) AS deliverable_email,
            u.notification_prefs
     FROM users u
     JOIN user_accounts ua ON ua.profile_user_id = u.id
     WHERE ua.bonus_email_verification_required=FALSE AND (
         u.last_daily_bonus IS NULL
         OR u.last_daily_bonus <= NOW() - INTERVAL '24 hours'
       )
       AND COALESCE((u.notification_prefs->>'bonusEmail')::boolean, false) = true`

  );

  let sent = 0;
  for (const row of res.rows) {
    const prefs = parseNotificationPrefs(row.notification_prefs);
    if (!prefs.bonusEmail) continue;
    if (await alreadySentToday(row.user_id, "daily_bonus")) continue;
    const email = pickDeliverableEmail(row.deliverable_email);
    if (!email) continue;
    const reservation = await reserveProactiveContact(
      row.user_id,
      "daily_bonus",
      `daily_bonus:${new Date().toISOString().slice(0, 10)}`
    );
    if (!reservation) continue;
    let delivered = false;
    try {
      const unsub = await reminderUnsubscribeUrl(row.account_id, "daily_bonus");
      delivered = await sendEmail({
        to: email,
        subject: `Zovus — ${DAILY_BONUS_AMOUNT} рун ждут вас`,
        html: dailyBonusReminderEmailHtml(row.name, DAILY_BONUS_AMOUNT, siteUrl, unsub),
        text: `${row.name}, заберите ${DAILY_BONUS_AMOUNT} бесплатных рун: ${siteUrl}/cabinet#daily-bonus\nОтключить: ${unsub}`,
        template: "daily_bonus",
        listUnsubscribeUrl: unsub,
      });
      if (delivered) {
        await markSent(row.user_id, "daily_bonus");
        sent++;
      }
    } finally {
      await finishProactiveContact(reservation.id, delivered);
    }
  }
  return sent;
}

type InactiveRow = {
  user_id: string;
  account_id: string;
  name: string;
  email: string | null;
  notification_prefs: unknown;
  last_activity_at: Date;
  latest_reading_id: string | null;
  stage: InactiveWinbackTemplate;
};

async function loadInactiveWinbackRows(
  stage: InactiveWinbackTemplate
): Promise<InactiveRow[]> {
  const windowSql =
    stage === "inactive_7d"
      ? `GREATEST(ua.last_login_at, u.last_product_activity_at) <= NOW() - INTERVAL '7 days'
         AND GREATEST(ua.last_login_at, u.last_product_activity_at) > NOW() - INTERVAL '14 days'`
      : `GREATEST(ua.last_login_at, u.last_product_activity_at) <= NOW() - INTERVAL '14 days'`;
  const res = await query<{
    user_id: string;
    account_id: string;
    name: string;
    deliverable_email: string | null;
    notification_prefs: unknown;
    last_activity_at: Date;
    latest_reading_id: string | null;
  }>(
    `SELECT u.id AS user_id, ua.id AS account_id, u.name,
            (${ACCOUNT_DELIVERABLE_EMAIL_SQL}) AS deliverable_email,
            u.notification_prefs,
            GREATEST(ua.last_login_at, u.last_product_activity_at) AS last_activity_at,
            latest_reading.id::text AS latest_reading_id
     FROM users u
     JOIN user_accounts ua ON ua.profile_user_id = u.id
     LEFT JOIN LATERAL (
       SELECT h.id FROM history h
       WHERE h.user_id=u.id
         AND COALESCE(NULLIF(h.context_data->>'report',''),NULLIF(h.context_data->>'reading',''),NULLIF(h.context_data->>'analysis','')) IS NOT NULL
       ORDER BY h.created_at DESC LIMIT 1
     ) latest_reading ON TRUE
     WHERE ua.marketing_consent = true
       AND GREATEST(ua.last_login_at, u.last_product_activity_at) IS NOT NULL
       AND ${windowSql}
       AND COALESCE((u.notification_prefs->>'marketingEmail')::boolean, false) = true`
  );
  return res.rows.map((row) => ({
    ...row,
    email: pickDeliverableEmail(row.deliverable_email),
    stage,
  }));
}

export type InactiveWinbackSendStats = {
  sent: number;
  eligible: number;
  suppressedFrequency: number;
  suppressedEpisode: number;
};

async function deliverInactiveStage(
  stage: InactiveWinbackTemplate
): Promise<InactiveWinbackSendStats> {
  const siteUrl = getSiteUrl();
  const days = stage === "inactive_7d" ? 7 : 14;
  const rows = await loadInactiveWinbackRows(stage);
  const stats: InactiveWinbackSendStats = {
    sent: 0,
    eligible: 0,
    suppressedFrequency: 0,
    suppressedEpisode: 0,
  };

  for (const row of rows) {
    const prefs = parseNotificationPrefs(row.notification_prefs);
    if (!prefs.marketingEmail) continue;
    stats.eligible += 1;
    if (await sentInactiveStageThisEpisode(row.user_id, stage, row.last_activity_at)) {
      stats.suppressedEpisode += 1;
      continue;
    }
    if (await hasRecentProactiveInactiveWinback(row.user_id)) {
      stats.suppressedFrequency += 1;
      continue;
    }
    if (!row.email) continue;
    const reservation = await reserveProactiveContact(
      row.user_id,
      stage,
      `${stage}:${row.last_activity_at.toISOString().slice(0, 10)}`
    );
    if (!reservation) {
      stats.suppressedFrequency += 1;
      continue;
    }

    const ctaPath = row.latest_reading_id
      ? `/cabinet/readings/${encodeURIComponent(row.latest_reading_id)}/print`
      : "/cabinet";
    let delivered = false;
    try {
      const unsub = await reminderUnsubscribeUrl(row.account_id, "marketing");
      delivered = await sendEmail({
        to: row.email,
        subject:
          stage === "inactive_7d"
            ? "Zovus — давно не виделись"
            : "Zovus — ваш Zovus остаётся с Вами",
        html: inactiveUserEmailHtml(row.name, days, siteUrl, unsub, `${siteUrl}${ctaPath}`),
        text: inactiveUserEmailText(row.name, days, siteUrl, unsub, `${siteUrl}${ctaPath}`),
        template: stage,
        listUnsubscribeUrl: unsub,
      });
      if (delivered) {
        await markSent(row.user_id, stage);
        stats.sent += 1;
      }
    } finally {
      await finishProactiveContact(reservation.id, delivered);
    }
  }

  return stats;
}

export async function sendInactiveUserEmails(inactiveDays: 7 | 14): Promise<number> {
  const stage = inactiveDays === 7 ? "inactive_7d" : "inactive_14d";
  const stats = await deliverInactiveStage(stage);
  return stats.sent;
}

export async function sendInactiveWinbackEmails(): Promise<{
  inactive7d: InactiveWinbackSendStats;
  inactive14d: InactiveWinbackSendStats;
}> {
  const inactive7d = await deliverInactiveStage("inactive_7d");
  const inactive14d = await deliverInactiveStage("inactive_14d");
  return { inactive7d, inactive14d };
}

export async function runReengagementEmailBatch(opts?: {
  dailyBonus?: boolean;
  inactive?: boolean;
}): Promise<{
  dailyBonus: number;
  inactive7d: number;
  inactive14d: number;
  inactive7dEligible: number;
  inactive14dEligible: number;
  inactive7dSuppressedFrequency: number;
  inactive14dSuppressedFrequency: number;
}> {
  const runBonus = opts?.dailyBonus !== false;
  const runInactive = opts?.inactive !== false;

  const dailyBonus = runBonus ? await sendDailyBonusReminderEmails() : 0;
  const inactive = runInactive
    ? await sendInactiveWinbackEmails()
    : {
        inactive7d: {
          sent: 0,
          eligible: 0,
          suppressedFrequency: 0,
          suppressedEpisode: 0,
        },
        inactive14d: {
          sent: 0,
          eligible: 0,
          suppressedFrequency: 0,
          suppressedEpisode: 0,
        },
      };

  return {
    dailyBonus,
    inactive7d: inactive.inactive7d.sent,
    inactive14d: inactive.inactive14d.sent,
    inactive7dEligible: inactive.inactive7d.eligible,
    inactive14dEligible: inactive.inactive14d.eligible,
    inactive7dSuppressedFrequency: inactive.inactive7d.suppressedFrequency,
    inactive14dSuppressedFrequency: inactive.inactive14d.suppressedFrequency,
  };
}
