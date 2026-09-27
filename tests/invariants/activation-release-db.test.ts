import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { randomUUID } from "node:crypto";
import { query } from "@/lib/db";
import { ensureBotOfferAccount, upsertBotOfferProfile } from "@/lib/telegram/bot-offer-account";
import * as telegramAccounts from "@/lib/telegram/accounts";
import * as botResolve from "@/lib/telegram/bot-resolve";
import { getUserById, createHistoryEntry, createUserProfileForAccount } from "@/lib/users";
import { listUserAccounts } from "@/lib/admin";
import { getUserActivationContext, getActivationDiagnostics } from "@/lib/activation-store";
import { recordActivationEvent } from "@/lib/activation-telemetry";
import { isUserAgeEligible } from "@/lib/age-gate";
import { getSetting, setSetting } from "@/lib/settings";
import { hasTestDb, installDbLifecycle } from "./db/setup";

describe.skipIf(!hasTestDb)("activation evidence and Telegram consumer access",()=>{
  installDbLifecycle();
  const erasureFixtureAccounts:string[]=[];
  beforeEach(()=>{vi.stubEnv("FIRST_EXPERIENCE_ENABLED","true");vi.stubEnv("AURA_MODULE_ENABLED","true");vi.stubEnv("PALM_MODULE_ENABLED","false");});
  afterEach(async()=>{
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    // The durable outbox intentionally has no account FK: CASCADE fixture
    // cleanup cannot remove it. Never leak pending jobs into worker suites.
    if(erasureFixtureAccounts.length)await query("DELETE FROM account_erasure_jobs WHERE account_id=ANY($1::uuid[])",[erasureFixtureAccounts]);
    erasureFixtureAccounts.length=0;
  });
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

  it("does not treat a welcome or another owner's chat answer as a saved useful result",async()=>{
    const a=await ensureBotOfferAccount(input());const b=await ensureBotOfferAccount(input());
    const session=await query<{id:string}>("INSERT INTO sessions(user_id,character_key) VALUES($1,'tarolog') RETURNING id",[a.profileUserId]);
    const sessionId=session.rows[0].id;
    await query("INSERT INTO chat_messages(session_id,owner_user_id,character_id,role,content,created_at) VALUES($1,$2,'tarolog','assistant','Welcome fixture',NOW()-INTERVAL '2 minutes')",[sessionId,a.profileUserId]);
    expect((await getUserActivationContext(a.profileUserId!))?.stage).toBe("not_started");
    await query("INSERT INTO chat_messages(session_id,owner_user_id,character_id,role,content,created_at) VALUES($1,$2,'tarolog','user','Question fixture',NOW()-INTERVAL '1 minute')",[sessionId,a.profileUserId]);
    // An older welcome cannot become a result when a question arrives later.
    expect((await getUserActivationContext(a.profileUserId!))?.stage).toBe("not_started");
    await query("INSERT INTO chat_messages(session_id,owner_user_id,character_id,role,content) VALUES($1,$2,'tarolog','assistant','Other owner fixture')",[sessionId,b.profileUserId]);
    expect((await getUserActivationContext(a.profileUserId!))?.stage).toBe("not_started");
    await query("INSERT INTO chat_messages(session_id,character_id,role,content) VALUES($1,'tarolog','assistant','Saved answer fixture')",[sessionId]);
    // Legacy NULL message ownership remains valid inside the owned session.
    expect((await getUserActivationContext(a.profileUserId!))?.stage).toBe("result_ready");
    expect((await listUserAccounts()).find(r=>r.id===a.accountId)?.activation_stage).toBe("result_ready");
  });

  it.each(["photo","natal_compatibility","hd_composite","hd_center","ritual","joint"])("recognizes owned saved %s results without chat and excludes unfinished/foreign artifacts",async(kind)=>{
    const a=await ensureBotOfferAccount(input());const foreign=await ensureBotOfferAccount(input());
    if(kind==="photo"){
      await createHistoryEntry({userId:a.profileUserId!,characterName:"veronika",contextData:{type:"photo_reading",analysis:" "}});
      expect((await getUserActivationContext(a.profileUserId!))?.stage).toBe("not_started");
      await createHistoryEntry({userId:a.profileUserId!,characterName:"veronika",contextData:{type:"photo_reading",analysis:"Saved photo fixture"}});
    }else if(kind==="natal_compatibility"){
      const participant=await ensureBotOfferAccount(input());
      const row=await query<{id:string}>("INSERT INTO natal_compatibility_reports(owner_user_id,participant_user_id,mode,status,owner_label,partner_label,owner_fingerprint,partner_fingerprint,pair_fingerprint,synastry_snapshot,expires_at) VALUES($1,$2,'manual','ready','A','B',$3,$3,$3,'{}',NOW()+INTERVAL '1 day') RETURNING id",[a.profileUserId,participant.profileUserId,"a".repeat(64)]);
      expect((await getUserActivationContext(a.profileUserId!))?.stage).toBe("not_started");
      await query("UPDATE natal_compatibility_reports SET status='completed',report_data=$2::jsonb,evidence_refs='[]',completed_at=NOW() WHERE id=$1",[row.rows[0].id,JSON.stringify({sections:[{title:"Fixture",claims:[{text:"Saved fixture"}]}],disclaimer:"Fixture"})]);
      expect((await getUserActivationContext(participant.profileUserId!))?.stage).toBe("result_ready");
    }else if(kind==="hd_composite"||kind==="hd_center"){
      const chart=await query<{id:string}>("INSERT INTO hd_charts(user_id,birth_date,timezone,place_name,lat,lon,fingerprint,chart,engine_version) VALUES($1,'1990-01-15','UTC','Fixture',0,0,$2,'{}','fixture') RETURNING id",[a.profileUserId,randomUUID()]);
      if(kind==="hd_composite"){
        const row=await query<{id:string}>("INSERT INTO hd_composite_reports(user_id,base_chart_id,partner_chart_id,status,report_text) VALUES($1,$2,$2,'pending','Saved composite fixture') RETURNING id",[a.profileUserId,chart.rows[0].id]);
        expect((await getUserActivationContext(a.profileUserId!))?.stage).toBe("not_started");
        await query("UPDATE hd_composite_reports SET status='done' WHERE id=$1",[row.rows[0].id]);
      }else{
        expect((await getUserActivationContext(a.profileUserId!))?.stage).toBe("not_started");
        await query("INSERT INTO hd_center_insights(user_id,chart_id,center,insight_text) VALUES($1,$2,'head','Saved insight fixture')",[a.profileUserId,chart.rows[0].id]);
      }
    }else if(kind==="ritual"){
      const row=await query<{id:string}>("INSERT INTO rituals(user_id,character_key,ritual_type,status,ritual_words) VALUES($1,'tarolog','luck','generating','Saved ritual fixture') RETURNING id",[a.profileUserId]);
      expect((await getUserActivationContext(a.profileUserId!))?.stage).toBe("not_started");
      await query("UPDATE rituals SET status='completed',ritual_words=' ' WHERE id=$1",[row.rows[0].id]);
      expect((await getUserActivationContext(a.profileUserId!))?.stage).toBe("not_started");
      await query("UPDATE rituals SET ritual_word_of_power='Saved ritual fixture' WHERE id=$1",[row.rows[0].id]);
    }else{
      const participant=await ensureBotOfferAccount(input());
      const row=await query<{id:string}>("INSERT INTO joint_readings(token,initiator_user_id,partner_user_id,partner_reading,expires_at) VALUES($1,$2,$3,'Partner fixture',NOW()+INTERVAL '1 day') RETURNING id",[randomUUID(),a.profileUserId,participant.profileUserId]);
      expect((await getUserActivationContext(a.profileUserId!))?.stage).toBe("not_started");
      expect((await getUserActivationContext(participant.profileUserId!))?.stage).toBe("result_ready");
      await query("UPDATE joint_readings SET status='completed',combined_reading='Saved combined fixture' WHERE id=$1",[row.rows[0].id]);
    }
    expect((await listUserAccounts()).find(r=>r.id===a.accountId)).toMatchObject({sessions_count:"0",activation_stage:"result_ready"});
    expect((await getUserActivationContext(a.profileUserId!))?.stage).toBe("result_ready");
    expect((await getUserActivationContext(foreign.profileUserId!))?.stage).toBe("not_started");
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

  it("rejects birthday completion after Telegram moves to another account, without changing either profile",async()=>{
    const params=input();const a=await ensureBotOfferAccount(params);const b=await ensureBotOfferAccount(input());
    await telegramAccounts.unlinkTelegramFromAccount(b.accountId!);
    const original=telegramAccounts.findTelegramIdentity;
    vi.spyOn(telegramAccounts,"findTelegramIdentity").mockImplementationOnce(async(id)=>{
      const captured=await original(id);
      await telegramAccounts.unlinkTelegramFromAccount(a.accountId!);
      expect(await telegramAccounts.linkTelegramToAccount({accountId:b.accountId!,data:{id,first_name:"Other fixture",auth_date:1,hash:"fixture"}})).toMatchObject({ok:true});
      return captured;
    });
    await expect(upsertBotOfferProfile({telegramUserId:params.telegramUserId,birthDate:"1990-01-15",birthCity:"Москва",gender:"female"})).rejects.toThrow("NOT_LINKED");
    for(const profileId of [a.profileUserId!,b.profileUserId!]){
      expect(await getUserById(profileId)).toMatchObject({birth_date:null,birth_city:null});
      expect((await query("SELECT COUNT(*)::int AS n FROM rune_transactions WHERE user_id=$1 AND type='bonus'",[profileId])).rows[0].n).toBe(1);
    }
    expect((await original(params.telegramUserId))?.user_account_id).toBe(b.accountId);
  });

  it("rejects a stale consumer resolution before creating a profile or bonus for an unlinked shell",async()=>{
    const params=input();
    const account=await query<{id:string}>("INSERT INTO user_accounts(email,name,age_confirmed_at,terms_accepted_at) VALUES($1,'Activation fixture',NOW(),NOW()) RETURNING id",[`${randomUUID()}@telegram.zovus.local`]);
    const accountId=account.rows[0].id;
    await query("INSERT INTO user_telegram_identities(user_account_id,telegram_user_id) VALUES($1,$2)",[accountId,params.telegramUserId]);
    const b=await ensureBotOfferAccount(input());await telegramAccounts.unlinkTelegramFromAccount(b.accountId!);
    const original=botResolve.resolveBotUser;
    vi.spyOn(botResolve,"resolveBotUser").mockImplementationOnce(async(id)=>{
      const captured=await original(id);
      await telegramAccounts.unlinkTelegramFromAccount(accountId);
      expect(await telegramAccounts.linkTelegramToAccount({accountId:b.accountId!,data:{id,first_name:"Other fixture",auth_date:1,hash:"fixture"}})).toMatchObject({ok:true});
      return captured;
    });
    await expect(ensureBotOfferAccount(params)).rejects.toThrow("NOT_LINKED");
    expect((await query("SELECT profile_user_id FROM user_accounts WHERE id=$1",[accountId])).rows[0].profile_user_id).toBeNull();
    expect((await query("SELECT COUNT(*)::int AS n FROM users")).rows[0].n).toBe(1);
    expect((await query("SELECT COUNT(*)::int AS n FROM rune_transactions WHERE type='bonus'")).rows[0].n).toBe(1);
  });

  it("never creates or fills a profile or recreates a Telegram account during erasure",async()=>{
    const params=input();
    const account=await query<{id:string}>("INSERT INTO user_accounts(email,name,age_confirmed_at,terms_accepted_at,erasure_requested_at) VALUES($1,'Deletion fixture',NOW(),NOW(),NOW()) RETURNING id",[`${randomUUID()}@telegram.zovus.local`]);
    const accountId=account.rows[0].id;
    erasureFixtureAccounts.push(accountId);
    await query("INSERT INTO account_erasure_jobs(account_id,telegram_user_ids) VALUES($1,ARRAY[$2::bigint])",[accountId,params.telegramUserId]);
    // Identity was purged already; the durable erasure barrier remains.
    await expect(ensureBotOfferAccount(params)).rejects.toThrow("ACCOUNT_ERASURE_PENDING");
    await expect(createUserProfileForAccount(accountId,{name:"Blocked",gender:"female",birthDate:"1990-01-15"})).rejects.toThrow("ACCOUNT_ERASURE_PENDING");
    expect((await query("SELECT COUNT(*)::int AS n FROM users")).rows[0].n).toBe(0);
    expect((await query("SELECT COUNT(*)::int AS n FROM user_accounts")).rows[0].n).toBe(1);
    // Linked profile completion must also stop once deletion is requested.
    const live=input();const linked=await ensureBotOfferAccount(live);
    erasureFixtureAccounts.push(linked.accountId!);
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
