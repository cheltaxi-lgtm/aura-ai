import {randomUUID} from "node:crypto";
import {NextRequest} from "next/server";
import {beforeEach,afterEach,describe,it,expect,vi} from "vitest";
const ai=vi.hoisted(()=>({gate:null as Promise<void>|null,calls:0}));
vi.mock("@/lib/validated-ai-generation",()=>({generateValidatedAiText:async(params:{inputParts:unknown[]})=>{
  ai.calls++; const gate=ai.gate; ai.gate=null; if(gate)await gate;
  return {ok:true,content:(params.inputParts[3] as string[]).map(name=>`Карта ${name} помогает выбрать главное дело на сегодня и спокойно завершить его.`).join("\n\n")};
}}));
vi.mock("@/lib/prose-completion",async original=>({...await original<typeof import("@/lib/prose-completion")>(),completeProseWithContinuation:async()=>null}));
vi.mock("@/lib/memory/build-memory-context",()=>({buildMemoryContext:async()=>({}),appendMemoryContextToPrompt:(s:string)=>s}));
import {query} from "@/lib/db";
import {getOrCreateDailyReading} from "@/lib/daily-energy";
import {chargeForCurrentWorkerJob,adoptPaidReceiptForCurrentWorkerJob,refundWorkerJobCharge} from "@/lib/async-job-lifecycle";
import {createAsyncJob,claimAsyncJobs,getAsyncJobById,reapWatchdogRunningAsyncJobs,type AsyncJobRow,type AsyncJobKind} from "@/lib/async-jobs";
import {chargeForSession} from "@/lib/services/billing-service";
import {saveHistoryProductReceipt} from "@/lib/services/history-product-receipt";
import {createHistoryEntry} from "@/lib/users";
import {createJointReadingInvite,attachSpreadToJointReading,getJointReadingByToken} from "@/lib/joint-reading-service";
import {createRitual,getRitualById,saveGeneratedRitual,markRitualPaidAndGenerating} from "@/lib/ritual-service";
import {hasTestDb,installDbLifecycle} from "./db/setup";
import {createTestUser,getUserBalance,countSpendTransactions} from "./db/fixtures";
const date="2026-10-03";
async function jobFor(userId:string,kind:AsyncJobKind){
  const id=await createAsyncJob({userId,kind,payload:{operation:randomUUID()}});
  await claimAsyncJobs({workerId:"tail-worker",kinds:[kind],limit:10});return(await getAsyncJobById(id))!;
}
function request(job:AsyncJobRow){return new NextRequest("http://localhost/api/intention-spread",{method:"POST",headers:{
  host:"localhost","x-async-job-worker-secret":"tail-secret","x-async-job-user-id":job.user_id,
  "x-async-job-id":job.id,"x-async-job-attempt":String(job.attempt_count),"x-async-job-worker-id":job.worker_id!},body:"{}"});}
async function charge(job:AsyncJobRow,action="INTENTION_SPREAD",key=`tail:${job.id}`){return chargeForCurrentWorkerJob({request:request(job),params:{userId:job.user_id,cost:7,actionType:action,idempotencyKey:key,operationIdentity:key}});}
async function stale(job:AsyncJobRow){await query("UPDATE async_jobs SET started_at=now()-interval '20 minutes',locked_at=now()-interval '20 minutes' WHERE id=$1",[job.id]);await reapWatchdogRunningAsyncJobs({maxRunningMs:300000,maxAttempts:1,kinds:[job.kind]});}
const ritualContent={ritual_time:"Вечером",ritual_place:"У стола",ritual_items:[{item:"Свеча",reason:"Внимание"}],ritual_steps:[{step:"Пауза",description:"Спокойно вдохните"}],ritual_words:"Я выбираю ясность",ritual_word_of_power:"Ясность",ritual_word_of_power_transcription:"yasnost",ritual_forbids:[],ritual_signs:[]};
describe.skipIf(!hasTestDb)("last paid delivery gaps in actual PostgreSQL",()=>{
  installDbLifecycle();beforeEach(()=>{vi.stubEnv("ASYNC_JOB_WORKER_SECRET","tail-secret");ai.gate=null;ai.calls=0;});afterEach(()=>vi.unstubAllEnvs());
  it("adopts a legacy unbound custom spend at its actual discounted amount and refunds once",async()=>{
    const user=await createTestUser({runeBalance:100}),job=await jobFor(user.id,"intention_spread"),key=`legacy:${job.id}`;
    const old=await chargeForSession({userId:user.id,cost:7,actionType:"INTENTION_SPREAD",idempotencyKey:key,operationIdentity:key});
    const held=await charge(job,"INTENTION_SPREAD",key);expect(held).toMatchObject({transactionId:old.transactionId,spentRunes:7});
    expect(await countSpendTransactions(user.id)).toBe(1);
    const rollback=await refundWorkerJobCharge(request(job),{userId:user.id,cost:held.spentRunes,wasFreeQuestion:false,transactionId:held.transactionId});
    expect(rollback.refunded).toBe(true);expect(await getUserBalance(user.id)).toBe(100);
  });
  it("intention history and delivery commit together and reject a late refund",async()=>{
    const user=await createTestUser({runeBalance:100}),job=await jobFor(user.id,"intention_spread"),held=await charge(job);
    const reading="Сохранённый точный разбор";
    await saveHistoryProductReceipt({request:request(job),transactionId:held.transactionId,history:{userId:user.id,characterName:"veronika",isPaid:true,contextData:{type:"intention_spread",intentionResourceKey:"owned-resource",reading,source:"ai"}},result:{reading,spreadId:"triplet"}});
    expect(await getAsyncJobById(job.id)).toMatchObject({status:"completed",billing_state:"completed",charge_transaction_id:held.transactionId,result:{reading}});
    expect((await refundWorkerJobCharge(request(job),{userId:user.id,cost:7,wasFreeQuestion:false,transactionId:held.transactionId})).refunded).toBe(false);
  });
  it("joint side rolls back with a failed receipt write, without publishing an unpaid reading",async()=>{
    const user=await createTestUser({runeBalance:100}),job=await jobFor(user.id,"intention_spread"),held=await charge(job);
    const invite=await createJointReadingInvite({initiatorUserId:user.id,reuseExisting:false,spreadId:"triplet"});
    await expect(saveHistoryProductReceipt({request:request(job),transactionId:held.transactionId,history:{userId:user.id,characterName:"veronika",isPaid:true,contextData:{type:"intention_spread",intentionResourceKey:"owned-resource",reading:"Результат"}},result:{reading:"Результат"},beforeSave:async client=>{
      const saved=await attachSpreadToJointReading({jointToken:invite.token,userId:user.id,spreadId:"triplet",reading:"Результат",cards:[{name:"Маг"}],characterKey:"veronika"},client);expect(saved.ok).toBe(true);throw new Error("synthetic storage fault");
    }})).rejects.toThrow("synthetic storage fault");
    expect((await getJointReadingByToken(invite.token))!.initiator_reading).toBeNull();
    expect((await refundWorkerJobCharge(request(job),{userId:user.id,cost:7,wasFreeQuestion:false,transactionId:held.transactionId})).refunded).toBe(true);
  });
  it("watchdog recovers an exact old intention history instead of refunding delivered content",async()=>{
    const user=await createTestUser({runeBalance:100}),job=await jobFor(user.id,"intention_spread"),held=await charge(job);
    await createHistoryEntry({userId:user.id,characterName:"veronika",isPaid:true,contextData:{type:"intention_spread",intentionResourceKey:"owned",transactionId:held.transactionId,reading:"Сохранённый разбор",sessionId:"saved",source:"ai"}});
    await stale(job);expect(await getAsyncJobById(job.id)).toMatchObject({status:"completed",billing_state:"completed",result:{reading:"Сохранённый разбор"}});expect(await getUserBalance(user.id)).toBe(93);
  });
  it("daily extended saves paid day, history, anchor and completed job together",async()=>{
    const user=await createTestUser({runeBalance:100}),job=await jobFor(user.id,"daily_extended"),held=await charge(job,"DAILY_EXTENDED");
    const result=await getOrCreateDailyReading({userId:user.id,characterKey:"veronika",name:user.name,zodiac:"",birthDate:"1990-01-01",localDate:date,spreadId:"daily-extended",request:request(job),transactionId:held.transactionId});
    expect(result.spreadId).toBe("daily-extended");expect(await getAsyncJobById(job.id)).toMatchObject({status:"completed",billing_state:"completed",result:{text:result.text}});
    const history=(await query("SELECT is_paid,context_data FROM history WHERE user_id=$1 AND context_data->>'transactionId'=$2",[user.id,held.transactionId])).rows;expect(history.length).toBe(1);expect(history[0].is_paid).toBe(true);
    expect((await query("SELECT astro_meta->>'lastDailyReadingDate' AS reading_date FROM users WHERE id=$1",[user.id])).rows[0].reading_date).toBe(date);
  });
  it("late free day cannot overwrite an already committed paid extended day",async()=>{
    const user=await createTestUser({runeBalance:100});let release!:()=>void;ai.gate=new Promise(resolve=>{release=resolve});
    const params={userId:user.id,characterKey:"veronika",name:user.name,zodiac:"",birthDate:"1990-01-01",localDate:date};
    const free=getOrCreateDailyReading({...params,spreadId:"triplet"});
    await vi.waitFor(()=>expect(ai.calls).toBe(1));
    const job=await jobFor(user.id,"daily_extended"),held=await charge(job,"DAILY_EXTENDED");
    const paid=await getOrCreateDailyReading({...params,spreadId:"daily-extended",request:request(job),transactionId:held.transactionId});release();
    expect(await free).toMatchObject({text:paid.text,spreadId:"daily-extended"});
    expect((await query("SELECT spread_id,reading_text FROM daily_readings WHERE user_id=$1",[user.id])).rows[0]).toMatchObject({spread_id:"daily-extended",reading_text:paid.text});
    expect((await query("SELECT context_data->>'transactionId' txn FROM history WHERE user_id=$1",[user.id])).rows[0].txn).toBe(held.transactionId);
  });
  it("stale daily generation cannot save a late artifact after timeout and refund",async()=>{
    const user=await createTestUser({runeBalance:100}),job=await jobFor(user.id,"daily_extended"),held=await charge(job,"DAILY_EXTENDED");
    await stale(job);await expect(getOrCreateDailyReading({userId:user.id,characterKey:"veronika",name:user.name,zodiac:"",birthDate:"1990-01-01",localDate:date,spreadId:"daily-extended",request:request(job),transactionId:held.transactionId})).rejects.toThrow("stale_async_job_attempt");
    expect((await query("SELECT count(*)::int n FROM daily_readings WHERE user_id=$1",[user.id])).rows[0].n).toBe(0);expect(await getUserBalance(user.id)).toBe(100);
  });
  it("ritual adopts its owned payment without another debit and saves with worker completion",async()=>{
    const user=await createTestUser({runeBalance:100}),job=await jobFor(user.id,"ritual_generation");
    const ritual=await createRitual({userId:user.id,characterKey:"agafya",ritualType:"love",moonPhase:"",moonSign:"",runeCost:7});
    await query("UPDATE rituals SET status='payment' WHERE id=$1",[ritual.id]);
    const held=await chargeForSession({userId:user.id,cost:7,actionType:"ritual",idempotencyKey:`ritual:${ritual.id}`});
    const paid=(await markRitualPaidAndGenerating(ritual.id,{paymentStatus:"paid",transactionId:held.transactionId}))!;
    await adoptPaidReceiptForCurrentWorkerJob(request(job),user.id,held.transactionId!,"ritual");
    expect((await saveGeneratedRitual(ritual.id,ritualContent,paid,request(job)))!.status).toBe("completed");
    expect(await getAsyncJobById(job.id)).toMatchObject({status:"completed",billing_state:"completed",result:{status:"completed"}});expect(await countSpendTransactions(user.id)).toBe(1);
  });
  it("ritual timeout refunds once, reopens payment and rejects a late old save",async()=>{
    const user=await createTestUser({runeBalance:100}),job=await jobFor(user.id,"ritual_generation");
    const ritual=await createRitual({userId:user.id,characterKey:"agafya",ritualType:"love",moonPhase:"",moonSign:"",runeCost:7});await query("UPDATE rituals SET status='payment' WHERE id=$1",[ritual.id]);
    const held=await chargeForSession({userId:user.id,cost:7,actionType:"ritual",idempotencyKey:`ritual:${ritual.id}`});const paid=(await markRitualPaidAndGenerating(ritual.id,{paymentStatus:"paid",transactionId:held.transactionId}))!;
    await adoptPaidReceiptForCurrentWorkerJob(request(job),user.id,held.transactionId!,"ritual");await stale(job);
    expect(await getRitualById(ritual.id)).toMatchObject({status:"payment",payment_status:"pending"});expect(await getUserBalance(user.id)).toBe(100);
    await expect(saveGeneratedRitual(ritual.id,ritualContent,paid,request(job))).rejects.toThrow("stale_async_job_attempt");
  });
});
