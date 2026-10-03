import { normalizeBirthFields } from "../adapters/chart-facts";
import { hdFingerprint } from "@/lib/human-design/fingerprint";
import type { HdChart } from "@/lib/human-design/types";
import { reconcileProHdReservations } from "./hd-reservations";
import { createHash, randomUUID } from "node:crypto";
import { queryClient, withTransaction } from "@/lib/db";
import { chargeForSession } from "@/lib/services/billing-service";
import { getProBillingMode, isProTrialEnforced } from "../config";
import { proRuneCost } from "../pricing";
import { ProTrialExceededError, type ProChargeResult } from "./billing";
import { markAsyncJobCharged, type AsyncJobRow } from "@/lib/async-jobs";
import { lockActiveHdUser } from "@/lib/services/hd-generation-service";
import { completeReportWorkerSave, lockPaidReportReceipt, lockReportWorkerSave, paidReportCanSave, type ReportWorkerJob } from "@/lib/services/durable-report-receipt";
import { getProPool, proQuery } from "../db";
import type { ProCaseType, ProReportBlock } from "../domain/types";
import type { ProHdTelemetry, ProChartSnapshot } from "../ai/generate-premium";

export type ProHdSource = { caseType?:ProCaseType; practitionerContext?:string|null; userId:string; accountId:string|number; caseId:string|number; payload:Record<string,unknown>; question:string|null; clientId:string|number; alias:string; worker:ReportWorkerJob; transactionId:string|null; claimToken?:string; expectedVersionId?:string };

export async function claimProHdGeneration(source:ProHdSource):Promise<string> {
  return withTransaction(async client=>{
    if(!await lockReportWorkerSave(client,source.userId,source.worker))throw new Error("stale_async_job_attempt");
    await lockPaidReportReceipt(client,source.transactionId);
    await lockActiveHdUser(client,source.userId);
    await checkSource(source,proQuery);
    const job=(await queryClient<AsyncJobRow>(client,"SELECT * FROM async_jobs WHERE id=$1",[source.worker.jobId])).rows[0];
    if(job.period_metadata.pro_hd_attempt===source.worker.attempt.attemptCount && job.period_metadata.pro_hd_worker===source.worker.attempt.workerId && job.period_metadata.pro_hd_claim)throw Object.assign(new Error("CLAIM_BUSY"),{status:409});
    const token=randomUUID();
    await queryClient(client,"UPDATE async_jobs SET period_metadata=period_metadata||$2::jsonb,updated_at=now() WHERE id=$1",[source.worker.jobId,JSON.stringify({pro_hd_claim:token,pro_hd_attempt:source.worker.attempt.attemptCount,pro_hd_worker:source.worker.attempt.workerId})]);
    return token;
  });
}

async function assertClaim(client:import("@/lib/db").PoolClient,source:ProHdSource):Promise<void> {
  const job=(await queryClient<AsyncJobRow>(client,"SELECT * FROM async_jobs WHERE id=$1",[source.worker.jobId])).rows[0];
  if(!source.claimToken||job.period_metadata.pro_hd_claim!==source.claimToken||job.period_metadata.pro_hd_attempt!==source.worker.attempt.attemptCount||job.period_metadata.pro_hd_worker!==source.worker.attempt.workerId)throw new Error("stale_async_job_attempt");
}

/** A single main transaction owns both the queued job and its debit. Pro
 * reserves its source first; a crash before main commit leaves no paid job.
 * Such reservations are repaired under the same user/account locks on retry. */
export async function enqueueProHdGeneration(opts:{userId:string;accountId:string|number;caseId:string|number;expectedPayload:Record<string,unknown>;payload:Record<string,unknown>;idempotencyKey?:string;refinement?:{versionId:string;blockIndex:number;instruction:string}}):Promise<{jobId:string;charge:ProChargeResult;deduped:boolean}> {
  return withTransaction(async main=>{
    await queryClient(main,"SELECT pg_advisory_xact_lock(hashtextextended('pro-hd:'||$1::text,0))",[opts.userId]);
    await lockActiveHdUser(main,opts.userId);
    const pro=await getProPool().connect();
    try {
      await pro.query("BEGIN");
      const account=(await pro.query("SELECT * FROM pro.accounts WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL AND status='active' FOR UPDATE",[opts.accountId,opts.userId])).rows[0];
      if(!account)throw Object.assign(new Error("pro_account_inactive"),{status:403});
      const observed=(await pro.query("SELECT * FROM pro.cases WHERE id=$1 AND account_id=$2",[opts.caseId,opts.accountId])).rows[0];
      if(!observed)throw Object.assign(new Error("case_not_found"),{status:404});
      const client=(await pro.query("SELECT * FROM pro.clients WHERE id=$1 AND account_id=$2 AND deleted_at IS NULL FOR UPDATE",[observed.client_id,opts.accountId])).rows[0];
      const c=(await pro.query("SELECT * FROM pro.cases WHERE id=$1 AND account_id=$2 FOR UPDATE",[opts.caseId,opts.accountId])).rows[0];
      const input=(await pro.query("SELECT * FROM pro.case_inputs WHERE case_id=$1 FOR UPDATE",[opts.caseId])).rows[0];
      if(!client||!c||!["hd","natal","matrix","manual_spread"].includes(c.type)||String(c.client_id)!==String(client.id))throw Object.assign(new Error("client_not_found"),{status:404});
      if(c.status==="archived")throw Object.assign(new Error("case_archived"),{status:409});
      const baseIdentity=proGenerationIdentity({type:c.type,payload:opts.payload,question:c.question,clientId:c.client_id,alias:client.alias,practitionerContext:c.practitioner_context});
      const identity=proGenerationIdentity({baseIdentity,refinement:opts.refinement});
      const requestKey=opts.idempotencyKey?createHash("sha256").update(String(opts.accountId)+":"+String(opts.caseId)+":"+opts.idempotencyKey).digest("hex"):null;
      const prior=requestKey?(await queryClient<AsyncJobRow>(main,"SELECT * FROM async_jobs WHERE user_id=$1 AND kind='pro_premium_report' AND period_metadata->>'pro_request_key'=$2 ORDER BY created_at DESC LIMIT 1",[opts.userId,requestKey])).rows[0]:null;
      if(prior && prior.period_metadata.pro_source_identity!==identity)throw Object.assign(new Error("pro_idempotency_conflict"),{status:409});
      const oldId=input?.payload?.premiumJobId;
      const old=prior??(typeof oldId==="string"?(await queryClient<AsyncJobRow>(main,"SELECT * FROM async_jobs WHERE id=$1 AND user_id=$2 AND kind='pro_premium_report'",[oldId,opts.userId])).rows[0]:null);
      if(old && (old.status==="pending"||old.status==="running"||prior?.status==="completed")) {
        if(old.period_metadata.pro_source_identity && old.period_metadata.pro_source_identity!==identity)throw Object.assign(new Error("generation_in_progress"),{status:409});
        await pro.query("COMMIT");
        return {jobId:old.id,deduped:true,charge:{shadow:Boolean(old.input.chargeShadow),runes:Number(old.input.chargeRunes)||0,ledgerTxnRef:old.charge_transaction_id,newBalance:null,deduplicated:true}};
      }
      if(JSON.stringify(input?.payload??{})!==JSON.stringify(opts.expectedPayload)) {
        // JSONB key order is not an identity; let PostgreSQL compare objects.
        const equal=(await pro.query("SELECT $1::jsonb=$2::jsonb AS ok",[JSON.stringify(input?.payload??{}),JSON.stringify(opts.expectedPayload)])).rows[0]?.ok;
        if(!equal)throw Object.assign(new Error("pro_hd_source_changed"),{status:409});
      }
      const active=(await queryClient(main,"SELECT id FROM async_jobs WHERE user_id=$1 AND kind='pro_premium_report' AND status IN ('pending','running') LIMIT 1",[opts.userId])).rows[0];
      if(active)throw Object.assign(new Error("async_job_limit"),{status:429});
      await reconcileProHdReservations(main,opts.userId,opts.accountId,(sql,params)=>pro.query(sql,params));
      let refinement:Record<string,unknown>|undefined;
      if(opts.refinement) {
        if(c.type!=="hd"&&opts.payload.reportSourceIdentity!==baseIdentity)throw Object.assign(new Error("pro_regenerate_first"),{status:409});
        const latest=(await pro.query("SELECT * FROM pro.case_versions WHERE case_id=$1 ORDER BY version DESC LIMIT 1",[opts.caseId])).rows[0];
        if(!latest||String(latest.id)!==opts.refinement.versionId||!latest.blocks[opts.refinement.blockIndex]||(c.type==="hd"&&!(opts.payload.chartSnapshot as ProChartSnapshot|undefined)?.hdChart))throw Object.assign(new Error("hd_refine_source_changed"),{status:409});
        const snapshot=opts.payload.chartSnapshot as ProChartSnapshot|undefined;
        if(c.type==="hd") {
        const chart=snapshot!.hdChart as unknown as HdChart;
        const current=normalizeBirthFields(opts.payload);
        const identity=(birthDate:string,birthTime:string|null|undefined,timezone:string,birthTimeOccurrence?:"earlier"|"later")=>hdFingerprint({birthDate,birthTime:birthTime??null,timezone,birthTimeOccurrence,placeName:"",lat:0,lon:0});
        if(!chart.birth||!chart.timezone||!current.birthDate||!current.timezone||
          Boolean(current.timeKnown)!==chart.timeKnown||
          identity(current.birthDate,current.timeKnown?current.birthTime:null,current.timezone,current.birthTimeOccurrence)!==
          identity(chart.birth.date,chart.timeKnown?chart.birth.time:null,chart.timezone,chart.birth.timeOccurrence)) {
          throw Object.assign(new Error("hd_regenerate_first"),{status:409});
        }
        }
        refinement={...opts.refinement,blocks:latest.blocks,snapshot:snapshot??null};
      }
      const action=refinement?"refine_block":"generate_draft";
      const runes=proRuneCost(action);
      if(isProTrialEnforced()&&account.tier==="free_trial") {
        const limits=account.limits??{},end=typeof limits.trial_ends_at==="string"?Date.parse(limits.trial_ends_at):NaN;
        if(Number.isFinite(end)&&end<Date.now())throw new ProTrialExceededError("expired");
        const spent=Number((await pro.query("SELECT COALESCE(SUM(runes),0) AS n FROM pro.usage_log WHERE account_id=$1",[opts.accountId])).rows[0].n);
        if(Number(limits.trial_runes)>0&&spent+runes>Number(limits.trial_runes))throw new ProTrialExceededError("runes_exhausted");
      }
      const jobId=randomUUID(),key=`pro-hd:${jobId}`,shadow=getProBillingMode()!=="live";
      const charged=shadow?null:await chargeForSession({client:main,userId:opts.userId,cost:runes,actionType:`pro_${action}`,idempotencyKey:key,operationIdentity:`pro:${identity}:${jobId}`,description:"Pro: подготовка отчёта"});
      const tx=charged?.transactionId??null;
      const payload={...opts.payload,premiumJobId:jobId};
      const jobInput={accountId:opts.accountId,caseId:opts.caseId,caseType:c.type,idempotencyKey:key,chargeIdempotencyKey:key,chargeTransactionId:tx,chargeRunes:runes,chargeShadow:shadow,frozenPayload:payload,frozenQuestion:c.question,frozenClientId:c.client_id,frozenAlias:client.alias,frozenPractitionerContext:c.practitioner_context,...(refinement?{refinement}:{})};
      await queryClient(main,"INSERT INTO async_jobs(id,user_id,kind,input,dedupe_key,action_type,billing_state,charge_transaction_id,period_metadata) VALUES($1,$2,'pro_premium_report',$3::jsonb,$4,$7,$5,$6,$8::jsonb)",[jobId,opts.userId,JSON.stringify(jobInput),key,tx?"charged":"unbilled",tx,`pro_${action}`,JSON.stringify({pro_source_identity:identity,pro_request_key:requestKey})]);
      await pro.query("INSERT INTO pro.usage_log(account_id,action,case_id,runes,idempotency_key,ledger_txn_ref,shadow) VALUES($1,$7,$2,$3,$4,$5,$6)",[opts.accountId,opts.caseId,runes,key,tx,shadow,action]);
      await pro.query("UPDATE pro.case_inputs SET payload=$2::jsonb WHERE case_id=$1",[opts.caseId,JSON.stringify(payload)]);
      await pro.query("UPDATE pro.cases SET status='generating',updated_at=now() WHERE id=$1",[opts.caseId]);
      await pro.query("COMMIT");
      return {jobId,deduped:false,charge:{shadow,runes,ledgerTxnRef:tx,newBalance:charged?.newBalance??null,deduplicated:false}};
    }catch(error){await pro.query("ROLLBACK");throw error;}finally{pro.release();}
  });
}

/** IDs only: deletion retires the content but remains a delivered purchase. */
export async function getProHdReceipt(userId:string,opts:{transactionId?:string;jobId?:string}):Promise<Record<string,unknown>|null> {
  const row=(await proQuery<{case_id:string|null;version_id:string|null;block_count:number;case_type:ProCaseType}>(
    "SELECT case_id,version_id,block_count,case_type FROM pro.hd_delivery_receipts WHERE user_id=$1 AND (($2::uuid IS NOT NULL AND charge_transaction_id=$2) OR ($3::uuid IS NOT NULL AND job_id=$3))",
    [userId,opts.transactionId??null,opts.jobId??null])).rows[0];
  return row ? {caseId:row.case_id,versionId:row.version_id,blockCount:row.block_count,caseType:row.case_type,...(!row.case_id||!row.version_id?{deleted:true}:{})} : null;
}

async function checkSource(source:ProHdSource,run:typeof proQuery):Promise<void> {
  if(source.payload.premiumJobId!==source.worker.jobId)throw Object.assign(new Error("pro_hd_source_changed"),{status:409});
  const row=(await run(`SELECT c.id FROM pro.accounts a JOIN pro.cases c ON c.account_id=a.id
    JOIN pro.clients cl ON cl.id=c.client_id AND cl.account_id=a.id JOIN pro.case_inputs i ON i.case_id=c.id
    WHERE a.id=$1 AND a.user_id=$2 AND a.deleted_at IS NULL AND a.status='active'
      AND c.id=$3 AND c.type=$8 AND c.status='generating' AND c.question IS NOT DISTINCT FROM $4
      AND c.client_id=$5 AND cl.deleted_at IS NULL AND cl.alias=$6 AND i.payload=$7::jsonb AND c.practitioner_context IS NOT DISTINCT FROM $9`,
    [source.accountId,source.userId,source.caseId,source.question,source.clientId,source.alias,JSON.stringify(source.payload),source.caseType??"hd",source.practitionerContext??null])).rows[0];
  if(!row)throw Object.assign(new Error("pro_hd_source_changed"),{status:409});
  if(source.expectedVersionId) {
    const latest=(await run("SELECT id FROM pro.case_versions WHERE case_id=$1 ORDER BY version DESC LIMIT 1",[source.caseId])).rows[0];
    if(!latest||String(latest.id)!==source.expectedVersionId)throw Object.assign(new Error("pro_hd_source_changed"),{status:409});
  }
}

/** Every provider call rechecks cancellation and the frozen source. */
export async function assertProHdGenerationCurrent(source:ProHdSource):Promise<void> {
  await withTransaction(async client=>{
    if(!await lockReportWorkerSave(client,source.userId,source.worker))throw Object.assign(new Error("stale_async_job_attempt"),{status:409});
    await assertClaim(client,source);
    await lockPaidReportReceipt(client,source.transactionId);
    await lockActiveHdUser(client,source.userId);
    if(!await paidReportCanSave(client,source.transactionId))throw Object.assign(new Error("charge_refunded"),{status:409});
    await checkSource(source,proQuery);
  });
}

export async function bindProHdCharge(source:Pick<ProHdSource,"userId"|"accountId"|"caseId"|"worker"|"transactionId"|"caseType">):Promise<void> {
  await withTransaction(async client=>{
    if(!await lockReportWorkerSave(client,source.userId,source.worker))throw new Error("stale_async_job_attempt");
    await lockPaidReportReceipt(client,source.transactionId);
    await lockActiveHdUser(client,source.userId);
    const job=(await queryClient<AsyncJobRow>(client,"SELECT * FROM async_jobs WHERE id=$1",[source.worker.jobId])).rows[0];
    if(String(job.input.accountId)!==String(source.accountId)||String(job.input.caseId)!==String(source.caseId)||job.kind!=="pro_premium_report"||job.input.caseType!==(source.caseType??"hd")||job.input.chargeTransactionId!==source.transactionId)throw new Error("pro_hd_job_binding_mismatch");
    if(source.transactionId){
      const spend=(await queryClient(client,"SELECT id FROM rune_transactions WHERE id=$1 AND user_id=$2 AND type='spend' AND amount<0",[source.transactionId,source.userId])).rows[0];
      if(!spend||!await paidReportCanSave(client,source.transactionId))throw new Error("charge_refunded_or_missing");
      await markAsyncJobCharged(source.worker.jobId,source.transactionId,source.worker.attempt,client);
    }
  });
}

export async function recoverProHdGeneration(source:Pick<ProHdSource,"userId"|"worker"|"transactionId">):Promise<Record<string,unknown>|null> {
  return withTransaction(async main=>{
    if(!await lockReportWorkerSave(main,source.userId,source.worker))return null;
    await lockPaidReportReceipt(main,source.transactionId);
    await lockActiveHdUser(main,source.userId);
    const receipt=await getProHdReceipt(source.userId,{jobId:source.worker.jobId});
    if(receipt)await completeReportWorkerSave(main,source.userId,source.worker,receipt);
    return receipt;
  });
}

/** Main job/paid locks serialize save against refund. The Pro transaction
 * commits a recovery receipt with its version before main delivery commits;
 * this also closes the crash gap when Pro uses a separate database. */
export async function saveProHdGeneration(source:ProHdSource,generated:{blocks:ProReportBlock[];snapshot?:ProChartSnapshot|null;uncertaintyMarks:unknown[];aiTelemetry?:ProHdTelemetry},runes:number):Promise<Record<string,unknown>|null> {
  return withTransaction(async main=>{
    if(!await lockReportWorkerSave(main,source.userId,source.worker,source.transactionId??undefined))return null;
    await assertClaim(main,source);
    await lockPaidReportReceipt(main,source.transactionId);
    await lockActiveHdUser(main,source.userId);
    if(!await paidReportCanSave(main,source.transactionId))return null;
    const prior=await getProHdReceipt(source.userId,{jobId:source.worker.jobId});
    if(prior){await completeReportWorkerSave(main,source.userId,source.worker,prior);return prior;}
    const pro=await getProPool().connect();
    let result:Record<string,unknown>;
    try {
      await pro.query("BEGIN");
      await pro.query("SELECT id FROM pro.accounts WHERE id=$1 FOR UPDATE",[source.accountId]);
      await pro.query("SELECT id FROM pro.clients WHERE id=$1 AND account_id=$2 FOR UPDATE",[source.clientId,source.accountId]);
      await pro.query("SELECT id FROM pro.cases WHERE id=$1 AND account_id=$2 FOR UPDATE",[source.caseId,source.accountId]);
      await pro.query("SELECT case_id FROM pro.case_inputs WHERE case_id=$1 FOR UPDATE",[source.caseId]);
      await checkSource(source,(sql,params)=>pro.query(sql,params));
      const next=(await pro.query("SELECT COALESCE(MAX(version),0)+1 AS version FROM pro.case_versions WHERE case_id=$1",[source.caseId])).rows[0].version;
      const version=(await pro.query("INSERT INTO pro.case_versions(case_id,version,source,blocks,uncertainty_marks) VALUES($1,$2,'ai',$3::jsonb,$4::jsonb) RETURNING id",
        [source.caseId,next,JSON.stringify(generated.blocks),JSON.stringify(generated.uncertaintyMarks)])).rows[0];
      const reportSourceIdentity=proGenerationIdentity({type:source.caseType??"hd",payload:source.payload,question:source.question,clientId:source.clientId,alias:source.alias,practitionerContext:source.practitionerContext??null});
      await pro.query("UPDATE pro.case_inputs SET payload=payload||jsonb_build_object('reportSourceIdentity',$2::text) WHERE case_id=$1",[source.caseId,reportSourceIdentity]);
      if(generated.snapshot)await pro.query("UPDATE pro.case_inputs SET payload=payload||jsonb_build_object('chartSnapshot',$2::jsonb,'premiumJobId',$3::text) WHERE case_id=$1",[source.caseId,JSON.stringify(generated.snapshot),source.worker.jobId]);
      await pro.query("UPDATE pro.cases SET status=$4,ai_cost_runes=ai_cost_runes+$2,ai_cost_rub=CASE WHEN $3::numeric IS NULL THEN NULL ELSE ai_cost_rub+$3 END,updated_at=now() WHERE id=$1",[source.caseId,runes,generated.aiTelemetry?.costRub??null,source.expectedVersionId?"edited":"draft"]);
      await pro.query("INSERT INTO pro.hd_delivery_receipts(job_id,account_id,user_id,case_id,version_id,charge_transaction_id,block_count,case_type) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
        [source.worker.jobId,source.accountId,source.userId,source.caseId,version.id,source.transactionId,generated.blocks.length,source.caseType??"hd"]);
      result={caseId:String(source.caseId),versionId:version.id,blockCount:generated.blocks.length,caseType:source.caseType??"hd"};
      await pro.query("COMMIT");
    } catch(error){await pro.query("ROLLBACK");throw error;} finally{pro.release();}
    await completeReportWorkerSave(main,source.userId,source.worker,result);
    return result;
  });
}

/** Recheck the joined input after taking the case lock; an older failure must
 * never change the status of a newly reserved generation. */
export async function failProHdCase(accountId:string|number,caseId:string|number,jobId:string):Promise<void> {
  const client=await getProPool().connect();
  try {
    await client.query("BEGIN");
    const c=(await client.query("SELECT status FROM pro.cases WHERE id=$1 AND account_id=$2 FOR UPDATE",[caseId,accountId])).rows[0];
    const input=(await client.query("SELECT payload FROM pro.case_inputs WHERE case_id=$1 FOR UPDATE",[caseId])).rows[0];
    if(c?.status==="generating"&&input?.payload?.premiumJobId===jobId)await client.query("UPDATE pro.cases SET status='failed',updated_at=now() WHERE id=$1",[caseId]);
    await client.query("COMMIT");
  }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
}

/** Delivery metadata is excluded so a transport replay after save retains its source identity. */
export function proGenerationIdentity(value:Record<string,unknown>):string {
  function stable(input:unknown):unknown {
    if(Array.isArray(input))return input.map(stable);
    if(input&&typeof input==="object")return Object.fromEntries(Object.entries(input as Record<string,unknown>).filter(([key,value])=>value!==undefined&&key!=="premiumJobId"&&key!=="chartSnapshot"&&key!=="reportSourceIdentity").sort(([a],[b])=>a.localeCompare(b)).map(([key,value])=>[key,stable(value)]));
    return input;
  }
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}
