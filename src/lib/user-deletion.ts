import { withTransaction } from "@/lib/db";
import type { PoolClient } from "pg";

export interface DeleteUserAccountResult {
  chatMessagesRemoved: number;
  sessionsRemoved: number;
  paymentsRemoved: number;
  shareSnapshotsRemoved: number;
  accountRemoved: number;
  userRemoved: number;
}

/**
 * Irreversibly deletes a user account and all associated data (152-FZ right to erasure).
 */
export async function deleteUserAccountCompletely(
  accountId: string,
  profileUserId: string
): Promise<DeleteUserAccountResult> {
  return withTransaction(async (client) => {
    const account = await client.query<{ profile_user_id: string | null }>(
      "SELECT profile_user_id FROM user_accounts WHERE id = $1 FOR UPDATE", [accountId]
    );
    if (account.rows[0] && account.rows[0].profile_user_id !== profileUserId) throw new Error("erasure_identity_changed");
    // The synchronous internal helper follows the same retained fingerprint
    // fence as the outbox worker. Existing pending bot work keeps its stage.
    await client.query(`INSERT INTO account_erasure_jobs (account_id, profile_user_id, stage, completed_at, email_hashes)
      SELECT id, profile_user_id, 'completed', NOW(), account_erasure_email_hashes(id) FROM user_accounts WHERE id = $1
      ON CONFLICT (account_id) DO UPDATE SET email_hashes = ARRAY(
        SELECT DISTINCT unnest(COALESCE(account_erasure_jobs.email_hashes, '{}') || EXCLUDED.email_hashes)
      )`, [accountId]);
    return deleteUserAccountInTransaction(client, accountId, profileUserId);
  });
}

export async function purgeAccountEmailLogsInTransaction(client: PoolClient, accountId: string, profileUserId?: string): Promise<void> {
  await client.query(`DELETE FROM email_log WHERE owner_account_ids @> ARRAY[$1::uuid]
    OR owner_account_ids && ARRAY(SELECT id FROM user_accounts WHERE $2::uuid IS NOT NULL AND profile_user_id = $2)
    OR encode(digest(lower(btrim(recipient)), 'sha256'), 'hex') IN (
    SELECT unnest(account_erasure_email_hashes(id)) FROM user_accounts
      WHERE id = $1 OR ($2::uuid IS NOT NULL AND profile_user_id = $2)
    UNION SELECT unnest(email_hashes) FROM account_erasure_jobs WHERE account_id = $1
  )`, [accountId, profileUserId ?? null]);
}

/** Worker calls this inside the same transaction as its durable stage change. */
export async function deleteUserAccountInTransaction(
  client: PoolClient,
  accountId: string,
  profileUserId: string
): Promise<DeleteUserAccountResult> {
    // Paid report writers hold job → user → source. Erasure follows the same
    // order, so a worker cannot resurrect data or deadlock cascade deletion.
    await client.query("SELECT id FROM async_jobs WHERE user_id=$1 ORDER BY id FOR UPDATE",[profileUserId]);
    await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE",[profileUserId]);
    await purgeAccountEmailLogsInTransaction(client, accountId, profileUserId);
    const { eraseProAccountData } = await import("@/modules/pro/db/account-erasure");
    await eraseProAccountData(profileUserId);
    const run = async (text: string, params?: unknown[]) => {
      const result = await client.query(text, params);
      return result.rowCount ?? 0;
    };

    const paymentsRemoved = await run(
      `DELETE FROM payments
       WHERE user_id = $1
          OR session_id IN (SELECT id FROM sessions WHERE user_id = $1)`,
      [profileUserId]
    );

    const shareSnapshotsRemoved = await run(`DELETE FROM share_snapshots WHERE user_id = $1`, [
      profileUserId,
    ]);

    const chatMessagesRemoved = await run(
      `DELETE FROM chat_messages cm
       WHERE cm.owner_user_id = $1
          OR cm.session_id IN (SELECT id FROM sessions WHERE user_id = $1)`,
      [profileUserId]
    );

    await run(`UPDATE rituals SET transaction_id = NULL WHERE user_id = $1`, [profileUserId]);

    // Claimed guest rows have CHECK (claimed_user_id AND claimed_at together).
    // ON DELETE SET NULL would leave a half-claimed row and abort user wipe.
    await run(`DELETE FROM matrix_guest_pending WHERE claimed_user_id = $1`, [profileUserId]);
    await run(`DELETE FROM matrix_pair_guest_pending WHERE claimed_user_id = $1`, [
      profileUserId,
    ]);
    await run(`DELETE FROM natal_guest_charts WHERE claimed_user_id = $1`, [profileUserId]);
    await run(`DELETE FROM aura_guest_snapshots WHERE claimed_user_id = $1`, [profileUserId]);
    await run(`DELETE FROM palm_guest_snapshots WHERE claimed_user_id = $1`, [profileUserId]);

    // A partner erasure must not leave their private text behind an empty,
    // reclaimable invitation slot (partner FK historically uses SET NULL).
    await run(`DELETE FROM private_report_shares WHERE report_kind = 'relationship'
      AND report_id IN (SELECT id FROM joint_readings WHERE initiator_user_id = $1 OR partner_user_id = $1)`, [profileUserId]);
    await run(`DELETE FROM joint_readings WHERE initiator_user_id = $1 OR partner_user_id = $1`, [profileUserId]);

    // Owned HD charts must not become guest-pool orphans (FK is historically
    // ON DELETE SET NULL). Explicit delete cascades reports/insights/composites.
    await run(`DELETE FROM hd_charts WHERE user_id = $1`, [profileUserId]);

    const sessionsRemoved = await run(`DELETE FROM sessions WHERE user_id = $1`, [profileUserId]);

    const accountRemoved = await run(
      `DELETE FROM user_accounts WHERE id = $1 OR profile_user_id = $2`,
      [accountId, profileUserId]
    );

    const userRemoved = await run(`DELETE FROM users WHERE id = $1`, [profileUserId]);

    return {
      chatMessagesRemoved,
      sessionsRemoved,
      paymentsRemoved,
      shareSnapshotsRemoved,
      accountRemoved,
      userRemoved,
    };
}
