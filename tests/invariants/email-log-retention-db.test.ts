import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { getPool, query, withTransaction } from "@/lib/db";
import { pruneOwnerlessEmailLogs } from "@/lib/email/log";
import { purgeAccountEmailLogsInTransaction } from "@/lib/user-deletion";
import { hasTestDb, installDbLifecycle } from "./db/setup";

describe.runIf(hasTestDb)("ownerless diagnostic email retention (real PostgreSQL)", () => {
  installDbLifecycle();
  afterEach(async () => { await query("DELETE FROM email_log WHERE template='email_retention_fixture'"); });
  async function log(days: number, status = "sent", owner?: string) {
    const id = randomUUID();
    await query(`INSERT INTO email_log(id,recipient,subject,template,status,owner_account_ids,created_at)
      VALUES($1,$2,'Diagnostic fixture','email_retention_fixture',$3,$4::uuid[],NOW()-($5*INTERVAL '1 day'))`,
      [id, `${id}@email-retention.test`, status, owner ? [owner] : [], days]);
    return id;
  }
  const remaining = async () => (await query("SELECT id FROM email_log WHERE template='email_retention_fixture' ORDER BY id")).rows.map(row => row.id);

  it("prunes old ownerless logs in every status while keeping recent diagnostics and owned erasure semantics", async () => {
    const owner = randomUUID();
    await query("INSERT INTO user_accounts(id,email,name) VALUES($1,$2,'Retention fixture')", [owner, `${owner}@email-retention.test`]);
    for (const status of ["sent", "failed", "skipped"]) await log(31, status);
    const recent = await log(29), owned = await log(60, "sent", owner);
    expect(await pruneOwnerlessEmailLogs()).toBe(3);
    expect(await remaining()).toEqual([recent, owned].sort());
    // Retention must neither unlink nor age out an owned diagnostic; normal erasure removes it.
    await query("UPDATE user_accounts SET email=$2 WHERE id=$1", [owner, `${owner}-new@email-retention.test`]);
    await withTransaction(client => purgeAccountEmailLogsInTransaction(client, owner));
    expect(await remaining()).toEqual([recent]);
    expect(await pruneOwnerlessEmailLogs()).toBe(0);
  });

  it("bounds each batch and skips a locked row without blocking another retention runner", async () => {
    const locked = await log(60);
    for (let i = 0; i < 4; i++) await log(31);
    const locker = await getPool().connect();
    try {
      await locker.query("BEGIN");
      await locker.query("SELECT id FROM email_log WHERE id=$1 FOR UPDATE", [locked]);
      expect(await pruneOwnerlessEmailLogs(2)).toBe(2);
      expect(await remaining()).toHaveLength(3);
      expect(await remaining()).toContain(locked);
      expect(await pruneOwnerlessEmailLogs(2)).toBe(2);
      expect(await remaining()).toEqual([locked]);
      await locker.query("COMMIT");
      expect(await pruneOwnerlessEmailLogs(2)).toBe(1);
      expect(await pruneOwnerlessEmailLogs(2)).toBe(0);
    } finally { await locker.query("ROLLBACK"); locker.release(); }
  });
});
