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

/** Delete account row only (no linked profile yet). */
export async function deleteUserAccountOnly(
  accountId: string
): Promise<Pick<DeleteUserAccountResult, "accountRemoved">> {
  return withTransaction(async (client) => {
    const result = await client.query(`DELETE FROM user_accounts WHERE id = $1`, [accountId]);
    return { accountRemoved: result.rowCount ?? 0 };
  });
}

/**
 * Irreversibly deletes a user account and all associated data (152-FZ right to erasure).
 */
export async function deleteUserAccountCompletely(
  accountId: string,
  profileUserId: string
): Promise<DeleteUserAccountResult> {
  return withTransaction((client) => deleteUserAccountInTransaction(client, accountId, profileUserId));
}

/** Worker calls this inside the same transaction as its durable stage change. */
export async function deleteUserAccountInTransaction(
  client: PoolClient,
  accountId: string,
  profileUserId: string
): Promise<DeleteUserAccountResult> {
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
