import { randomUUID } from "node:crypto";
import { query, withTransaction } from "@/lib/db";
import { deleteUserAccountInTransaction } from "@/lib/user-deletion";
import { callBotAdmin } from "@/lib/telegram/bot-admin-client";

export type ErasureStage = "pending" | "bot_purged" | "site_deleted" | "completed";
export type AccountErasureJob = {
  id: string;
  account_id: string;
  profile_user_id: string | null;
  telegram_user_ids: string[];
  stage: ErasureStage;
  attempts: number;
  lease_token: string | null;
};
const JOB_COLUMNS = "id, account_id, profile_user_id, telegram_user_ids::text[] AS telegram_user_ids, stage, attempts, lease_token";

/** The only entry point for full erasure. No network calls occur in this transaction. */
export async function requestAccountErasure(accountId: string): Promise<{ operationId: string; pending: boolean }> {
  const accepted = await withTransaction(async (client) => {
    const { rows: accounts } = await client.query<{ id: string; profile_user_id: string | null }>(
      `SELECT id, profile_user_id FROM user_accounts WHERE id = $1 FOR UPDATE`, [accountId]
    );
    const existing = await client.query<{ id: string; stage: ErasureStage }>(
      `SELECT id, stage FROM account_erasure_jobs WHERE account_id = $1`, [accountId]
    );
    if (existing.rows[0]) return { operationId: existing.rows[0].id, pending: existing.rows[0].stage !== "completed" };
    const account = accounts[0];
    if (!account) throw new Error("account_not_found");
    if (account.profile_user_id) {
      await client.query(`SELECT id FROM users WHERE id = $1 FOR UPDATE`, [account.profile_user_id]);
    }
    const { rows: identities } = await client.query<{ telegram_user_id: string }>(
      `SELECT telegram_user_id::text FROM user_telegram_identities
       WHERE user_account_id = $1 ORDER BY telegram_user_id`, [accountId]
    );
    const ids = identities.map((row) => row.telegram_user_id);
    for (const id of ids) {
      if (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id)) || Number(id) <= 0) {
        throw new Error("invalid_telegram_identity");
      }
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`telegram:${id}`]);
    }
    // Linkers acquire the Telegram advisory lock before the identity row. The
    // account lock already serializes same-account link/unlink; use that same
    // order here so a link attempt from another account cannot deadlock us.
    const lockedIdentities = await client.query<{ telegram_user_id: string }>(
      `SELECT telegram_user_id::text FROM user_telegram_identities
       WHERE user_account_id = $1 ORDER BY telegram_user_id FOR UPDATE`, [accountId]
    );
    if (JSON.stringify(lockedIdentities.rows.map(row => row.telegram_user_id)) !== JSON.stringify(ids)) {
      throw new Error("erasure_identity_changed");
    }
    const operationId = randomUUID();
    await client.query(
      `INSERT INTO account_erasure_jobs (id, account_id, profile_user_id, telegram_user_ids)
       VALUES ($1, $2, $3, $4::bigint[])`, [operationId, accountId, account.profile_user_id, ids]
    );
    await client.query(
      `UPDATE user_accounts SET erasure_requested_at = NOW(), token_version = token_version + 1 WHERE id = $1`, [accountId]
    );
    if (account.profile_user_id) {
      await client.query(`UPDATE users SET erasure_requested_at = NOW() WHERE id = $1`, [account.profile_user_id]);
    }
    return { operationId, pending: true };
  });
  // Route handlers still re-read the DB. Invalidate the optional edge cache too.
  const { invalidateTokenVersionCache } = await import("@/lib/token-version-gate");
  invalidateTokenVersionCache(accountId);
  return accepted;
}

export async function pendingTelegramErasure(telegramUserId: number): Promise<{ id: string } | null> {
  const { rows } = await query<{ id: string }>(
    `SELECT id FROM account_erasure_jobs
     WHERE stage <> 'completed' AND telegram_user_ids @> ARRAY[$1::bigint] LIMIT 1`, [telegramUserId]
  );
  return rows[0] ?? null;
}

async function claimErasure(): Promise<AccountErasureJob | null> {
  const lease = randomUUID();
  const { rows } = await query<AccountErasureJob>(
    `UPDATE account_erasure_jobs SET lease_token = $1, lease_until = NOW() + INTERVAL '3 minutes',
       attempts = attempts + 1, updated_at = NOW()
     WHERE id = (SELECT id FROM account_erasure_jobs
       WHERE stage <> 'completed' AND next_attempt_at <= NOW()
         AND (lease_until IS NULL OR lease_until < NOW())
       ORDER BY next_attempt_at, created_at FOR UPDATE SKIP LOCKED LIMIT 1)
     RETURNING ${JOB_COLUMNS}`, [lease]
  );
  return rows[0] ?? null;
}

async function advance(job: AccountErasureJob, stage: ErasureStage): Promise<void> {
  const { rowCount } = await query(
    `UPDATE account_erasure_jobs SET stage = $3, updated_at = NOW(),
       lease_until = NOW() + INTERVAL '3 minutes'
     WHERE id = $1 AND lease_token = $2 AND lease_until > NOW()`, [job.id, job.lease_token, stage]
  );
  if (rowCount !== 1) throw new Error("erasure_lease_lost");
  job.stage = stage;
}

async function runErasure(job: AccountErasureJob): Promise<void> {
  if (job.stage === "pending") {
    for (const id of job.telegram_user_ids) {
      const response = await callBotAdmin("begin_user_erasure", {
        telegram_user_id: Number(id), operation_id: job.id,
      }, "account-erasure-worker");
      if (!response.ok || response.data.deleted !== true) throw new Error("bot_erasure_unconfirmed");
    }
    await advance(job, "bot_purged");
  }
  if (job.stage === "bot_purged") {
    await withTransaction(async (client) => {
      const locked = await client.query(
        `SELECT id FROM account_erasure_jobs WHERE id = $1 AND lease_token = $2
         AND lease_until > NOW() FOR UPDATE`, [job.id, job.lease_token]
      );
      if (!locked.rows[0]) throw new Error("erasure_lease_lost");
      const account = await client.query<{ profile_user_id: string | null; erasure_requested_at: unknown }>(
        `SELECT profile_user_id, erasure_requested_at FROM user_accounts WHERE id = $1 FOR UPDATE`, [job.account_id]
      );
      if (account.rows[0] && (!account.rows[0].erasure_requested_at || account.rows[0].profile_user_id !== job.profile_user_id)) {
        throw new Error("erasure_identity_changed");
      }
      // Unused bot link challenges can contain PII without an account FK.
      for (const id of job.telegram_user_ids) {
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`telegram:${id}`]);
      }
      await client.query(`DELETE FROM telegram_auth_challenges WHERE telegram_user_id = ANY($1::bigint[])`, [job.telegram_user_ids]);
      if (job.profile_user_id) {
        await deleteUserAccountInTransaction(client, job.account_id, job.profile_user_id);
      } else {
        await client.query(`DELETE FROM user_accounts WHERE id = $1`, [job.account_id]);
      }
      await client.query(
        `UPDATE account_erasure_jobs SET stage = 'site_deleted', updated_at = NOW(),
         lease_until = NOW() + INTERVAL '3 minutes' WHERE id = $1 AND lease_token = $2`, [job.id, job.lease_token]
      );
    });
    job.stage = "site_deleted";
  }
  if (job.stage === "site_deleted") {
    for (const id of job.telegram_user_ids) {
      const response = await callBotAdmin("complete_user_erasure", {
        telegram_user_id: Number(id), operation_id: job.id,
      }, "account-erasure-worker");
      if (!response.ok || response.data.completed !== true) throw new Error("bot_erasure_release_unconfirmed");
    }
    const { rowCount } = await query(
      `UPDATE account_erasure_jobs SET stage = 'completed', completed_at = NOW(), updated_at = NOW(),
         telegram_user_ids = '{}', profile_user_id = NULL, lease_token = NULL, lease_until = NULL, last_error = NULL
       WHERE id = $1 AND lease_token = $2 AND lease_until > NOW()`, [job.id, job.lease_token]
    );
    if (rowCount !== 1) throw new Error("erasure_lease_lost");
  }
}

/** Independent worker lane: provider/bot outages retain intent with bounded backoff. */
export async function processDueAccountErasures(limit = 3): Promise<{ completed: number; failed: number }> {
  await query(`DELETE FROM account_erasure_jobs WHERE stage = 'completed' AND completed_at < NOW() - INTERVAL '30 days'`);
  const result = { completed: 0, failed: 0 };
  for (let index = 0; index < Math.max(1, Math.min(10, limit)); index++) {
    const job = await claimErasure();
    if (!job) break;
    try {
      await runErasure(job);
      result.completed++;
    } catch (error) {
      result.failed++;
      const code = error instanceof Error && /^(bot_erasure_|erasure_)/.test(error.message)
        ? error.message.slice(0, 80) : "erasure_database_error";
      await query(
        `UPDATE account_erasure_jobs SET last_error = $3, lease_token = NULL, lease_until = NULL,
           next_attempt_at = NOW() + ($4 * INTERVAL '1 second'), updated_at = NOW()
         WHERE id = $1 AND lease_token = $2`,
        [job.id, job.lease_token, code, Math.min(3600, 5 * 2 ** Math.min(job.attempts, 10))]
      );
    }
  }
  return result;
}
