import { query } from "@/lib/db";
import { DAILY_BONUS_AMOUNT } from "@/lib/rune-daily-constants";
import {
  dailyBonusReminderEmailHtml,
  inactiveUserEmailHtml,
  sendEmail,
} from "@/lib/email/send";
import { getSiteUrl, isDeliverableUserEmail } from "@/lib/email/mail-config";
import { parseNotificationPrefs } from "@/lib/daily-reminder-service";

type Candidate = { userId: string; name: string; email: string };

async function alreadySentToday(userId: string, template: string): Promise<boolean> {
  const res = await query(
    `SELECT 1 FROM reengagement_email_log
     WHERE user_id = $1 AND template = $2 AND sent_date = CURRENT_DATE LIMIT 1`,
    [userId, template]
  );
  return res.rows.length > 0;
}

async function sentRecently(userId: string, template: string, withinDays: number): Promise<boolean> {
  const res = await query(
    `SELECT 1 FROM reengagement_email_log
     WHERE user_id = $1 AND template = $2
       AND created_at >= NOW() - ($3::int || ' days')::interval
     LIMIT 1`,
    [userId, template, withinDays]
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

/** Evening nudge: free daily runes waiting (bonus claimable, not yet taken today). */
export async function sendDailyBonusReminderEmails(): Promise<number> {
  const siteUrl = getSiteUrl();
  const res = await query<{
    user_id: string;
    name: string;
    email: string | null;
    notification_prefs: unknown;
  }>(
    `SELECT u.id AS user_id, u.name, ua.email, u.notification_prefs
     FROM users u
     JOIN user_accounts ua ON ua.profile_user_id = u.id
     WHERE ua.email IS NOT NULL
       AND (
         u.last_daily_bonus IS NULL
         OR u.last_daily_bonus <= NOW() - INTERVAL '24 hours'
       )
       AND COALESCE((u.notification_prefs->>'bonusEmail')::boolean, true) = true`
  );

  let sent = 0;
  for (const row of res.rows) {
    if (!row.email || !isDeliverableUserEmail(row.email)) continue;
    const prefs = parseNotificationPrefs(row.notification_prefs);
    if (!prefs.bonusEmail) continue;
    if (await alreadySentToday(row.user_id, "daily_bonus")) continue;

    const ok = await sendEmail({
      to: row.email,
      subject: `Zovus — ${DAILY_BONUS_AMOUNT} рун ждут вас`,
      html: dailyBonusReminderEmailHtml(row.name, DAILY_BONUS_AMOUNT, siteUrl),
      text: `${row.name}, заберите ${DAILY_BONUS_AMOUNT} бесплатных рун: ${siteUrl}/cabinet`,
      template: "daily_bonus",
    });
    if (ok) {
      await markSent(row.user_id, "daily_bonus");
      sent++;
    }
  }
  return sent;
}

async function getInactiveCandidates(inactiveDays: number, template: string): Promise<Candidate[]> {
  const res = await query<{
    user_id: string;
    name: string;
    email: string | null;
    notification_prefs: unknown;
  }>(
    `SELECT u.id AS user_id, u.name, ua.email, u.notification_prefs
     FROM users u
     JOIN user_accounts ua ON ua.profile_user_id = u.id
     WHERE ua.email IS NOT NULL
       AND ua.marketing_consent = true
       AND ua.last_login_at IS NOT NULL
       AND ua.last_login_at < NOW() - ($1::int || ' days')::interval
       AND COALESCE((u.notification_prefs->>'marketingEmail')::boolean, true) = true`,
    [inactiveDays]
  );

  const out: Candidate[] = [];
  for (const row of res.rows) {
    if (!row.email || !isDeliverableUserEmail(row.email)) continue;
    const prefs = parseNotificationPrefs(row.notification_prefs);
    if (!prefs.marketingEmail) continue;
    if (await sentRecently(row.user_id, template, 30)) continue;
    out.push({ userId: row.user_id, name: row.name, email: row.email });
  }
  return out;
}

export async function sendInactiveUserEmails(inactiveDays: 7 | 14): Promise<number> {
  const template = inactiveDays === 7 ? "inactive_7d" : "inactive_14d";
  const siteUrl = getSiteUrl();
  const candidates = await getInactiveCandidates(inactiveDays, template);
  let sent = 0;

  for (const user of candidates) {
    const ok = await sendEmail({
      to: user.email,
      subject:
        inactiveDays === 7
          ? "Zovus — бесплатный расклад на сегодня"
          : "Zovus — мы скучаем, карты ждут вас",
      html: inactiveUserEmailHtml(user.name, inactiveDays, siteUrl),
      text: `${user.name}, вернитесь на Zovus: ${siteUrl}/?dailyCards=1`,
      template,
    });
    if (ok) {
      await markSent(user.userId, template);
      sent++;
    }
  }
  return sent;
}

export async function runReengagementEmailBatch(opts?: {
  dailyBonus?: boolean;
  inactive?: boolean;
}): Promise<{
  dailyBonus: number;
  inactive7d: number;
  inactive14d: number;
}> {
  const runBonus = opts?.dailyBonus !== false;
  const runInactive = opts?.inactive !== false;

  const [dailyBonus, inactive7d, inactive14d] = await Promise.all([
    runBonus ? sendDailyBonusReminderEmails() : Promise.resolve(0),
    runInactive ? sendInactiveUserEmails(7) : Promise.resolve(0),
    runInactive ? sendInactiveUserEmails(14) : Promise.resolve(0),
  ]);
  return { dailyBonus, inactive7d, inactive14d };
}
