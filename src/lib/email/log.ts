import { query } from "@/lib/db";

export type EmailLogStatus = "sent" | "failed" | "skipped";

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

export async function listRecentEmailLog(limit = 50): Promise<
  Array<{
    id: string;
    recipient: string;
    subject: string;
    template: string;
    provider: string | null;
    status: EmailLogStatus;
    error_message: string | null;
    created_at: Date;
  }>
> {
  const res = await query<{
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
     FROM email_log ORDER BY created_at DESC LIMIT $1`,
    [Math.min(limit, 200)]
  );
  return res.rows;
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
