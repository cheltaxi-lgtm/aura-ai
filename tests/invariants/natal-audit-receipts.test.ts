import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { query, getPool } from "@/lib/db";
import { computeNatalChartRecord } from "@/lib/natal/compute";
import { buildBirthFingerprint } from "@/lib/natal/types";
import { claimNatalInterpretationResilient, saveCurrentNatalInterpretation, deleteCurrentUserNatalReport } from "@/lib/services/natal-chart-service";
import { createAsyncJob, claimAsyncJobs, markAsyncJobCharged, refundChargedAsyncJobIfNeeded, getAsyncJobById, type AsyncJobRow } from "@/lib/async-jobs";
import { beginWorkerJobSave, refundWorkerJobCharge } from "@/lib/async-job-lifecycle";
import { lockPaidReportReceipt } from "@/lib/services/durable-report-receipt";
import { createCompatibilityInvite, acceptCompatibilityInvite, getInviteStatus, getCompatibilityRecord, createManualCompatibility, claimCompatibilityGeneration, saveCompatibilityReport } from "@/lib/services/natal-compatibility-service";
import { buildCompatibilityEvidence, type CompatibilityReport } from "@/lib/natal/compatibility-report";
import { POST as interpretationRoute } from "@/app/api/natal-chart/interpretation/route";
import { WORKER_SECRET_HEADER, WORKER_USER_HEADER, WORKER_JOB_HEADER, WORKER_ATTEMPT_HEADER, WORKER_ID_HEADER } from "@/lib/async-job-worker-auth";
import { hasTestDb, installDbLifecycle } from "./db/setup";

const place = { label: "Moscow", latitude:55.7558,longitude:37.6173,timezone:"Europe/Moscow" };
describe.runIf(hasTestDb)("Natal durable purchases and participant isolation", () => {
  installDbLifecycle();
  beforeAll(() => vi.stubEnv("ASYNC_JOB_WORKER_SECRET", "natal-receipt-test-only"));
  afterAll(() => vi.unstubAllEnvs());
  async function person(date="1990-08-15") {
    await query("INSERT INTO platform_settings(key,value) VALUES('natalChart','{\"enabled\":true}') ON CONFLICT(key) DO UPDATE SET value=platform_settings.value || excluded.value");
    const id = (await query("INSERT INTO users(name,gender,zodiac,birth_date,birth_time,birth_city,rune_balance) VALUES('Natal fixture','female','test',$1,'12:30','Moscow',470) RETURNING id", [date])).rows[0].id as string;
    const profileFingerprint=buildBirthFingerprint({birthDate:date,birthTime:"12:30",birthCity:"Moscow"});
    await query("UPDATE users SET astro_meta=$2 WHERE id=$1",[id,{natalBirthPlace:{profileFingerprint,place}}]);
    const chart=await computeNatalChartRecord(id,{birthDate:date,birthTime:"12:30",birthCity:"Moscow",timeKnown:true,place});
    await query("INSERT INTO natal_charts(user_id,engine_version,chart_data,birth_lat,birth_lon,birth_tzid,birth_place_label,time_known) VALUES($1,$2,$3,$4,$5,$6,$7,true)",[id,chart.engineVersion,chart,place.latitude,place.longitude,place.timezone,place.label]);
    return {id,chart};
  }
  function request(job:AsyncJobRow) {
    return new NextRequest("http://127.0.0.1/api/natal-chart/interpretation",{method:"POST",headers:{host:"127.0.0.1",
      [WORKER_SECRET_HEADER]:"natal-receipt-test-only",[WORKER_USER_HEADER]:job.user_id,[WORKER_JOB_HEADER]:job.id,
      [WORKER_ATTEMPT_HEADER]:String(job.attempt_count),[WORKER_ID_HEADER]:job.worker_id!,"Content-Type":"application/json"},
      body:JSON.stringify({tradition:"western",aiDataUseAcknowledged:true,forceRegenerate:true})});
  }
  async function purchase() {
    const p=await person();
    await createAsyncJob({userId:p.id,kind:"natal_interpretation",payload:{tradition:"western",forceRegenerate:true}});
    const [job]=await claimAsyncJobs({workerId:"natal-receipt-worker",kinds:["natal_interpretation"],limit:1});
    const transaction=(await query("INSERT INTO rune_transactions(user_id,type,amount,balance_after,description,action_type) VALUES($1,'spend',-30,470,'Synthetic Natal purchase','NATAL_READING') RETURNING id",[p.id])).rows[0].id as string;
    await markAsyncJobCharged(job.id,transaction);
    return {...p,job,transaction};
  }
  async function save(p:Awaited<ReturnType<typeof purchase>>,worker=true) {
    const claim=await claimNatalInterpretationResilient(p.id,"western",p.chart.birthFingerprint!,p.chart.engineVersion,"astronomy-engine",{forceRegenerate:true});
    expect(claim.status).toBe("claimed");if(claim.status!=="claimed")throw Error("claim");
    if(worker)expect(await beginWorkerJobSave(request(p.job))).toBe(true);
    return saveCurrentNatalInterpretation({userId:p.id,tradition:"western",interpretation:"Saved paid Natal report",
      expectedBirthFingerprint:p.chart.birthFingerprint!,expectedEngineVersion:p.chart.engineVersion,expectedEphemeris:"astronomy-engine",
      claimToken:claim.token,runeCost:30,chargeTransactionId:p.transaction,forceRegenerate:true,
      ...(worker?{workerJob:{jobId:p.job.id,attempt:{workerId:p.job.worker_id!,attemptCount:p.job.attempt_count}}}:{})});
  }
  it("commits receipt and completed delivery together, including deletion after save",async()=>{
    const p=await purchase(),saved=await save(p);expect(saved.status).toBe("saved");if(saved.status==="stale")return;
    expect(await getAsyncJobById(p.job.id)).toMatchObject({status:"completed",billing_state:"completed",result:{reportId:saved.report.id}});
    expect((await refundWorkerJobCharge(request(p.job),{userId:p.id,cost:30,wasFreeQuestion:false,transactionId:p.transaction})).refunded).toBe(false);
    await deleteCurrentUserNatalReport(p.id,saved.report.id);
    expect(await getAsyncJobById(p.job.id)).toMatchObject({status:"completed",billing_state:"completed",result:{reportId:saved.report.id,deleted:true}});
    expect(await refundChargedAsyncJobIfNeeded(p.job.id)).toBe(false);
    expect((await query("SELECT count(*) FROM rune_transactions WHERE refund_of_transaction_id=$1",[p.transaction])).rows[0].count).toBe("0");
  });
  it("restores a requeued force purchase by its exact receipt before chart or LLM work",async()=>{
    const p=await purchase(),saved=await save(p,false);if(saved.status==="stale")throw Error("save");
    await query("UPDATE async_jobs SET status='pending',worker_id=NULL,locked_at=NULL WHERE id=$1",[p.job.id]);
    const [job]=await claimAsyncJobs({workerId:"natal-receipt-worker",kinds:["natal_interpretation"],limit:1});
    await query("UPDATE users SET birth_date='1980-01-01' WHERE id=$1",[p.id]);
    const response=await interpretationRoute(request(job));expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({reportId:saved.report.id,interpretation:"Saved paid Natal report"});
    expect(await getAsyncJobById(job.id)).toMatchObject({status:"completed",billing_state:"completed"});
    expect((await query("SELECT count(*) FROM natal_report_history WHERE user_id=$1",[p.id])).rows[0].count).toBe("1");
  });
  it("refund waits for an uncommitted save and recovers it after commit",async()=>{
    const p=await purchase(),client=await getPool().connect();let pending:Promise<boolean>|undefined;
    try {
      await client.query("BEGIN");await lockPaidReportReceipt(client,p.transaction);
      const report=(await client.query("INSERT INTO natal_report_history(user_id,birth_fingerprint,engine_version,ephemeris,tradition,content,charge_transaction_id) VALUES($1,$2,$3,'astronomy-engine','western','Uncommitted paid receipt',$4) RETURNING id",[p.id,p.chart.birthFingerprint,p.chart.engineVersion,p.transaction])).rows[0].id;
      await query("UPDATE async_jobs SET status='failed' WHERE id=$1",[p.job.id]);pending=refundChargedAsyncJobIfNeeded(p.job.id);
      let blocked=false;
      for(let n=0;n<40;n++){await client.query("SELECT pg_stat_clear_snapshot()");if((await client.query("SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event='advisory' AND query LIKE '%paid-report:%'")).rowCount){blocked=true;break;}await new Promise(r=>setTimeout(r,15));}
      expect(blocked).toBe(true);await client.query("COMMIT");expect(await pending).toBe(false);
      expect(await getAsyncJobById(p.job.id)).toMatchObject({status:"completed",billing_state:"completed",result:{reportId:report}});
    } finally {await client.query("ROLLBACK");client.release();await pending;}
  });
  it("keeps paid revisions immutable and a live new claim when the old version is deleted",async()=>{
    const p=await purchase(),first=await save(p,false);if(first.status==="stale")throw Error("save");
    const claim=await claimNatalInterpretationResilient(p.id,"western",p.chart.birthFingerprint!,p.chart.engineVersion,"astronomy-engine",{forceRegenerate:true});if(claim.status!=="claimed")throw Error("claim");
    await deleteCurrentUserNatalReport(p.id,first.report.id);
    expect((await query("SELECT chart_data FROM natal_charts WHERE user_id=$1",[p.id])).rows[0].chart_data.interpretationClaims.western.token).toBe(claim.token);
    const next=await saveCurrentNatalInterpretation({userId:p.id,tradition:"western",interpretation:"Second paid version",expectedBirthFingerprint:p.chart.birthFingerprint!,expectedEngineVersion:p.chart.engineVersion,expectedEphemeris:"astronomy-engine",claimToken:claim.token,runeCost:0,forceRegenerate:true});
    expect(next.status).toBe("saved");if(next.status==="stale")return;expect(next.report.id).not.toBe(first.report.id);
    expect((await query("SELECT chart_snapshot FROM natal_report_history WHERE id=$1",[next.report.id])).rows[0].chart_snapshot.birthFingerprint).toBe(p.chart.birthFingerprint);
  });
  it("rejects a stale profile and a stale worker attempt before saving or refunding",async()=>{
    const p=await purchase();await query("UPDATE users SET birth_date='1980-01-01' WHERE id=$1",[p.id]);expect((await save(p)).status).toBe("stale");
    await query("UPDATE async_jobs SET attempt_count=attempt_count+1 WHERE id=$1",[p.job.id]);
    expect((await refundWorkerJobCharge(request(p.job),{userId:p.id,cost:30,wasFreeQuestion:false,transactionId:p.transaction})).refunded).toBe(false);
  });
  it("serializes two tokens for one participant but isolates different people with identical births",async()=>{
    const owner=await person(),a=await person("1988-03-03"),b=await person("1988-03-03");
    const one=await createCompatibilityInvite({ownerUserId:owner.id}),two=await createCompatibilityInvite({ownerUserId:owner.id});
    const result=await Promise.all([one,two].map(i=>acceptCompatibilityInvite({token:i.token,participantUserId:a.id})));
    expect(result[0].record.id).toBe(result[1].record.id);
    const third=await createCompatibilityInvite({ownerUserId:owner.id});const other=await acceptCompatibilityInvite({token:third.token,participantUserId:b.id});
    expect(other.record.id).not.toBe(result[0].record.id);expect(await getCompatibilityRecord(result[0].record.id,b.id)).toBeNull();
    await query("DELETE FROM users WHERE id=$1",[a.id]);await query("DELETE FROM users WHERE id=$1",[b.id]);
    const stranger=await person("1988-03-03");expect(await getInviteStatus(one.token,stranger.id)).toBeNull();
    await expect(acceptCompatibilityInvite({token:one.token,participantUserId:stranger.id})).rejects.toThrow();
    expect(await getCompatibilityRecord(other.record.id,owner.id)).not.toBeNull();
  });
  it("does not give an authenticated invite participant a manual person's report",async()=>{
    const owner=await person(),partner=await person("1988-03-03");
    const manual=await createManualCompatibility({ownerUserId:owner.id,partnerInput:{birthDate:"1988-03-03",birthTime:"12:30",birthCity:"Moscow",timeKnown:true,place},partnerLabel:"Private manual person"});
    const invite=await createCompatibilityInvite({ownerUserId:owner.id});const accepted=await acceptCompatibilityInvite({token:invite.token,participantUserId:partner.id});
    expect(accepted.record.id).not.toBe(manual.record.id);expect(await getCompatibilityRecord(manual.record.id,partner.id)).toBeNull();
  });
  it("refuses a compatibility save when either profile changed during generation",async()=>{
    const owner=await person(),partner=await person("1988-03-03"),invite=await createCompatibilityInvite({ownerUserId:owner.id});
    const accepted=await acceptCompatibilityInvite({token:invite.token,participantUserId:partner.id}),claim=await claimCompatibilityGeneration(accepted.record.id,owner.id);
    if(claim.status!=="claimed"||!claim.record.synastry)throw Error("claim");
    await query("UPDATE users SET birth_date='1980-01-01' WHERE id=$1",[partner.id]);
    const report:CompatibilityReport={version:"1.0",sections:[],disclaimer:"Synthetic fixture"};
    expect(await saveCompatibilityReport({id:claim.record.id,ownerUserId:owner.id,claimToken:claim.token,report,evidence:buildCompatibilityEvidence(claim.record.synastry),runeCost:0})).toBeNull();
  });
  it("does not hold an invite lock while a stale owner calculation waits for account erasure", async () => {
    const owner=await person(),participant=await person(),invite=await createCompatibilityInvite({ownerUserId:owner.id,partnerLabel:"Participant"});
    await query("UPDATE users SET birth_date='1980-01-01' WHERE id=$1",[owner.id]);
    const eraser=await getPool().connect();let accepted:Promise<unknown>|undefined;
    try {
      await eraser.query("BEGIN");await eraser.query("SET LOCAL statement_timeout='1500ms'");
      await eraser.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[owner.id]);
      accepted=acceptCompatibilityInvite({token:invite.token,participantUserId:participant.id}).catch(error=>error);
      let waiting=false;
      for(let i=0;i<160;i++){
        await eraser.query('SELECT pg_stat_clear_snapshot()');
        if((await eraser.query("SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%FROM users WHERE id=$1 FOR UPDATE%'")).rowCount){waiting=true;break;}
        await new Promise(resolve=>setTimeout(resolve,25));
      }
      expect(waiting).toBe(true);
      await eraser.query('DELETE FROM users WHERE id=$1',[owner.id]);await eraser.query('COMMIT');
      expect(await accepted).toBeInstanceOf(Error);
      expect((await query('SELECT id FROM natal_compatibility_reports WHERE id=$1',[invite.record.id])).rows).toHaveLength(0);
    } finally {await eraser.query('ROLLBACK');eraser.release();await accepted;}
  },10000);

});
