import { query } from "@/lib/db";
import { isHighEntropyShareToken } from "@/lib/natal/report-share";

export interface PublicReportShare {
  report: Record<string, unknown>;
  expiresAt: string;
}

/**
 * Reads the already-sanitized payload persisted by report share creation.
 * Callers intentionally apply their own transport-level rate limiting.
 */
export async function getActivePublicReportShare(
  token: string
): Promise<PublicReportShare | null> {
  if (!isHighEntropyShareToken(token)) return null;

  const { rows } = await query<{
    public_payload: Record<string, unknown>;
    expires_at: string;
  }>(
    `SELECT public_payload, expires_at FROM private_report_shares
     WHERE token = $1 AND revoked_at IS NULL AND expires_at > NOW() LIMIT 1`,
    [token]
  );
  const row = rows[0];
  if (!row) return null;

  return { report: row.public_payload, expiresAt: row.expires_at };
}
