import { getProPool } from "../db";

/** Main erasure already holds the user lock. A separate Pro database commits
 * this idempotent cascade before the durable site-deleted stage can advance. */
export async function eraseProAccountData(userId: string): Promise<void> {
  const client = await getProPool().connect();
  try {
    await client.query("BEGIN");
    const present = (await client.query("SELECT to_regclass('pro.accounts') IS NOT NULL AS present")).rows[0].present;
    if (present) {
      const audit=(await client.query("SELECT to_regclass('pro.audit_log') IS NOT NULL AS present")).rows[0].present;
      if(audit)await client.query("DELETE FROM pro.audit_log WHERE actor_user_id=$1 OR account_id IN (SELECT id FROM pro.accounts WHERE user_id=$1)",[userId]);
      const avito=(await client.query("SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='pro' AND table_name='avito_chats' AND column_name='account_id') AS present")).rows[0].present;
      if(avito)await client.query("DELETE FROM pro.avito_chats WHERE account_id IN (SELECT id FROM pro.accounts WHERE user_id=$1)",[userId]);
      await client.query("DELETE FROM pro.accounts WHERE user_id=$1", [userId]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}
