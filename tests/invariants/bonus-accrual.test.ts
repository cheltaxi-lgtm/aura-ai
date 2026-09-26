import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac, randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import { query } from "@/lib/db";
import { claimDailyBonus, dailyBonusState, getDailyBonusStatus } from "@/lib/daily-bonus";
import { countAchievementDays, getUserStats, checkAchievements } from "@/lib/achievements";
import { getRuneBalance, grantStarterRunesIfNeeded, adminGrantRunes } from "@/lib/rune-service";
import { completePayment, completeYoomoneyPayment, recordPayment } from "@/lib/session";
import { verifyBonusEmail } from "@/lib/bonus-email-verification";
import { upsertOAuthAccount } from "@/lib/oauth/accounts";
import { isForegroundVisit } from "@/hooks/useDailyBonus";
import { PAID_ROUTE_LIMITS } from "@/lib/api-guards";
import { hasTestDb, installDbLifecycle } from "./db/setup";
import { createTestUser } from "./db/fixtures";
vi.mock("@/lib/email/send",()=>({sendEmail:vi.fn().mockResolvedValue(true)}));
afterEach(()=>vi.unstubAllEnvs());
describe("bonus policy boundaries",()=>{
  it("needs a trusted action on a visible page, not a background load or timer",()=>{
    expect(isForegroundVisit({isTrusted:true},"visible")).toBe(true);
    expect(isForegroundVisit({isTrusted:false},"visible")).toBe(false);
    expect(isForegroundVisit({isTrusted:true},"hidden")).toBe(false);
    expect(PAID_ROUTE_LIMITS.daily_bonus.windowMs).toBe(60_000);
    expect(PAID_ROUTE_LIMITS.daily_bonus.max).toBeGreaterThan(1);
  });
  it("uses exact 24h eligibility and server time",()=>{
    const row={rune_balance:5,last_daily_bonus:new Date("2026-09-20T10:00:00Z"),server_now:new Date("2026-09-21T09:59:59.999Z")};
    expect(dailyBonusState(row)).toMatchObject({available:false,nextEligibleAt:"2026-09-21T10:00:00.000Z",nextBonusIn:"0ч 1м"});
    expect(dailyBonusState({...row,server_now:new Date("2026-09-21T10:00:00Z")})).toMatchObject({available:true});
  });
  it("recognizes current and historical UTC streaks independently of the process timezone",()=>{
    const days=Array.from({length:7},(_,i)=>`2026-09-${21-i}`);
    expect(countAchievementDays(days,new Date("2026-09-21T00:01:00Z"))).toEqual({currentStreak:7,longestStreak:7});
    expect(countAchievementDays(days,new Date("2026-09-23T00:01:00Z"))).toEqual({currentStreak:0,longestStreak:7});
    expect(countAchievementDays(["2026-09-21","2026-09-19"],new Date("2026-09-21T10:00:00Z"))).toEqual({currentStreak:1,longestStreak:1});
  });
});
describe.skipIf(!hasTestDb)("bonus transactions (isolated PostgreSQL)",()=>{
  installDbLifecycle();
  beforeEach(()=>vi.stubEnv("FIRST_EXPERIENCE_ENABLED","true"));
  async function accountFor(userId:string,pending=false) {
    return (await query<{id:string}>(`INSERT INTO user_accounts(email,name,profile_user_id,bonus_email_verification_required)
      VALUES($1,'Bonus Test',$2,$3) RETURNING id`,[`${randomUUID()}@example.test`,userId,pending])).rows[0];
  }
  it("20 concurrent visits grant exactly five runes once; reads and absence never grant",async()=>{
    const user=await createTestUser();
    await query("UPDATE users SET last_daily_bonus=NOW()-INTERVAL '30 days' WHERE id=$1",[user.id]);
    await getDailyBonusStatus(user.id);expect(await getRuneBalance(user.id)).toBe(0);
    const claims=await Promise.all(Array.from({length:20},()=>claimDailyBonus(user.id)));
    expect(claims.filter(x=>x.claimed)).toHaveLength(1);expect(await getRuneBalance(user.id)).toBe(5);
    expect((await query("SELECT id FROM rune_transactions WHERE user_id=$1 AND type='daily_bonus'",[user.id])).rows).toHaveLength(1);
    expect(await claimDailyBonus(user.id)).toMatchObject({claimed:false,alreadyClaimed:true});
  });
  it("rolls back a failed daily ledger insert without consuming eligibility",async()=>{
    const user=await createTestUser();
    await query("ALTER TABLE rune_transactions ADD CONSTRAINT bonus_audit_reject CHECK(type <> 'daily_bonus') NOT VALID");
    try {await expect(claimDailyBonus(user.id)).rejects.toThrow();expect(await getRuneBalance(user.id)).toBe(0);}
    finally {await query("ALTER TABLE rune_transactions DROP CONSTRAINT bonus_audit_reject");}
    expect(await claimDailyBonus(user.id)).toMatchObject({claimed:true,newBalance:5});
  });
  it("does not award starter/daily/achievement credits before email proof; proof is owner-bound and idempotent",async()=>{
    const user=await createTestUser();const account=await accountFor(user.id,true);
    expect(await grantStarterRunesIfNeeded(user.id)).toBeNull();
    expect(await getDailyBonusStatus(user.id)).toMatchObject({available:false,verificationRequired:true});
    await expect(claimDailyBonus(user.id)).rejects.toThrow("bonus_email_verification_required");
    vi.stubEnv("AUTH_SECRET","bonus-test-signing-secret-for-local-tests-only");
    const email=(await query<{email:string}>("SELECT email FROM user_accounts WHERE id=$1",[account.id])).rows[0].email;
    const token=await new SignJWT({purpose:"bonus-email",email,tv:0}).setProtectedHeader({alg:"HS256"}).setAudience("bonus-email").setSubject(account.id).setExpirationTime("1h").sign(createHmac("sha256",process.env.AUTH_SECRET!).update("zovus:bonus-email:v1").digest());
    await expect(verifyBonusEmail(randomUUID(),token)).rejects.toThrow();
    const grants=await Promise.all(Array.from({length:4},()=>verifyBonusEmail(account.id,token)));
    expect(grants.filter(Boolean)).toHaveLength(1);expect(await getRuneBalance(user.id)).toBe(40);
  });
  it("computes a real PostgreSQL DATE series and grants all earned numerical achievements, never sensitive keywords",async()=>{
    const user=await createTestUser();
    const session=(await query<{id:string}>("INSERT INTO sessions(user_id) VALUES($1) RETURNING id",[user.id])).rows[0];
    await query(`INSERT INTO chat_messages(session_id,character_id,role,content,owner_user_id,created_at)
      SELECT $1,'veronika','user','смерть болезнь',$2,(NOW() AT TIME ZONE 'UTC')::date::timestamp AT TIME ZONE 'UTC' - n*INTERVAL '1 day'
      FROM generate_series(0,6) n`,[session.id,user.id]);
    expect(await getUserStats(user.id,"veronika")).toMatchObject({currentStreak:7,longestStreak:7});
    await checkAchievements(user.id,"veronika","смерть болезнь");
    const keys=(await query<{achievement:string}>("SELECT achievement FROM user_achievements WHERE user_id=$1",[user.id])).rows.map(x=>x.achievement);
    expect(keys).toEqual(expect.arrayContaining(["first_message","week_streak"]));expect(keys).not.toContain("brave_question");
  });
  it("keeps payment pending on failed bonus and retries atomically from its frozen amount",async()=>{
    const user=await createTestUser();const session=(await query<{id:string}>("INSERT INTO sessions(user_id) VALUES($1) RETURNING id",[user.id])).rows[0];
    const paymentId=randomUUID();await recordPayment({sessionId:session.id,yukassaPaymentId:paymentId,amount:590,paymentType:"subscription",bonusRunes:118});
    await query("ALTER TABLE rune_transactions ADD CONSTRAINT bonus_audit_reject CHECK(type <> 'bonus') NOT VALID");
    try {
      await expect(completePayment(paymentId,590)).rejects.toThrow();
      expect((await query("SELECT status FROM payments WHERE yukassa_payment_id=$1",[paymentId])).rows[0].status).toBe("pending");
      expect((await query("SELECT paid_until FROM sessions WHERE id=$1",[session.id])).rows[0].paid_until).toBeNull();
    } finally {await query("ALTER TABLE rune_transactions DROP CONSTRAINT bonus_audit_reject");}
    const completed=await Promise.all(Array.from({length:5},()=>completePayment(paymentId,590)));
    expect(completed.filter(Boolean)).toHaveLength(1);expect(await getRuneBalance(user.id)).toBe(118);
    const expiry=(await query("SELECT paid_until FROM sessions WHERE id=$1",[session.id])).rows[0].paid_until;
    expect(await completePayment(paymentId,590)).toBeNull();
    expect((await query("SELECT paid_until FROM sessions WHERE id=$1",[session.id])).rows[0].paid_until).toEqual(expiry);
  });
  it("a single-session purchase never marks unrelated saved readings as paid",async()=>{
    const user=await createTestUser();
    const first=(await query<{id:string}>("INSERT INTO sessions(user_id) VALUES($1) RETURNING id",[user.id])).rows[0];
    const second=(await query<{id:string}>("INSERT INTO sessions(user_id) VALUES($1) RETURNING id",[user.id])).rows[0];
    const readings=(await query<{id:string}>(`INSERT INTO history(user_id,character_name,context_data)
      VALUES($1,'tarot','{}'::jsonb),($1,'natal','{}'::jsonb) RETURNING id`,[user.id])).rows;
    const paymentId=randomUUID();
    await recordPayment({sessionId:first.id,yukassaPaymentId:paymentId,amount:190,paymentType:"single",bonusRunes:0});
    expect(await completePayment(paymentId,190)).not.toBeNull();
    expect((await query<{has_single_unlock:boolean}>("SELECT has_single_unlock FROM sessions WHERE id=$1",[first.id])).rows[0].has_single_unlock).toBe(true);
    expect((await query<{has_single_unlock:boolean}>("SELECT has_single_unlock FROM sessions WHERE id=$1",[second.id])).rows[0].has_single_unlock).toBe(false);
    expect((await query<{id:string;is_paid:boolean}>("SELECT id,is_paid FROM history WHERE id=ANY($1::uuid[]) ORDER BY id",[readings.map(row=>row.id)])).rows)
      .toEqual(readings.map(row=>({id:row.id,is_paid:false})).sort((a,b)=>a.id.localeCompare(b.id)));
  });
  it("binds YooMoney to its specific checkout and deduplicates repeated notifications",async()=>{
    const user=await createTestUser();const session=(await query<{id:string}>("INSERT INTO sessions(user_id) VALUES($1) RETURNING id",[user.id])).rows[0];
    const orders=[randomUUID(),randomUUID()];
    for(const orderId of orders)await recordPayment({sessionId:session.id,orderId,amount:590,paymentType:"subscription",bonusRunes:118});
    const data={sessionId:session.id,plan:"subscription" as const,amount:590,operationId:randomUUID()};
    expect(await completeYoomoneyPayment(data)).toBeNull();
    expect(await completeYoomoneyPayment({...data,orderId:randomUUID()})).toBeNull();
    expect(await completeYoomoneyPayment({...data,orderId:orders[1]})).not.toBeNull();
    expect(await completeYoomoneyPayment({...data,orderId:orders[1]})).toMatchObject({alreadyCompleted:true});
    expect(await getRuneBalance(user.id)).toBe(118);
    expect((await query("SELECT status FROM payments WHERE order_id=$1",[orders[0]])).rows[0].status).toBe("pending");
  });
  it("rejects email-only OAuth merging into pre-created credentials",async()=>{
    const user=await createTestUser();const account=await accountFor(user.id);
    const email=(await query("SELECT email FROM user_accounts WHERE id=$1",[account.id])).rows[0].email;
    await expect(upsertOAuthAccount({provider:"yandex",info:{providerUserId:"verified-owner",email,emailVerified:true,name:"Owner"}})).rejects.toThrow("ACCOUNT_LINK_REQUIRED");
    expect((await query("SELECT id FROM user_oauth_identities WHERE user_account_id=$1",[account.id])).rows).toHaveLength(0);
  });
  it("deduplicates concurrent admin retries and rejects payload changes",async()=>{
    const user=await createTestUser();
    const admin=(await query<{id:string}>("INSERT INTO admin_accounts(email,password_hash,name) VALUES($1,'test','Test') RETURNING id",[`${randomUUID()}@example.test`])).rows[0];
    const id=randomUUID();await Promise.all(Array.from({length:5},()=>adminGrantRunes(user.id,25,"Test grant",admin.id,id)));
    expect(await getRuneBalance(user.id)).toBe(25);
    await expect(adminGrantRunes(user.id,26,"Test grant",admin.id,id)).rejects.toThrow("grant_operation_conflict");
  });
});
