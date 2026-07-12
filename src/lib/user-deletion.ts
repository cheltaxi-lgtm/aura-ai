import { withTransaction } from "@/lib/db";

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
  return withTransaction(async (client) => {
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
  });
}
