import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { getRuneSettings, setRuneSettings } from "@/lib/rune-settings";
import { getSetting, setSetting } from "@/lib/settings";
import { runePurchaseAttempt, prepareRunePurchaseAttempt, storePendingRunePurchase, clearPendingRunePurchase, readRunePurchaseDestination, rememberRunePurchaseDestination, readSelectedRuneCost } from "@/lib/rune-purchase-client";
import { query } from "@/lib/db";
import { grantStarterRunesIfNeeded, creditRunesFromPaymentDetailed, getRuneBalance, refundRunes } from "@/lib/rune-service";
import { chargeForSession, rollbackChargeEx } from "@/lib/services/billing-service";
import { getReadingJourney, saveJourneyNote, validJourneyTimezone } from "@/lib/reading-journey";
import { readingFollowupStage, runReadingFollowups } from "@/lib/reading-followup-service";
import { runeOrderQuote } from "@/lib/rune-order-quote";
import { isFirstExperienceEnabled, STARTER_BONUS_RUNES } from "@/lib/first-experience-policy";
import { hasTestDb, installDbLifecycle } from "./db/setup";
import { createTestUser } from "./db/fixtures";
import { applyReminderUnsubscribe } from "@/lib/reminder-unsubscribe";
import { sendEmail } from "@/lib/email/send";
import { notifyBotReminder } from "@/lib/telegram/notify-bot-reminder";
import { getFirstExperienceAnalytics } from "@/lib/first-experience-analytics";
import { formatBonusVersion, formatCohortDate } from "@/components/admin/FirstExperienceMetrics";
vi.mock("@/lib/email/send",async original=>({...await original<typeof import("@/lib/email/send")>(),sendEmail:vi.fn().mockResolvedValue(true)}));
vi.mock("@/lib/telegram/notify-bot-reminder",()=>({notifyBotReminder:vi.fn().mockResolvedValue({delivered:true})}));

const PROJECT_ROOT = path.resolve(__dirname, "../..");

afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
describe("first experience policy and consent",()=>{
  it("fails closed and uses one 40-rune policy",()=>{vi.stubEnv("FIRST_EXPERIENCE_ENABLED","false");expect(isFirstExperienceEnabled()).toBe(false);expect(STARTER_BONUS_RUNES).toBe(40);});
  it("presents cohort dates and bonus versions as human-readable labels",()=>{
    expect(formatBonusVersion("legacy")).toBe("Старый сценарий");
    expect(formatBonusVersion("starter-40-v1")).toBe("Бонус 40 рун");
    expect(formatBonusVersion("starter-100-v1")).toBe("Бонус 100 рун");
    expect(formatCohortDate("2026-09-08")).toContain("8");
    expect(formatCohortDate("2026-09-08")).not.toContain("2026-09-08");
  });
  it("builds a privacy-safe monotonic funnel from unique users",()=>{
    const analytics=fs.readFileSync(path.join(PROJECT_ROOT,"src/lib/first-experience-analytics.ts"),"utf8");
    const dashboard=fs.readFileSync(path.join(PROJECT_ROOT,"src/components/admin/FirstExperienceMetrics.tsx"),"utf8");
    expect(analytics).toContain("COUNT(DISTINCT m.user_id)");
    expect(analytics).toContain("LEFT JOIN LATERAL");
    expect(analytics).toContain("event='first_result' AND created_at>=bonus_spent.at");
    expect(analytics).toContain("event='first_topup' AND created_at>=payment_started.at");
    expect(analytics).toContain("INTERVAL '89 days'");
    expect(analytics).not.toContain("SELECT m.event,COUNT(*)::text AS count");
    expect(dashboard).toContain('className="space-y-3 p-3 md:hidden"');
    expect(dashboard).toContain('role="region" aria-label="Конверсия по когортам регистрации" tabIndex={0}');
    expect(dashboard).not.toContain("transition-colors");
  });
  it("keeps browser fixtures on the current starter policy",()=>{
    const e2eDir=path.join(PROJECT_ROOT,"tests/e2e");
    const stale=fs.readdirSync(e2eDir)
      .filter(name=>name.endsWith(".spec.ts"))
      .filter(name=>/starterRunes\s*:\s*300\b/.test(fs.readFileSync(path.join(e2eDir,name),"utf8")));
    expect(stale).toEqual([]);
  });
  it("passes the first-experience flag to paid async report workers",()=>{
    const sharedKeys=fs.readFileSync(path.join(PROJECT_ROOT,"hosting/async-jobs-shared.env.keys"),"utf8");
    const syncScript=fs.readFileSync(path.join(PROJECT_ROOT,"hosting/sync-async-jobs-env.sh"),"utf8");
    const workerUnit=fs.readFileSync(path.join(PROJECT_ROOT,"hosting/aura-ai-async-jobs.service"),"utf8");
    expect(sharedKeys).toMatch(/^FIRST_EXPERIENCE_ENABLED$/m);
    expect(syncScript).toContain("async-jobs-shared.env.keys");
    expect(workerUnit).toContain("EnvironmentFile=/opt/aura-ai/.env.async-jobs");
  });
  it("does not run delivery without its separate permission switch",async()=>{vi.stubEnv("FIRST_EXPERIENCE_ENABLED","true");vi.stubEnv("READING_FOLLOWUP_DELIVERY_ENABLED","false");expect(await runReadingFollowups()).toMatchObject({enabled:false,claimed:0});});
  it("uses IANA time, quiet hours, completed actions and no stale catchup",()=>{
    const base={completedAt:new Date("2026-09-01T06:00:00Z"),now:new Date("2026-09-03T08:00:00Z"),timezone:"Asia/Yekaterinburg",insight:"",reflection:""};
    expect(readingFollowupStage(base)).toBe(2);
    expect(readingFollowupStage({...base,insight:"Уже сохранено"})).toBeNull();
    expect(readingFollowupStage({...base,now:new Date("2026-09-03T18:00:00Z")})).toBeNull();
    expect(readingFollowupStage({...base,now:new Date("2026-09-08T08:00:00Z")})).toBe(7);
    expect(readingFollowupStage({...base,now:new Date("2026-09-08T08:00:00Z"),reflection:"Готово"})).toBeNull();
    expect(readingFollowupStage({...base,now:new Date("2026-10-08T08:00:00Z")})).toBeNull();
    expect(validJourneyTimezone("UTC")).toBe(true);expect(validJourneyTimezone("Etc/GMT-5")).toBe(true);expect(validJourneyTimezone("UTC+5")).toBe(false);expect(validJourneyTimezone("x".repeat(81))).toBe(false);
  });
  it("preserves selected service, isolates terminal payments and allows an explicit repeat purchase",async()=>{
    const storage=()=>{const store:Record<string,string>={};return Object.defineProperties(store,{getItem:{value:(k:string)=>store[k]??null},setItem:{value:(k:string,v:string)=>{store[k]=v;}},removeItem:{value:(k:string)=>{delete store[k];}}});};
    vi.stubGlobal("localStorage",storage());vi.stubGlobal("sessionStorage",storage());vi.stubGlobal("window",{location:{pathname:"/aura",search:""}});
    const first=runePurchaseAttempt("small");expect(runePurchaseAttempt("small")).toBe(first);storePendingRunePurchase("paid-A",20);expect(readRunePurchaseDestination()).toBe("/aura");
    const other=runePurchaseAttempt("large");storePendingRunePurchase("paid-B",20);clearPendingRunePurchase("paid-A",first);
    expect(localStorage.getItem("aura_pending_rune_payment_id")).toBe("paid-B");expect(runePurchaseAttempt("large")).toBe(other);expect(runePurchaseAttempt("small")).not.toBe(first);
    clearPendingRunePurchase("paid-B",other);expect(localStorage.getItem("aura_pending_rune_payment_id")).toBeNull();
    rememberRunePurchaseDestination("/gadanie-po-ladoni?reading=11111111-1111-4111-8111-111111111111",100);
    window.location.pathname="/cabinet";window.location.search="";expect(readSelectedRuneCost()).toBe(100);storePendingRunePurchase("paid-C",20);
    expect(readRunePurchaseDestination("paid-C")).toBe("/gadanie-po-ladoni?reading=11111111-1111-4111-8111-111111111111");
    expect(readRunePurchaseDestination("paid-A")).toBe("/aura");
    const cancelled=runePurchaseAttempt("cancelled");storePendingRunePurchase("paid-cancelled",20);
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,json:async()=>({status:"pending"})}));expect(await prepareRunePurchaseAttempt("cancelled")).toBe(cancelled);
    vi.stubGlobal("fetch",vi.fn().mockRejectedValue(new Error("network")));expect(await prepareRunePurchaseAttempt("cancelled")).toBe(cancelled);
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,json:async()=>({status:"cancelled"})}));expect(await prepareRunePurchaseAttempt("cancelled")).not.toBe(cancelled);
    for(const status of ["credited","already_credited"]){const prior=runePurchaseAttempt(status);storePendingRunePurchase(`paid-${status}`,20);vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,json:async()=>({status})}));expect(await prepareRunePurchaseAttempt(status)).not.toBe(prior);}
  });
  it("quotes exact package price, shortfall and both balances without inventing a package",()=>{
    const packages=[{id:"a",name:"A",runes:100,bonus_runes:0,price_rub:500},{id:"b",name:"B",runes:120,bonus_runes:0,price_rub:450}];
    expect(runeOrderQuote(100,35,5,packages)).toMatchObject({shortage:65,rubEquivalent:500,shortageRubEquivalent:325,package:{id:"b",price_rub:450,afterTopup:155,afterOrder:55}});
    expect(runeOrderQuote(1000,0,5,packages)?.package).toBeNull();
  });
});

describe.skipIf(!hasTestDb)("first experience (isolated database, no providers)",()=>{
  installDbLifecycle();beforeEach(()=>{vi.stubEnv("FIRST_EXPERIENCE_ENABLED","true");vi.stubEnv("READING_FOLLOWUP_DELIVERY_ENABLED","false");});
  it("baselines pre-rollout accounts without changing their balance",async()=>{
    const user=await createTestUser();
    await query("INSERT INTO user_accounts(profile_user_id,email,name) VALUES($1,$2,'Legacy fixture')",[user.id,`${crypto.randomUUID()}@example.invalid`]);
    await query("UPDATE users SET rune_balance=287,starter_runes_granted=FALSE,starter_bonus_version=NULL WHERE id=$1",[user.id]);
    const migration=fs.readFileSync(path.join(PROJECT_ROOT,"scripts/migrations/156_first_experience.sql"),"utf8");
    await query(migration);
    const state=await query<{rune_balance:number;starter_runes_granted:boolean;starter_bonus_version:string}>("SELECT rune_balance,starter_runes_granted,starter_bonus_version FROM users WHERE id=$1",[user.id]);
    expect(state.rows[0]).toEqual({rune_balance:287,starter_runes_granted:true,starter_bonus_version:"legacy-no-starter-grant"});
    expect(await grantStarterRunesIfNeeded(user.id)).toBeNull();
    expect(await getRuneBalance(user.id)).toBe(287);
  });
  it("keeps stored legacy bonus intact across effective admin saves and flag rollback",async()=>{
    const original=await getSetting("runes");
    try{await setSetting("runes",{...original,starterRunes:300});expect((await getRuneSettings()).starterRunes).toBe(40);await setRuneSettings({...await getRuneSettings(),freeQuestions:3});expect((await getSetting("runes")).starterRunes).toBe(300);vi.stubEnv("FIRST_EXPERIENCE_ENABLED","false");expect((await getRuneSettings()).starterRunes).toBe(300);}
    finally{await setSetting("runes",original);}
  });
  it("turns legacy paid scene flags off idempotently",async()=>{
    const original=await getSetting("visual");
    try {
      await setSetting("visual",{
        ...original,
        scenes:{
          ...original.scenes,
          tarot_atmosphere:true,
          destiny_card:true,
          scene_illustration:true,
          final_report:true,
        },
      });
      const migration=fs.readFileSync(path.join(PROJECT_ROOT,"scripts/migrations/157_disable_paid_scene_images.sql"),"utf8");
      await query(migration);
      await query(migration);
      const visual=await getSetting("visual");
      expect(visual.scenes).toMatchObject({
        tarot_atmosphere:false,
        destiny_card:false,
        scene_illustration:false,
        final_report:false,
      });
    } finally {
      await setSetting("visual",original);
    }
  });
  it("grants exactly once under parallel signup/OAuth/cabinet retries; preserves an existing grant",async()=>{
    const user=await createTestUser();const results=await Promise.all(Array.from({length:8},()=>grantStarterRunesIfNeeded(user.id)));
    expect(results.filter(Boolean)).toHaveLength(1);expect(await getRuneBalance(user.id)).toBe(40);
    expect((await query("SELECT 1 FROM spread_metrics WHERE user_id=$1 AND event='bonus_granted'",[user.id])).rowCount).toBe(1);
    await query("UPDATE users SET rune_balance=287,starter_runes_granted=FALSE WHERE id=$1",[user.id]);
    expect(await grantStarterRunesIfNeeded(user.id)).toBeNull();expect(await getRuneBalance(user.id)).toBe(287);
  });
  it("honors the old bonus promised to a registration pending verification",async()=>{
    const user=await createTestUser();
    const account=await query<{id:string}>(
      "INSERT INTO user_accounts(email,name,profile_user_id,bonus_email_verification_required) VALUES($1,$2,$3,TRUE) RETURNING id",
      [`pending-${user.id}@example.invalid`,"Pending Test",user.id]
    );
    expect(await grantStarterRunesIfNeeded(user.id)).toBeNull();
    const migration=fs.readFileSync(path.join(PROJECT_ROOT,"scripts/migrations/160_preserve_pending_starter_promise.sql"),"utf8");
    await query(migration);
    expect((await query<{starter_bonus_version:string}>("SELECT starter_bonus_version FROM users WHERE id=$1",[user.id])).rows[0].starter_bonus_version).toBe("starter-100-v1");
    await query("UPDATE user_accounts SET bonus_email_verification_required=FALSE,email_verified_at=NOW() WHERE id=$1",[account.rows[0].id]);
    const grant=await grantStarterRunesIfNeeded(user.id);
    expect(grant?.granted).toBe(100);
    expect(await getRuneBalance(user.id)).toBe(100);
    expect(await grantStarterRunesIfNeeded(user.id)).toBeNull();
    expect((await query<{starter_bonus_version:string}>("SELECT starter_bonus_version FROM users WHERE id=$1",[user.id])).rows[0].starter_bonus_version).toBe("starter-100-v1");
    const newcomer=await createTestUser();
    const newAccount=await query<{id:string}>(
      "INSERT INTO user_accounts(email,name,profile_user_id,bonus_email_verification_required) VALUES($1,$2,$3,TRUE) RETURNING id",
      [`new-${newcomer.id}@example.invalid`,"New Test",newcomer.id]
    );
    expect(await grantStarterRunesIfNeeded(newcomer.id)).toBeNull();
    expect((await query<{starter_bonus_version:string|null}>("SELECT starter_bonus_version FROM users WHERE id=$1",[newcomer.id])).rows[0].starter_bonus_version).toBeNull();
    await query("UPDATE user_accounts SET bonus_email_verification_required=FALSE,email_verified_at=NOW() WHERE id=$1",[newAccount.rows[0].id]);
    expect((await grantStarterRunesIfNeeded(newcomer.id))?.granted).toBe(40);
  });
  it("keeps account/profile creation and starter credit in one transaction",()=>{
    const registration=fs.readFileSync(path.join(PROJECT_ROOT,"src/app/api/auth/user/register/route.ts"),"utf8");
    const users=fs.readFileSync(path.join(PROJECT_ROOT,"src/lib/users.ts"),"utf8");
    const runes=fs.readFileSync(path.join(PROJECT_ROOT,"src/lib/rune-service.ts"),"utf8");
    const telegram=fs.readFileSync(path.join(PROJECT_ROOT,"src/lib/telegram/bot-offer-account.ts"),"utf8");
    expect(registration).toContain("grantStarterRunesIfNeeded(createdProfile.id, client)");
    expect(users).toContain("grantStarterRunesIfNeeded(created.id, client)");
    expect(runes).not.toContain("grantStarterRunesIfNeeded failed:");
    expect(telegram).toMatch(/await grantStarterRunesIfNeeded\(profileUserId\);[\s\S]*input\.memoryChoice/);
  });
  it("serializes bonus spend and refunds only the original amount once",async()=>{
    const user=await createTestUser();await grantStarterRunesIfNeeded(user.id);
    const results=await Promise.all(Array.from({length:4},()=>chargeForSession({userId:user.id,cost:30,actionType:"VISION_ANALYSIS",idempotencyKey:"same-order"})));
    const debit=results.find(r=>r.spentRunes===30)!;expect(results.filter(r=>r.spentRunes===30)).toHaveLength(1);expect(await getRuneBalance(user.id)).toBe(10);
    await expect(refundRunes(user.id,31,"error","VISION_ANALYSIS",debit.transactionId)).rejects.toThrow();
    await Promise.all(Array.from({length:4},()=>refundRunes(user.id,30,"error","VISION_ANALYSIS",debit.transactionId)));
    expect(await getRuneBalance(user.id)).toBe(40);
    expect((await query("SELECT 1 FROM spread_metrics WHERE user_id=$1 AND event='bonus_spent'",[user.id])).rowCount).toBe(1);
    expect((await query("SELECT 1 FROM spread_metrics WHERE user_id=$1 AND event='bonus_refunded'",[user.id])).rowCount).toBe(1);
    await expect(chargeForSession({userId:user.id,cost:41,actionType:"HD_REPORT",idempotencyKey:"low"})).rejects.toThrow();
    expect(await getRuneBalance(user.id)).toBe(40);
  });
  it("credits a verified price/rune snapshot once despite package changes, rejects mismatched RUB",async()=>{
    const user=await createTestUser();
    const payment={userId:user.id,packageId:"existing-at-checkout",paymentId:crypto.randomUUID(),amountRub:500,expectedPriceRub:500,expectedRunes:123};
    const results=await Promise.all(Array.from({length:5},()=>creditRunesFromPaymentDetailed(payment)));
    expect(results.filter(r=>r==="credited")).toHaveLength(1);expect(await getRuneBalance(user.id)).toBe(123);
    expect(results.filter(r=>r==="duplicate")).toHaveLength(4);
    expect(await creditRunesFromPaymentDetailed({...payment,paymentId:crypto.randomUUID(),amountRub:499})).toBe("rejected");
    expect((await query("SELECT 1 FROM spread_metrics WHERE user_id=$1 AND event='first_topup'",[user.id])).rowCount).toBe(1);
  });
  it("free question reservation and its refund are idempotent",async()=>{
    const user=await createTestUser();const session=await query<{id:string}>("INSERT INTO sessions(user_id,character_key) VALUES($1,'tarot') RETURNING id",[user.id]);
    const args={userId:user.id,cost:10,actionType:"QUESTION",sessionId:session.rows[0].id,reserveFreeSlot:true,freeQuestionLimit:2,idempotencyKey:"free-retry"};
    const first=await chargeForSession(args);await chargeForSession(args);
    expect((await query<{free_questions_used:number}>("SELECT free_questions_used FROM sessions WHERE id=$1",[args.sessionId])).rows[0].free_questions_used).toBe(1);
    await Promise.all(Array.from({length:3},()=>rollbackChargeEx({userId:user.id,cost:0,wasFreeQuestion:true,slotReserved:true,sessionId:args.sessionId,transactionId:first.transactionId})));
    expect((await query<{free_questions_used:number}>("SELECT free_questions_used FROM sessions WHERE id=$1",[args.sessionId])).rows[0].free_questions_used).toBe(0);
  });
  it("does not count a welcome message as the first useful result",async()=>{
    const user=await createTestUser();const session=await query<{id:string}>("INSERT INTO sessions(user_id,character_key) VALUES($1,'tarolog') RETURNING id",[user.id]);
    await query("INSERT INTO chat_messages(session_id,owner_user_id,character_id,role,content) VALUES($1,$2,'tarolog','assistant','Добро пожаловать. О чём поговорим?')",[session.rows[0].id,user.id]);
    expect(await getReadingJourney(user.id)).toBeNull();
    expect((await query("SELECT 1 FROM spread_metrics WHERE user_id=$1 AND event='first_result'",[user.id])).rowCount).toBe(0);
  });
  it("uses the saved relationship question without sending its text to analytics",async()=>{
    const user=await createTestUser();const session=await query<{id:string}>("INSERT INTO sessions(user_id,character_key) VALUES($1,'tarolog') RETURNING id",[user.id]);
    await query("INSERT INTO chat_messages(session_id,owner_user_id,character_id,role,content) VALUES($1,$2,'tarolog','user','Как наладить отношения с партнёром?'),($1,$2,'tarolog','assistant','Полный ответ о диалоге и взаимопонимании')",[session.rows[0].id,user.id]);
    const journey=await getReadingJourney(user.id,session.rows[0].id);expect(journey?.continuation?.product).toBe("matrix_compatibility");
    const events=await query("SELECT metadata FROM spread_metrics WHERE user_id=$1",[user.id]);expect(JSON.stringify(events.rows)).not.toContain("партнёром");
  });
  it("saves private notes free, excludes owned report and rejects another owner's reading",async()=>{
    const user=await createTestUser();const other=await createTestUser();
    const reading=await query<{id:string}>("INSERT INTO history(user_id,character_name,context_data) VALUES($1,'tarot',$2::jsonb) RETURNING id",[user.id,JSON.stringify({type:"aura_reading",report:"Полный текст без закрытого окончания"})]);
    const id=reading.rows[0].id;const input={insight:"Мой вывод",step:"Один шаг",reflection:"",reminder:true,timezone:"Asia/Yekaterinburg",channel:"email" as const};
    await saveJourneyNote(user.id,id,input);await saveJourneyNote(user.id,id,input);
    expect(await getRuneBalance(user.id)).toBe(0);const journey=await getReadingJourney(user.id,id);
    expect(journey?.note?.entry_text).toBe(input.insight);expect(journey?.continuation?.product).not.toBe("aura");
    expect((await query("SELECT 1 FROM diary_entries WHERE user_id=$1 AND reading_id=$2",[user.id,id])).rowCount).toBe(1);
    await expect(saveJourneyNote(other.id,id,input)).rejects.toThrow("reading_not_found");
    await expect(saveJourneyNote(user.id,id,{...input,reminder:false,timezone:"x".repeat(81)})).rejects.toThrow("invalid_reminder");
    await saveJourneyNote(user.id,id,{...input,reminder:false});expect((await getReadingJourney(user.id,id))?.note?.reminder_consent_at).toBeNull();
  });
  it("delivers one opted-in channel once across concurrent cron calls and honors unsubscribe",async()=>{
    expect(vi.isMockFunction(sendEmail)).toBe(true);expect(vi.isMockFunction(notifyBotReminder)).toBe(true);
    vi.mocked(sendEmail).mockClear();vi.mocked(notifyBotReminder).mockClear();vi.stubEnv("READING_FOLLOWUP_DELIVERY_ENABLED","true");
    const user=await createTestUser();const account=await query<{id:string}>("INSERT INTO user_accounts(profile_user_id,email,name) VALUES($1,$2,'Reminder fixture') RETURNING id",[user.id,`${crypto.randomUUID()}@example.invalid`]);
    await query("INSERT INTO user_telegram_identities(user_account_id,telegram_user_id) VALUES($1,123456789)",[account.rows[0].id]);
    const now=new Date("2026-09-08T10:00:00Z");
    await query("INSERT INTO diary_entries(user_id,character_key,entry_text,reading_id,reading_completed_at,reminder_consent_at,reminder_timezone,reminder_channel) VALUES($1,'personal','',$2,$3,NOW(),'UTC','email')",[user.id,crypto.randomUUID(),new Date("2026-09-06T09:00:00Z")]);
    await Promise.all([runReadingFollowups(now),runReadingFollowups(now)]);
    expect(sendEmail).toHaveBeenCalledTimes(1);expect(notifyBotReminder).not.toHaveBeenCalled();
    await applyReminderUnsubscribe(account.rows[0].id,"reading_followup");
    expect((await query("SELECT 1 FROM diary_entries WHERE user_id=$1 AND reminder_consent_at IS NOT NULL",[user.id])).rowCount).toBe(0);
    await runReadingFollowups(new Date("2026-09-13T10:00:00Z"));expect(sendEmail).toHaveBeenCalledTimes(1);
  });
  it("reports mature cohorts from confirmed ledger purchases and labels absent free costs",async()=>{
    const user=await createTestUser();await query("INSERT INTO user_accounts(profile_user_id,email,name,created_at) VALUES($1,$2,'Cohort fixture',NOW()-INTERVAL '40 days')",[user.id,`${crypto.randomUUID()}@example.invalid`]);
    await creditRunesFromPaymentDetailed({userId:user.id,packageId:"snapshot",paymentId:crypto.randomUUID(),amountRub:500,expectedPriceRub:500,expectedRunes:100});
    await query("UPDATE rune_transactions SET created_at=NOW()-INTERVAL '39 days' WHERE user_id=$1",[user.id]);
    const data=await getFirstExperienceAnalytics();expect(data?.cohorts).toHaveLength(1);
    expect(data?.cohorts[0]).toMatchObject({users:1,paid7:1,paid30:1,payers:1,repeatPayers:0,firstPayment7:1,firstPayment30:1,repeatPayment:0});
    expect(data?.summary).toMatchObject({registrations:1,eligible7:1,paid7:1,eligible30:1,paid30:1,payers:1,repeatPayers:0,firstPayment7:1,firstPayment30:1,repeatPayment:0});
    expect(data?.freeGenerationCost.totalRub).toBeNull();
    await query("UPDATE user_accounts SET email='excluded@zovus.test' WHERE profile_user_id=$1",[user.id]);
    expect((await getFirstExperienceAnalytics())?.cohorts).toHaveLength(0);
  });
  it("counts only users who pass funnel stages in chronological order",async()=>{
    const outOfOrder=await createTestUser();const ordered=await createTestUser();const mixed=await createTestUser();
    await query("INSERT INTO user_accounts(profile_user_id,email,name) VALUES($1,$2,'Funnel order A'),($3,$4,'Funnel order B'),($5,$6,'Funnel order C')",[outOfOrder.id,`${crypto.randomUUID()}@example.invalid`,ordered.id,`${crypto.randomUUID()}@example.invalid`,mixed.id,`${crypto.randomUUID()}@example.invalid`]);
    await query(`INSERT INTO spread_metrics(user_id,event,spread_id,source,idempotency_key,metadata,created_at) VALUES
      ($1,'first_result','journey','first_experience','a-result','{}',NOW()-INTERVAL '3 hours'),
      ($1,'bonus_granted','journey','first_experience','a-grant','{}',NOW()-INTERVAL '2 hours'),
      ($1,'bonus_spent','journey','first_experience','a-spent','{}',NOW()-INTERVAL '1 hour'),
      ($1,'continuation_shown','journey','first_experience','a-continuation','{}',NOW()),
      ($1,'payment_started','journey','first_experience','a-payment','{}',NOW()+INTERVAL '1 hour'),
      ($1,'first_topup','journey','first_experience','a-topup','{}',NOW()+INTERVAL '2 hours'),
      ($2,'bonus_granted','journey','first_experience','b-grant','{}',NOW()-INTERVAL '6 hours'),
      ($2,'bonus_spent','journey','first_experience','b-spent','{}',NOW()-INTERVAL '5 hours'),
      ($2,'first_result','journey','first_experience','b-result','{}',NOW()-INTERVAL '4 hours'),
      ($2,'continuation_shown','journey','first_experience','b-continuation','{}',NOW()-INTERVAL '3 hours'),
      ($2,'payment_started','journey','first_experience','b-payment','{}',NOW()-INTERVAL '2 hours'),
      ($2,'first_topup','journey','first_experience','b-topup','{}',NOW()-INTERVAL '1 hour'),
      ($3,'first_result','journey','first_experience','c-early-result','{}',NOW()-INTERVAL '7 hours'),
      ($3,'bonus_granted','journey','first_experience','c-grant','{}',NOW()-INTERVAL '6 hours'),
      ($3,'bonus_spent','journey','first_experience','c-spent','{}',NOW()-INTERVAL '5 hours'),
      ($3,'first_result','journey','first_experience','c-valid-result','{}',NOW()-INTERVAL '4 hours'),
      ($3,'continuation_shown','journey','first_experience','c-continuation','{}',NOW()-INTERVAL '3 hours'),
      ($3,'payment_started','journey','first_experience','c-payment','{}',NOW()-INTERVAL '2 hours'),
      ($3,'first_topup','journey','first_experience','c-topup','{}',NOW()-INTERVAL '1 hour')`,[outOfOrder.id,ordered.id,mixed.id]);
    const funnel=new Map((await getFirstExperienceAnalytics())?.funnel.map(item=>[item.event,item.count]));
    expect(Object.fromEntries(funnel)).toMatchObject({bonus_granted:3,bonus_spent:3,first_result:2,continuation_shown:2,payment_started:2,first_topup:2});
  });
  it("counts the guest registration funnel only in chronological receipt order",async()=>{
    await query("DELETE FROM spread_metrics WHERE source='guest_registration_funnel'");
    const ordered=crypto.randomUUID();const outOfOrder=crypto.randomUUID();
    await query(`INSERT INTO spread_metrics(event,spread_id,source,idempotency_key,metadata,created_at) VALUES
      ('receipt_issued',$1,'guest_registration_funnel','go-issued','{}',NOW()-INTERVAL '8 hours'),
      ('auth_started',$1,'guest_registration_funnel','go-auth','{"method":"email"}',NOW()-INTERVAL '7 hours'),
      ('account_created',$1,'guest_registration_funnel','go-account','{"method":"email"}',NOW()-INTERVAL '6 hours'),
      ('claim_succeeded',$1,'guest_registration_funnel','go-claim','{}',NOW()-INTERVAL '5 hours'),
      ('receipt_reused',$1,'guest_registration_funnel','go-reuse','{}',NOW()-INTERVAL '4 hours'),
      ('receipt_issued',$2,'guest_registration_funnel','bad-issued','{}',NOW()-INTERVAL '8 hours'),
      ('account_created',$2,'guest_registration_funnel','bad-account','{"method":"email"}',NOW()-INTERVAL '7 hours'),
      ('auth_started',$2,'guest_registration_funnel','bad-auth','{"method":"email"}',NOW()-INTERVAL '6 hours'),
      ('claim_succeeded',$2,'guest_registration_funnel','bad-claim','{}',NOW()-INTERVAL '5 hours')`,[ordered,outOfOrder]);
    const analytics=await getFirstExperienceAnalytics();
    const funnel=Object.fromEntries(analytics?.guestRegistration.funnel.map(item=>[item.event,item.count])??[]);
    expect(funnel).toMatchObject({receipt_issued:2,auth_started:2,account_created:1,claim_succeeded:1});
    expect(analytics?.guestRegistration.diagnostics).toContainEqual({event:"receipt_reused",count:1});
  });
});
