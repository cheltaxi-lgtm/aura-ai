import { query } from "@/lib/db";
import { ACCOUNT_DELIVERABLE_EMAIL_SQL } from "@/lib/reminder-contacts";

export type EmailLogStatus = "sent" | "failed" | "skipped";

/** Account coverage and SMTP acceptance for the daily reading, without recipient data. */
export async function getDailyReminderDeliveryStatus() {
  const [coverage, days] = await Promise.all([
    query<{
      accounts: string;
      reminders_on: string;
      reachable_email: string;
      missing_email: string;
    }>(`SELECT COUNT(*)::text AS accounts,
       COUNT(*) FILTER (WHERE ua.daily_cards_reminder)::text AS reminders_on,
       COUNT(*) FILTER (WHERE ua.daily_cards_reminder
         AND COALESCE((u.notification_prefs->>'dailyEmail')::boolean, false)
         AND (${ACCOUNT_DELIVERABLE_EMAIL_SQL}) IS NOT NULL)::text AS reachable_email,
       COUNT(*) FILTER (WHERE (${ACCOUNT_DELIVERABLE_EMAIL_SQL}) IS NULL)::text AS missing_email
      FROM user_accounts ua JOIN users u ON u.id=ua.profile_user_id
      WHERE ua.erasure_requested_at IS NULL AND u.erasure_requested_at IS NULL`),
    query<{ day: string; sent: string; failed: string }>(`WITH days AS (
       SELECT ((NOW() AT TIME ZONE 'Europe/Moscow')::date - g.offset_days)::date AS day
       FROM generate_series(0, 6) AS g(offset_days)
     )
     SELECT d.day::text AS day,
       COUNT(e.id) FILTER (WHERE e.status='sent')::text AS sent,
       COUNT(e.id) FILTER (WHERE e.status='failed')::text AS failed
     FROM days d LEFT JOIN email_log e
       ON (e.created_at AT TIME ZONE 'Europe/Moscow')::date=d.day
       AND e.template='daily_reminder'
     GROUP BY d.day ORDER BY d.day DESC`),
  ]);
  const row = coverage.rows[0];
  return {
    accounts: Number(row?.accounts ?? 0),
    remindersOn: Number(row?.reminders_on ?? 0),
    reachableEmail: Number(row?.reachable_email ?? 0),
    missingEmail: Number(row?.missing_email ?? 0),
    days: days.rows.map((day) => ({
      date: day.day,
      sent: Number(day.sent),
      failed: Number(day.failed),
    })),
  };
}

export type EmailLogFilters = {
  status?: EmailLogStatus;
  template?: string;
  recipient?: string;
  sinceHours?: number;
  limit?: number;
  offset?: number;
};

export async function logEmailAttempt(params: {
  recipient: string;
  subject: string;
  template: string;
  provider: string | null;
  status: EmailLogStatus;
  errorMessage?: string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  try {
    await query(
      `INSERT INTO email_log (recipient, subject, template, provider, status, error_message, meta)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [
        params.recipient.slice(0, 320),
        params.subject.slice(0, 500),
        params.template.slice(0, 120),
        params.provider,
        params.status,
        params.errorMessage?.slice(0, 2000) ?? null,
        JSON.stringify(params.meta ?? {}),
      ]
    );
  } catch (err) {
    console.warn("[email-log] write failed:", err);
  }
}

export async function listEmailLog(filters: EmailLogFilters = {}): Promise<{
  rows: Array<{
    id: string;
    recipient: string;
    subject: string;
    template: string;
    provider: string | null;
    status: EmailLogStatus;
    error_message: string | null;
    created_at: Date;
  }>;
  total: number;
}> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (filters.status) {
    conditions.push(`status = $${idx++}`);
    params.push(filters.status);
  }
  if (filters.template) {
    conditions.push(`template = $${idx++}`);
    params.push(filters.template);
  }
  if (filters.recipient) {
    conditions.push(`recipient ILIKE $${idx++}`);
    params.push(`%${filters.recipient}%`);
  }
  if (filters.sinceHours && filters.sinceHours > 0) {
    conditions.push(`created_at >= NOW() - ($${idx++}::int || ' hours')::interval`);
    params.push(filters.sinceHours);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = Math.min(filters.limit ?? 50, 200);
  const offset = Math.max(filters.offset ?? 0, 0);

  const countRes = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM email_log ${where}`,
    params
  );
  const total = parseInt(countRes.rows[0]?.count ?? "0", 10) || 0;

  const listRes = await query<{
    id: string;
    recipient: string;
    subject: string;
    template: string;
    provider: string | null;
    status: EmailLogStatus;
    error_message: string | null;
    created_at: Date;
  }>(
    `SELECT id, recipient, subject, template, provider, status, error_message, created_at
     FROM email_log ${where}
     ORDER BY created_at DESC
     LIMIT $${idx++} OFFSET $${idx++}`,
    [...params, limit, offset]
  );

  return { rows: listRes.rows, total };
}

/** @deprecated Use listEmailLog */
export async function listRecentEmailLog(limit = 50) {
  const { rows } = await listEmailLog({ limit });
  return rows;
}

export async function getEmailLogStats(sinceHours = 24): Promise<{
  sent: number;
  failed: number;
  skipped: number;
}> {
  const res = await query<{ status: EmailLogStatus; count: string }>(
    `SELECT status, COUNT(*)::text AS count FROM email_log
     WHERE created_at >= NOW() - ($1::int || ' hours')::interval
     GROUP BY status`,
    [sinceHours]
  );
  const out = { sent: 0, failed: 0, skipped: 0 };
  for (const row of res.rows) {
    out[row.status] = parseInt(row.count, 10) || 0;
  }
  return out;
}

export async function getEmailLogStatsByTemplate(sinceHours = 168): Promise<
  Array<{ template: string; sent: number; failed: number; skipped: number; total: number }>
> {
  const res = await query<{ template: string; status: EmailLogStatus; count: string }>(
    `SELECT template, status, COUNT(*)::text AS count FROM email_log
     WHERE created_at >= NOW() - ($1::int || ' hours')::interval
     GROUP BY template, status
     ORDER BY template`,
    [sinceHours]
  );

  const map = new Map<string, { sent: number; failed: number; skipped: number }>();
  for (const row of res.rows) {
    const cur = map.get(row.template) ?? { sent: 0, failed: 0, skipped: 0 };
    cur[row.status] = parseInt(row.count, 10) || 0;
    map.set(row.template, cur);
  }

  return [...map.entries()]
    .map(([template, counts]) => ({
      template,
      ...counts,
      total: counts.sent + counts.failed + counts.skipped,
    }))
    .sort((a, b) => b.total - a.total);
}

export async function countEmailLogForPurge(params: {
  olderThanDays?: number;
  status?: EmailLogStatus;
  template?: string;
  all?: boolean;
}): Promise<number> {
  if (params.all) {
    const res = await query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM email_log`);
    return parseInt(res.rows[0]?.count ?? "0", 10) || 0;
  }

  const conditions: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (params.olderThanDays != null && params.olderThanDays > 0) {
    conditions.push(`created_at < NOW() - ($${idx++}::int || ' days')::interval`);
    values.push(params.olderThanDays);
  }
  if (params.status) {
    conditions.push(`status = $${idx++}`);
    values.push(params.status);
  }
  if (params.template) {
    conditions.push(`template = $${idx++}`);
    values.push(params.template);
  }

  if (!conditions.length) return 0;

  const res = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM email_log WHERE ${conditions.join(" AND ")}`,
    values
  );
  return parseInt(res.rows[0]?.count ?? "0", 10) || 0;
}

export async function deleteEmailLog(params: {
  olderThanDays?: number;
  status?: EmailLogStatus;
  template?: string;
  all?: boolean;
}): Promise<number> {
  if (params.all) {
    const res = await query<{ id: string }>(`DELETE FROM email_log RETURNING id`);
    return res.rowCount ?? res.rows.length ?? 0;
  }

  const conditions: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (params.olderThanDays != null && params.olderThanDays > 0) {
    conditions.push(`created_at < NOW() - ($${idx++}::int || ' days')::interval`);
    values.push(params.olderThanDays);
  }
  if (params.status) {
    conditions.push(`status = $${idx++}`);
    values.push(params.status);
  }
  if (params.template) {
    conditions.push(`template = $${idx++}`);
    values.push(params.template);
  }

  if (!conditions.length) return 0;

  const res = await query(
    `DELETE FROM email_log WHERE ${conditions.join(" AND ")}`,
    values
  );
  return res.rowCount ?? 0;
}

/** Privacy-safe win-back return rates from existing log + last_login_at. No PII. */
export async function getInactiveWinbackAttribution(sinceDays = 30): Promise<
  Array<{
    template: "inactive_7d" | "inactive_14d";
    sent: number;
    returned24h: number;
    returned72h: number;
  }>
> {
  try {
    const res = await query<{
      template: "inactive_7d" | "inactive_14d";
      sent: string;
      returned_24h: string;
      returned_72h: string;
    }>(
      `SELECT l.template,
              COUNT(*)::text AS sent,
              COUNT(*) FILTER (
                WHERE ua.last_login_at > l.created_at
                  AND ua.last_login_at <= l.created_at + INTERVAL '24 hours'
              )::text AS returned_24h,
              COUNT(*) FILTER (
                WHERE ua.last_login_at > l.created_at
                  AND ua.last_login_at <= l.created_at + INTERVAL '72 hours'
              )::text AS returned_72h
         FROM reengagement_email_log l
         JOIN user_accounts ua ON ua.profile_user_id = l.user_id
        WHERE l.template IN ('inactive_7d', 'inactive_14d')
          AND l.created_at >= NOW() - ($1::int || ' days')::interval
        GROUP BY l.template
        ORDER BY l.template`,
      [sinceDays]
    );
    return res.rows.map((r) => ({
      template: r.template,
      sent: parseInt(r.sent, 10) || 0,
      returned24h: parseInt(r.returned_24h, 10) || 0,
      returned72h: parseInt(r.returned_72h, 10) || 0,
    }));
  } catch {
    return [];
  }
}

export async function getReengagementEmailStats(sinceDays = 30): Promise<
  Array<{ template: string; count: number }>
> {
  try {
    const res = await query<{ template: string; count: string }>(
      `SELECT template, COUNT(*)::text AS count FROM reengagement_email_log
       WHERE created_at >= NOW() - ($1::int || ' days')::interval
       GROUP BY template ORDER BY count DESC`,
      [sinceDays]
    );
    return res.rows.map((r) => ({
      template: r.template,
      count: parseInt(r.count, 10) || 0,
    }));
  } catch {
    return [];
  }
}

export async function purgeReengagementLog(olderThanDays: number): Promise<number> {
  try {
    const res = await query(
      `DELETE FROM reengagement_email_log
       WHERE created_at < NOW() - ($1::int || ' days')::interval`,
      [olderThanDays]
    );
    return res.rowCount ?? 0;
  } catch {
    return 0;
  }
}
