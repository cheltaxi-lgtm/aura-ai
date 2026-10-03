import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { query, withTransaction } from "@/lib/db";
import { hasTestDb, installDbLifecycle } from "./db/setup";

const transport = vi.hoisted(() => ({ deliver: vi.fn() }));
vi.mock("@/lib/email/transport", () => ({ deliverEmail: transport.deliver, getEmailTransportStatus: vi.fn() }));
import { sendEmail } from "@/lib/email/send";
import { captureEmailOwners, logEmailAttempt } from "@/lib/email/log";
import { purgeAccountEmailLogsInTransaction } from "@/lib/user-deletion";

describe.runIf(hasTestDb)("email logs retain ownership across address changes", () => {
  installDbLifecycle();
  beforeEach(() => transport.deliver.mockReset().mockResolvedValue({ ok: true, provider: "smtp" }));
  afterEach(async () => { await query("DELETE FROM email_log WHERE template='email_owner_fixture'"); });
  async function seed() {
    const id = randomUUID(), address = `${id}@email-owner.test`;
    await query("INSERT INTO user_accounts(id,email,name) VALUES($1,$2,'Email owner fixture')", [id,address]);
    return { id, address };
  }
  const log = (recipient: string, ownerAccountIds?: string[]) => logEmailAttempt({recipient,subject:"Fixture",template:"email_owner_fixture",provider:"smtp",status:"sent",ownerAccountIds});
  const rows = async () => (await query("SELECT recipient,owner_account_ids FROM email_log WHERE template='email_owner_fixture'")).rows;

  it("purges old-address logs after every current address has changed", async () => {
    const { id,address } = await seed();
    await log(address);
    expect((await rows())[0].owner_account_ids).toEqual([id]);
    await query("UPDATE user_accounts SET email=$2 WHERE id=$1", [id,`${id}-new@email-owner.test`]);
    await withTransaction(client => purgeAccountEmailLogsInTransaction(client,id));
    expect(await rows()).toEqual([]);
  });

  it("captures the owner before transport, even if the address changes while sending", async () => {
    const { id,address } = await seed();
    transport.deliver.mockImplementationOnce(async () => {
      await query("UPDATE user_accounts SET email=$2 WHERE id=$1", [id,`${id}-new@email-owner.test`]);
      return { ok:true, provider:"smtp" };
    });
    expect(await sendEmail({to:address,subject:"Fixture",html:"<p>Fixture</p>",text:"Fixture",template:"email_owner_fixture"})).toBe(true);
    expect((await rows())[0].owner_account_ids).toEqual([id]);
    await withTransaction(client => purgeAccountEmailLogsInTransaction(client,id));
    expect(await rows()).toEqual([]);
  });

  it.each(["accepted", "deleted"])("rejects late logging after owner erasure is %s, even at an old address", async state => {
    const { id,address } = await seed();
    transport.deliver.mockImplementationOnce(async () => {
      if (state === "deleted") await query("DELETE FROM user_accounts WHERE id=$1", [id]);
      else await query("UPDATE user_accounts SET email=$2,erasure_requested_at=NOW() WHERE id=$1", [id,`${id}-new@email-owner.test`]);
      return { ok:true, provider:"smtp" };
    });
    await sendEmail({to:address,subject:"Fixture",html:"<p>Fixture</p>",text:"Fixture",template:"email_owner_fixture"});
    expect(await rows()).toEqual([]);
  });

  it("retains explicit ownership for an unverified new contact address", async () => {
    const { id } = await seed(), address = `${randomUUID()}@pending-contact.test`;
    await sendEmail({to:address,ownerAccountId:id,subject:"Fixture",html:"<p>Fixture</p>",text:"Fixture",template:"email_owner_fixture"});
    expect((await rows())[0].owner_account_ids).toEqual([id]);
    await query("DELETE FROM user_accounts WHERE id=$1", [id]);
    const captured = await captureEmailOwners(address,id);
    await log(`${randomUUID()}@unrelated.test`,captured);
    expect(await rows()).toHaveLength(1);
  });

  it("retains both an explicit subject owner and a distinct recipient account", async () => {
    const a = await seed(), b = await seed();
    const captured = await captureEmailOwners(b.address,a.id);
    expect(captured).toEqual([a.id,b.id].sort());
    await log(b.address,captured);
    expect((await rows())[0].owner_account_ids).toEqual([a.id,b.id].sort());
    await withTransaction(client => purgeAccountEmailLogsInTransaction(client,a.id));
    expect(await rows()).toEqual([]);
  });
});
