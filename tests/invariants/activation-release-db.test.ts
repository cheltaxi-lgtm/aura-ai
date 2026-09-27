import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { randomUUID } from "node:crypto";
import { query } from "@/lib/db";
import { ensureBotOfferAccount, upsertBotOfferProfile } from "@/lib/telegram/bot-offer-account";
import { getUserById, createHistoryEntry, createUserProfileForAccount } from "@/lib/users";
import { listUserAccounts } from "@/lib/admin";
import { getUserActivationContext, getActivationDiagnostics } from "@/lib/activation-store";
import { recordActivationEvent } from "@/lib/activation-telemetry";
import { isUserAgeEligible } from "@/lib/age-gate";
import { getSetting, setSetting } from "@/lib/settings";
import { hasTestDb, installDbLifecycle } from "./db/setup";

describe.skipIf(!hasTestDb)("activation evidence and Telegram consumer access",()=>{
  installDbLifecycle();
  beforeEach(()=>{vi.stubEnv("FIRST_EXPERIENCE_ENABLED","true");vi.stubEnv("AURA_MODULE_ENABLED","true");vi.stubEnv("PALM_MODULE_ENABLED","false");});
  afterEach(()=>vi.unstubAllEnvs());
  const input=()=>({telegramUserId:7000000000+Math.floor(Math.random()*100000000),firstName:"Activation fixture",termsAcceptedAt:new Date().toISOString(),ageConfirmedAt:new Date().toISOString()});

  it("creates one adult consumer profile and one 40-rune grant under concurrent bot entry, with no invented birth data",async()=>{
    const params=input();
    const results=await Promise.all(Array.from({length:24},()=>ensureBotOfferAccount(params)));
    const id=results[0].profileUserId!;
    expect(results.every(r=>r.profileUserId===id)).toBe(true);
    expect(results[0].needsOnboarding).toBe(true);
    const profile=await getUserById(id);
    expect(profile).toMatchObject({birth_date:null,birth_city:null,zodiac:""});
    expect(isUserAgeEligible(profile!)).toBe(true);
    expect(profile?.astro_meta).toMatchObject({genderUnspecified:true});
    expect((await query("SELECT rune_balance FROM users WHERE id=$1",[id])).rows[0].rune_balance).toBe(40);
    expect((await query("SELECT COUNT(*)::int AS n FROM rune_transactions WHERE user_id=$1 AND type='bonus'",[id])).rows[0].n).toBe(1);
    expect((await query("SELECT marketing_consent FROM user_accounts WHERE id=$1",[results[0].accountId])).rows[0].marketing_consent).toBe(false);
  });

  it("heals an existing shell account on the next entry, and refuses a new account without authoritative age/terms",async()=>{
    const params=input();
    const account=await query<{id:string}>("INSERT INTO user_accounts(email,name,age_confirmed_at,terms_accepted_at) VALUES($1,'Activation fixture',NOW(),NOW()) RETURNING id",[`${randomUUID()}@telegram.zovus.local`]);
    await query("INSERT INTO user_telegram_identities(user_account_id,telegram_user_id) VALUES($1,$2)",[account.rows[0].id,params.telegramUserId]);
    expect((await ensureBotOfferAccount(params)).profileUserId).toBeTruthy();
    await expect(ensureBotOfferAccount({...input(),ageConfirmedAt:""})).rejects.toThrow("CONSENT_TIMESTAMPS_REQUIRED");
  });

  it("shows full non-chat results as ready while keeping chat count zero",async()=>{
    const account=await ensureBotOfferAccount(input());
    await createHistoryEntry({userId:account.profileUserId!,characterName:"veronika",contextData:{type:"aura_reading",report:"Saved full report"}});
    const row=(await listUserAccounts()).find(r=>r.id===account.accountId);
    expect(row).toMatchObject({sessions_count:"0",activation_stage:"result_ready"});
    const bot=await ensureBotOfferAccount(input());
    await createHistoryEntry({userId:bot.profileUserId!,characterName:"veronika",contextData:{interpretation:"Archived bot result without a chat session"}});
    expect((await listUserAccounts()).find(r=>r.id===bot.accountId)?.activation_stage).toBe("result_ready");
    const daily=await ensureBotOfferAccount(input());
    await query("INSERT INTO daily_readings(user_id,character_key,reading_text,cards,reading_date) VALUES($1,'veronika','Saved daily result','[]',CURRENT_DATE)",[daily.profileUserId]);
    expect((await listUserAccounts()).find(r=>r.id===daily.accountId)?.activation_stage).toBe("result_ready");
  });

  it("fills the same legacy profile when birthday completion races with consumer repair",async()=>{
    const params=input();
    const account=await query<{id:string}>("INSERT INTO user_accounts(email,name,age_confirmed_at,terms_accepted_at) VALUES($1,'Activation fixture',NOW(),NOW()) RETURNING id",[`${randomUUID()}@telegram.zovus.local`]);
    await query("INSERT INTO user_telegram_identities(user_account_id,telegram_user_id) VALUES($1,$2)",[account.rows[0].id,params.telegramUserId]);
    const [consumer,full]=await Promise.all([ensureBotOfferAccount(params),upsertBotOfferProfile({telegramUserId:params.telegramUserId,birthDate:"1990-01-15",birthCity:"Москва",gender:"female"})]);
    expect(consumer.profileUserId).toBe(full.profileUserId);
    expect(await getUserById(full.profileUserId!)).toMatchObject({birth_date:"1990-01-15",birth_city:"Москва"});
    expect((await query("SELECT COUNT(*)::int AS n FROM rune_transactions WHERE user_id=$1 AND type='bonus'",[full.profileUserId])).rows[0].n).toBe(1);
  });

  it("never creates or fills a profile or recreates a Telegram account during erasure",async()=>{
    const params=input();
    const account=await query<{id:string}>("INSERT INTO user_accounts(email,name,age_confirmed_at,terms_accepted_at,erasure_requested_at) VALUES($1,'Deletion fixture',NOW(),NOW(),NOW()) RETURNING id",[`${randomUUID()}@telegram.zovus.local`]);
    const accountId=account.rows[0].id;
    await query("INSERT INTO account_erasure_jobs(account_id,telegram_user_ids) VALUES($1,ARRAY[$2::bigint])",[accountId,params.telegramUserId]);
    // Identity was purged already; the durable erasure barrier remains.
    await expect(ensureBotOfferAccount(params)).rejects.toThrow("ACCOUNT_ERASURE_PENDING");
    await expect(createUserProfileForAccount(accountId,{name:"Blocked",gender:"female",birthDate:"1990-01-15"})).rejects.toThrow("ACCOUNT_ERASURE_PENDING");
    expect((await query("SELECT COUNT(*)::int AS n FROM users")).rows[0].n).toBe(0);
    expect((await query("SELECT COUNT(*)::int AS n FROM user_accounts")).rows[0].n).toBe(1);
    // Linked profile completion must also stop once deletion is requested.
    const live=input();const linked=await ensureBotOfferAccount(live);
    await query("UPDATE user_accounts SET erasure_requested_at=NOW() WHERE id=$1",[linked.accountId]);
    await query("INSERT INTO account_erasure_jobs(account_id,profile_user_id,telegram_user_ids) VALUES($1,$2,ARRAY[$3::bigint])",[linked.accountId,linked.profileUserId,live.telegramUserId]);
    await expect(upsertBotOfferProfile({telegramUserId:live.telegramUserId,birthDate:"1990-01-15",gender:"female"})).rejects.toThrow("ACCOUNT_ERASURE_PENDING");
    expect((await getUserById(linked.profileUserId!))?.birth_date).toBeNull();
  });

  it("distinguishes previews, attempted requests and unrelated empty history; only returns owned previews",async()=>{
    const a=await ensureBotOfferAccount(input()); const b=await ensureBotOfferAccount(input());
    const snapshot=randomUUID();
    await query("INSERT INTO aura_guest_snapshots(id,snapshot,engine_version,claim_token_hash,claimed_user_id,claimed_at,expires_at) VALUES($1,'{}','fixture',$2,$3,NOW(),NOW()+INTERVAL '1 day')",[snapshot,randomUUID(),a.profileUserId]);
    expect(await getUserActivationContext(a.profileUserId!)).toMatchObject({stage:"preview_only",continuation:{href:`/aura?reading=${snapshot}`}});
    expect(await getUserActivationContext(b.profileUserId!)).toMatchObject({stage:"not_started",continuation:null});
    await createHistoryEntry({userId:a.profileUserId!,characterName:"veronika",contextData:{type:"note"}});
    expect((await getUserActivationContext(a.profileUserId!))?.stage).toBe("preview_only");
    const key=randomUUID();
    await recordActivationEvent(a.profileUserId!,"aura","request_attempted",key);
    await recordActivationEvent(a.profileUserId!,"aura","request_attempted",key);
    await recordActivationEvent(a.profileUserId!,"aura","request_rejected",key,"insufficient_runes");
    expect((await getUserActivationContext(a.profileUserId!))?.stage).toBe("started");
    expect((await getActivationDiagnostics()).events).toContainEqual({product:"aura",event:"request_attempted",code:"",requests:1,accounts:1});
    await createHistoryEntry({userId:a.profileUserId!,characterName:"veronika",contextData:{type:"aura_reading",auraSnapshotId:snapshot,report:"Full result"}});
    expect(await getUserActivationContext(a.profileUserId!)).toMatchObject({stage:"result_ready",continuation:null});
  });

  it("omits disabled-product continuations and excludes accounts pending deletion from self context and diagnostics",async()=>{
    const a=await ensureBotOfferAccount(input());
    await query("INSERT INTO aura_guest_snapshots(snapshot,engine_version,claim_token_hash,claimed_user_id,claimed_at,expires_at) VALUES('{}','fixture',$1,$2,NOW(),NOW()+INTERVAL '1 day')",[randomUUID(),a.profileUserId]);
    vi.stubEnv("AURA_MODULE_ENABLED","false");
    expect((await getUserActivationContext(a.profileUserId!))?.continuation).toBeNull();
    await query("UPDATE user_accounts SET erasure_requested_at=NOW() WHERE id=$1",[a.accountId]);
    expect(await getUserActivationContext(a.profileUserId!)).toBeNull();
    expect((await getActivationDiagnostics()).stages).toEqual([]);
  });

  it("does not offer an older disabled aura instead of a newer enabled palm",async()=>{
    const a=await ensureBotOfferAccount(input());
    const original=await getSetting("palmReading");
    try {
      await setSetting("palmReading",{enabled:true});vi.stubEnv("PALM_MODULE_ENABLED","true");vi.stubEnv("AURA_MODULE_ENABLED","false");
      const palm=randomUUID();
      await query("INSERT INTO palm_guest_snapshots(id,snapshot,engine_version,claim_token_hash,claimed_user_id,claimed_at,expires_at) VALUES($1,'{}','fixture',$2,$3,NOW()-INTERVAL '1 day',NOW()+INTERVAL '1 day')",[palm,randomUUID(),a.profileUserId]);
      for(let i=0;i<3;i++)await query("INSERT INTO aura_guest_snapshots(snapshot,engine_version,claim_token_hash,claimed_user_id,claimed_at,expires_at) VALUES('{}','fixture',$1,$2,NOW(),NOW()+INTERVAL '1 day')",[randomUUID(),a.profileUserId]);
      expect((await getUserActivationContext(a.profileUserId!))?.continuation?.href).toBe(`/gadanie-po-ladoni?reading=${palm}`);
    } finally {await setSetting("palmReading",original);}
  });
});
