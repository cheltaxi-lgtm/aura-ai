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
    `SELECT public_payload, expires_at FROM private_report_shares shares
     WHERE token = $1 AND revoked_at IS NULL AND expires_at > NOW()
       AND (
         (report_kind = 'natal' AND EXISTS (
           SELECT 1 FROM natal_report_history r WHERE r.id = shares.report_id AND r.user_id = shares.owner_user_id
         )) OR (report_kind = 'relationship' AND EXISTS (
           SELECT 1 FROM joint_readings r WHERE r.id = shares.report_id AND r.status = 'completed'
             AND (r.initiator_user_id = shares.owner_user_id OR r.partner_user_id = shares.owner_user_id)
         )) OR (report_kind = 'compatibility' AND EXISTS (
           SELECT 1 FROM natal_compatibility_reports r WHERE r.id = shares.report_id AND r.status = 'completed'
             AND (r.owner_user_id = shares.owner_user_id OR r.participant_user_id = shares.owner_user_id)
         ))
       ) LIMIT 1`,
    [token]
  );
  const row = rows[0];
  if (!row) return null;

  return { report: row.public_payload, expiresAt: row.expires_at };
}
