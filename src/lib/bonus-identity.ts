import { query, queryClient, type PoolClient } from "@/lib/db";
/** Existing grants remain valid. New email registrations prove ownership before free credits. */
export async function isBonusIdentityReady(userId: string, client?: PoolClient): Promise<boolean> {
  const sql = `SELECT 1 FROM user_accounts WHERE profile_user_id=$1 AND bonus_email_verification_required=TRUE LIMIT 1`;
  const result = client ? await queryClient(client,sql,[userId]) : await query(sql,[userId]);
  return result.rows.length === 0;
}
