import { randomUUID } from "node:crypto";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { hasTestDb, ensureTestDbMigrated } from "./db/setup";
import { getPool, query } from "@/lib/db";
import { requestAccountErasure, processDueAccountErasures, pendingTelegramErasure } from "@/lib/account-erasure";
import { getAccountTokenVersion } from "@/lib/auth";
import { linkTelegramToAccount, unlinkTelegramFromAccount } from "@/lib/telegram/accounts";
import { createBotLinkCode } from "@/lib/telegram/link-code";

describe.skipIf(!hasTestDb)("durable account erasure (real PostgreSQL)", () => {
  const accountIds: string[] = [];
  const profileIds: string[] = [];
  let accountId: string;
  let profileId: string;
  let telegramId: number;
  let fetchMock: ReturnType<typeof vi.fn>;

  async function createAccount(linked = true, withProfile = true) {
    const aid = randomUUID(), pid = randomUUID();
    if (withProfile) {
      await query(`INSERT INTO users (id, name, gender, zodiac) VALUES ($1, 'Erasure test', 'female', '')`, [pid]);
      profileIds.push(pid);
    }
    await query(`INSERT INTO user_accounts (id, email, name, profile_user_id) VALUES ($1, $2, 'Erasure test', $3)`,
      [aid, `${aid}@erasure.test`, withProfile ? pid : null]);
    accountIds.push(aid);
    if (linked) await query(`INSERT INTO user_telegram_identities (user_account_id, telegram_user_id) VALUES ($1, $2)`, [aid, telegramId]);
    return { accountId: aid, profileId: pid };
  }
  const job = async () => (await query(`SELECT * FROM account_erasure_jobs WHERE account_id = $1`, [accountId])).rows[0];
  const retryNow = () => query(`UPDATE account_erasure_jobs SET next_attempt_at = NOW(), lease_until = NULL WHERE account_id = $1`, [accountId]);
  const link = (aid: string) => linkTelegramToAccount({ accountId: aid, data: {
    id: telegramId, first_name: "Test", auth_date: 1, hash: "test",
  } });

  beforeAll(() => ensureTestDbMigrated(), 180_000);
  beforeEach(async () => {
    telegramId = 8_000_000_000_000 + Math.floor(Math.random() * 1_000_000_000);
    ({ accountId, profileId } = await createAccount());
    vi.stubEnv("BOT_INTERNAL_BASE_URL", "http://offline-bot.internal");
    vi.stubEnv("BOT_INTERNAL_SECRET", "offline-test-secret");
    fetchMock = vi.fn(async (_url, options) => {
      const body = JSON.parse(options.body);
      // These locks would fail if the worker held an account transaction while
      // waiting on the bridge. Read through an independent pooled connection.
      const probe = await getPool().connect();
      try {
        await probe.query("BEGIN");
        await probe.query("SELECT id FROM user_accounts WHERE id = $1 FOR UPDATE NOWAIT", [accountId]);
        await probe.query("ROLLBACK");
      } finally { probe.release(); }
      return Response.json(body.action === "begin_user_erasure"
        ? { ok: true, deleted: true } : { ok: true, completed: true });
    });
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(async () => {
    vi.unstubAllGlobals(); vi.unstubAllEnvs();
    await query(`DELETE FROM account_erasure_jobs WHERE account_id = ANY($1::uuid[])`, [accountIds]);
    await query(`DELETE FROM user_accounts WHERE id = ANY($1::uuid[])`, [accountIds]);
    await query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [profileIds]);
    accountIds.length = 0; profileIds.length = 0;
  });

  it("accepts once without network, revokes auth and fences fresh writes and identity changes", async () => {
    const accepted = await requestAccountErasure(accountId);
    expect(await requestAccountErasure(accountId)).toEqual(accepted);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await getAccountTokenVersion(accountId)).toBeNull();
    await expect(unlinkTelegramFromAccount(accountId)).rejects.toThrow("account_erasure_pending");
    expect(await link(accountId)).toEqual({ ok: false, code: "erasure_pending" });
    await expect(createBotLinkCode({ telegramUserId: telegramId, firstName: "Must not persist" })).rejects.toThrow("account_erasure_pending");
    await expect(query(`INSERT INTO sessions (user_id, character_key) VALUES ($1, 'shri_raj')`, [profileId])).rejects.toThrow("account_erasure_pending");
    await expect(query(`UPDATE users SET rune_balance = 1 WHERE id = $1`, [profileId])).rejects.toThrow("account_erasure_pending");
    await expect(query(`UPDATE user_accounts SET profile_user_id = NULL WHERE id = $1`, [accountId])).rejects.toThrow("account_erasure_pending");
  });

  it("retains intent during bridge outage and automatically completes after retry", async () => {
    const accepted = await requestAccountErasure(accountId);
    fetchMock.mockRejectedValueOnce(new Error("bridge offline"));
    expect(await processDueAccountErasures(1)).toEqual({ completed: 0, failed: 1 });
    expect((await job()).stage).toBe("pending");
    expect((await query(`SELECT id FROM user_accounts WHERE id = $1`, [accountId])).rowCount).toBe(1);
    await retryNow();
    expect(await processDueAccountErasures(1)).toEqual({ completed: 1, failed: 0 });
    expect((await job()).stage).toBe("completed");
    expect((await job()).telegram_user_ids).toEqual([]);
    expect((await query(`SELECT id FROM users WHERE id = $1`, [profileId])).rowCount).toBe(0);
    expect(await requestAccountErasure(accountId)).toEqual({ operationId: accepted.operationId, pending: false });
    expect(fetchMock.mock.calls.every(([, options]) => JSON.parse(options.body).operation_id === accepted.operationId)).toBe(true);
  });

  it("keeps Telegram fenced after site deletion until bot finalize is acknowledged", async () => {
    await requestAccountErasure(accountId);
    const normal = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (url, options) => JSON.parse(options.body).action === "complete_user_erasure"
      ? Response.json({ ok: false }, { status: 503 }) : normal(url, options));
    expect((await processDueAccountErasures(1)).failed).toBe(1);
    expect((await job()).stage).toBe("site_deleted");
    expect((await query(`SELECT id FROM user_accounts WHERE id = $1`, [accountId])).rowCount).toBe(0);
    const next = await createAccount(false, false);
    expect(await link(next.accountId)).toEqual({ ok: false, code: "erasure_pending" });
    await expect(createBotLinkCode({ telegramUserId: telegramId })).rejects.toThrow("account_erasure_pending");
    fetchMock.mockImplementation(normal); fetchMock.mockClear();
    await retryNow();
    expect((await processDueAccountErasures(1)).completed).toBe(1);
    expect(fetchMock.mock.calls.map(([, options]) => JSON.parse(options.body).action)).toEqual(["complete_user_erasure"]);
    expect(await pendingTelegramErasure(telegramId)).toBeNull();
    expect((await link(next.accountId)).ok).toBe(true);
  });

  it("serializes a concurrent identity link before taking the durable snapshot", async () => {
    await query(`DELETE FROM user_telegram_identities WHERE user_account_id = $1`, [accountId]);
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      await client.query(`SELECT id FROM user_accounts WHERE id = $1 FOR UPDATE`, [accountId]);
      const accepting = requestAccountErasure(accountId);
      await client.query(`INSERT INTO user_telegram_identities (user_account_id, telegram_user_id) VALUES ($1, $2)`, [accountId, telegramId]);
      await client.query("COMMIT");
      await accepting;
      expect((await job()).telegram_user_ids.map(String)).toEqual([String(telegramId)]);
    } finally { client.release(); }
  });

  it("does not lock the identity before a competing account's Telegram advisory lock", async () => {
    const other = await createAccount(false, false);
    const linker = await getPool().connect();
    let accepting: Promise<{ operationId: string; pending: boolean }> | undefined;
    try {
      await linker.query("BEGIN");
      await linker.query(`SELECT id FROM user_accounts WHERE id = $1 FOR UPDATE`, [other.accountId]);
      await linker.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`telegram:${telegramId}`]);
      accepting = requestAccountErasure(accountId);
      // Observe the real wait, rather than relying on a scheduling delay. This
      // is the cross-account link path immediately before its identity lookup.
      await vi.waitFor(async () => {
        const waiters = await query(`SELECT 1 FROM pg_locks WHERE locktype = 'advisory'
          AND NOT granted AND objid = (hashtext($1)::bigint & 4294967295)::oid`, [`telegram:${telegramId}`]);
        expect(waiters.rowCount).toBeGreaterThan(0);
      }, { timeout: 3_000, interval: 20 });
      const identity = await linker.query(`SELECT user_account_id FROM user_telegram_identities
        WHERE telegram_user_id = $1 FOR UPDATE NOWAIT`, [telegramId]);
      expect(identity.rows[0].user_account_id).toBe(accountId);
      await linker.query("COMMIT");
      expect((await accepting).pending).toBe(true);
      expect((await job()).telegram_user_ids.map(String)).toEqual([String(telegramId)]);
    } finally {
      await linker.query("ROLLBACK");
      linker.release();
      await accepting;
    }
  });

  it("does not re-purge bot after a rolled-back site deletion transaction", async () => {
    await requestAccountErasure(accountId);
    await query(`CREATE OR REPLACE FUNCTION test_erasure_reject_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected deletion failure'; END $$`);
    await query(`CREATE TRIGGER test_erasure_delete_failure BEFORE DELETE ON user_accounts
      FOR EACH ROW WHEN (OLD.id = '${accountId}') EXECUTE FUNCTION test_erasure_reject_delete()`);
    try {
      expect((await processDueAccountErasures(1)).failed).toBe(1);
      expect((await job()).stage).toBe("bot_purged");
      expect((await query(`SELECT id FROM user_accounts WHERE id = $1`, [accountId])).rowCount).toBe(1);
    } finally {
      await query(`DROP TRIGGER test_erasure_delete_failure ON user_accounts`);
      await query(`DROP FUNCTION test_erasure_reject_delete()`);
    }
    fetchMock.mockClear(); await retryNow();
    expect((await processDueAccountErasures(1)).completed).toBe(1);
    expect(fetchMock.mock.calls.map(([, options]) => JSON.parse(options.body).action)).toEqual(["complete_user_erasure"]);
  });

  it("allows only one worker to own a bridge operation", async () => {
    await requestAccountErasure(accountId);
    let release!: () => void;
    let started!: () => void;
    const start = new Promise<void>((resolve) => { started = resolve; });
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const normal = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementationOnce(async (url, options) => { started(); await gate; return normal(url, options); });
    const first = processDueAccountErasures(1);
    await start;
    try { expect(await processDueAccountErasures(1)).toEqual({ completed: 0, failed: 0 }); }
    finally { release(); }
    expect(await first).toEqual({ completed: 1, failed: 0 });
  });

  it("stops a stale worker before site deletion when its lease changes", async () => {
    await requestAccountErasure(accountId);
    const normal = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementationOnce(async (url, options) => {
      await query(`UPDATE account_erasure_jobs SET lease_token = $2 WHERE account_id = $1`, [accountId, randomUUID()]);
      return normal(url, options);
    });
    expect(await processDueAccountErasures(1)).toEqual({ completed: 0, failed: 1 });
    expect((await job()).stage).toBe("pending");
    expect((await query(`SELECT id FROM user_accounts WHERE id = $1`, [accountId])).rowCount).toBe(1);
    await retryNow();
    expect((await processDueAccountErasures(1)).completed).toBe(1);
  });

  it("completes an account without profile or Telegram without bridge access", async () => {
    const bare = await createAccount(false, false);
    accountId = bare.accountId;
    await requestAccountErasure(accountId);
    expect((await processDueAccountErasures(1)).completed).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await query(`SELECT id FROM user_accounts WHERE id = $1`, [accountId])).rowCount).toBe(0);
  });
  it("atomically claims a matrix operation across access modes and retains its intent after session deletion", async () => {
    const operationId = randomUUID();
    const input = JSON.stringify({ subjectId: null, toolId: 'destiny_matrix', birthDate: '2000-01-02' });
    const claims = await Promise.all(Array.from({ length: 8 }, (_, index) => query(
      `INSERT INTO bot_matrix_operations (user_id, operation_id, input, billing_required)
       VALUES ($1, $2, $3::jsonb, $4) ON CONFLICT (user_id, operation_id) DO NOTHING RETURNING billing_required`,
      [profileId, operationId, input, index % 2 === 0]
    )));
    expect(claims.reduce((sum, result) => sum + (result.rowCount ?? 0), 0)).toBe(1);
    const winner = claims.find(result => result.rowCount === 1)!.rows[0].billing_required;
    expect((await query(`SELECT billing_required FROM bot_matrix_operations WHERE user_id = $1 AND operation_id = $2`,
      [profileId, operationId])).rows[0].billing_required).toBe(winner);
    const sessionId = (await query(`INSERT INTO sessions (user_id) VALUES ($1) RETURNING id`, [profileId])).rows[0].id;
    await query(`UPDATE bot_matrix_operations SET session_id = $3 WHERE user_id = $1 AND operation_id = $2`, [profileId, operationId, sessionId]);
    await query(`DELETE FROM sessions WHERE id = $1`, [sessionId]);
    expect((await query(`SELECT session_id FROM bot_matrix_operations WHERE user_id = $1`, [profileId])).rows[0].session_id).toBeNull();
    await requestAccountErasure(accountId);
    await expect(query(`INSERT INTO bot_matrix_operations (user_id, operation_id, input, billing_required) VALUES ($1, $2, $3::jsonb, false)`,
      [profileId, randomUUID(), input])).rejects.toThrow('account_erasure_pending');
    expect((await processDueAccountErasures(1)).completed).toBe(1);
    expect((await query(`SELECT 1 FROM bot_matrix_operations WHERE user_id = $1`, [profileId])).rowCount).toBe(0);
  });
});
