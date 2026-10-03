import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {query} from '@/lib/db';
import {getProPool,proQuery} from '@/modules/pro/db';
import {enqueueProHdGeneration,bindProHdCharge,claimProHdGeneration,assertProHdGenerationCurrent,saveProHdGeneration,recoverProHdGeneration,failProHdCase,type ProHdSource} from '@/modules/pro/db/hd-generation';
import {setCaseInput,addVersion,hardDeleteCase} from '@/modules/pro/db/cases';
import {failAsyncJobAndRefundIfCharged} from '@/lib/async-jobs';
import {hasTestDb,installDbLifecycle} from './db/setup';

describe.runIf(hasTestDb).each(['natal','matrix','manual_spread'] as const)('Pro %s durable generation',caseType=>{
  installDbLifecycle();
  beforeAll(async()=>{
    if(!process.env.TEST_PRO_DATABASE_URL)throw new Error("TEST_PRO_DATABASE_URL is required to verify separate Pro delivery commits");
    if(process.env.TEST_PRO_DATABASE_URL) {
      const url=new URL(process.env.TEST_PRO_DATABASE_URL);
      if(!["127.0.0.1","localhost"].includes(url.hostname)||!url.pathname.endsWith("_test")||process.env.TEST_PRO_DATABASE_URL===process.env.DATABASE_URL_PRIMARY_SNAPSHOT||process.env.TEST_PRO_DATABASE_URL===process.env.TEST_DATABASE_URL)throw new Error("Unsafe separate Pro test database");
      vi.stubEnv("PRO_DATABASE_URL",url.toString());
    }
    for(const file of ['102_migrate_pro_schema.sql','103_migrate_pro_delivery_billing.sql','113_migrate_pro_case_type_hd.sql','121_migrate_pro_thread_msg_idem.sql','123_migrate_pro_case_cost_rub.sql','168_pro_hd_delivery_receipts.sql','171_pro_generation_receipts.sql'])await getProPool().query(readFileSync('scripts/migrations/'+file,'utf8'));
  });
  beforeEach(async()=>{await proQuery('TRUNCATE pro.accounts RESTART IDENTITY CASCADE');vi.stubEnv('PRO_BILLING_MODE','live');vi.stubEnv('PRO_TRIAL_ENFORCE','false');});
  async function fixture(){
    const userId=(await query("INSERT INTO users(name,gender,zodiac,rune_balance) VALUES('Pro fixture','female','test',200) RETURNING id")).rows[0].id;
    const accountId=(await proQuery("INSERT INTO pro.accounts(user_id,status,tier) VALUES($1,'active','pro') RETURNING id",[userId])).rows[0].id;
    const clientId=(await proQuery("INSERT INTO pro.clients(account_id,alias) VALUES($1,'Fixture') RETURNING id",[accountId])).rows[0].id;
    const caseId=(await proQuery("INSERT INTO pro.cases(account_id,client_id,type,status,question,practitioner_context) VALUES($1,$2,$3,'input_ready','Question','Context') RETURNING id",[accountId,clientId,caseType])).rows[0].id;
    const payload={birthDate:'1987-04-03',cards:[{name:'Маг',position:'1',reversed:false}]};
    await proQuery("INSERT INTO pro.case_inputs(case_id,payload,source) VALUES($1,$2::jsonb,'manual')",[caseId,JSON.stringify(payload)]);
    return {userId,accountId,clientId,caseId,payload};
  }
  async function input(caseId:string){return (await proQuery('SELECT payload FROM pro.case_inputs WHERE case_id=$1',[caseId])).rows[0].payload;}
  async function claim(f:Awaited<ReturnType<typeof fixture>>,jobId:string):Promise<ProHdSource>{
    const workerId=randomUUID();
    const job=(await query("UPDATE async_jobs SET status='running',worker_id=$2,attempt_count=1,locked_at=now() WHERE id=$1 RETURNING *",[jobId,workerId])).rows[0];
    const source:ProHdSource={...f,caseType,payload:job.input.frozenPayload,alias:job.input.frozenAlias,question:job.input.frozenQuestion,practitionerContext:job.input.frozenPractitionerContext,expectedVersionId:job.input.refinement?.versionId,transactionId:job.charge_transaction_id,worker:{jobId,attempt:{workerId,attemptCount:1}}};
    await bindProHdCharge(source);source.claimToken=await claimProHdGeneration(source);return source;
  }
  const generated={blocks:[{id:'one',title:'Section',body:'A complete fixture report.'}],uncertaintyMarks:[]};
  it('rejects input edits while generating without losing job ownership, then permits edits after save',async()=>{
    const f=await fixture(),q=await enqueueProHdGeneration({...f,expectedPayload:f.payload});
    await expect(setCaseInput(f.accountId,f.caseId,{...f.payload,birthDate:'2001-01-01'})).rejects.toMatchObject({message:'generation_in_progress',status:409});
    expect(await input(f.caseId)).toMatchObject({...f.payload,premiumJobId:q.jobId});
    expect((await proQuery('SELECT status FROM pro.cases WHERE id=$1',[f.caseId])).rows[0].status).toBe('generating');
    const source=await claim(f,q.jobId);await saveProHdGeneration(source,generated,q.charge.runes);
    await expect(setCaseInput(f.accountId,f.caseId,{...f.payload,birthDate:'2001-01-01'})).resolves.toMatchObject({status:'input_ready'});
  });
  it('serializes parallel requests and replays completed transport key without a new debit or version',async()=>{
    const f=await fixture(),opts={...f,expectedPayload:f.payload,idempotencyKey:'same-key'};
    const [a,b]=await Promise.all([enqueueProHdGeneration(opts),enqueueProHdGeneration(opts)]);
    expect(a.jobId).toBe(b.jobId);
    const source=await claim(f,a.jobId);await saveProHdGeneration(source,generated,a.charge.runes);
    const payload=await input(f.caseId),again=await enqueueProHdGeneration({...opts,payload,expectedPayload:payload});
    expect(again).toMatchObject({jobId:a.jobId,deduped:true});
    expect((await query("SELECT COUNT(*)::int AS n FROM rune_transactions WHERE type='spend'")).rows[0].n).toBe(1);
    expect((await proQuery('SELECT COUNT(*)::int AS n FROM pro.case_versions')).rows[0].n).toBe(1);
    const job=(await query('SELECT input FROM async_jobs WHERE id=$1',[a.jobId])).rows[0];
    expect(job.input.frozenPayload).toBeUndefined();expect(job.input.frozenPractitionerContext).toBeUndefined();
  });
  it('rejects a transport key reused with changed paid contents and keeps the frozen source',async()=>{
    const f=await fixture(),q=await enqueueProHdGeneration({...f,expectedPayload:f.payload,idempotencyKey:'conflict'});
    const changed={...f.payload,birthDate:'2001-01-01'};await proQuery('UPDATE pro.case_inputs SET payload=$2::jsonb WHERE case_id=$1',[f.caseId,JSON.stringify(changed)]);
    await expect(enqueueProHdGeneration({...f,payload:changed,expectedPayload:changed,idempotencyKey:'conflict'})).rejects.toThrow('pro_idempotency_conflict');
    const job=(await query('SELECT input FROM async_jobs WHERE id=$1',[q.jobId])).rows[0];expect(job.input.frozenPayload.birthDate).toBe(f.payload.birthDate);
  });
  it.each(['payload','question','alias','context','humanVersion'])('rejects provider and save after changing %s',async(mode)=>{
    const f=await fixture(),q=await enqueueProHdGeneration({...f,expectedPayload:f.payload}),source=await claim(f,q.jobId);
    if(mode==='payload')await proQuery('UPDATE pro.case_inputs SET payload=$2::jsonb WHERE case_id=$1',[f.caseId,JSON.stringify({...f.payload,birthDate:'2001-01-01'})]);
    if(mode==='question')await proQuery("UPDATE pro.cases SET question='Changed' WHERE id=$1",[f.caseId]);
    if(mode==='alias')await proQuery("UPDATE pro.clients SET alias='Changed' WHERE id=$1",[f.clientId]);
    if(mode==='context')await proQuery("UPDATE pro.cases SET practitioner_context='Changed' WHERE id=$1",[f.caseId]);
    if(mode==='humanVersion')await addVersion(f.accountId,f.caseId,{source:'human',blocks:generated.blocks,status:'edited'});
    await expect(assertProHdGenerationCurrent(source)).rejects.toThrow('pro_hd_source_changed');
    await expect(saveProHdGeneration(source,generated,q.charge.runes)).rejects.toThrow('pro_hd_source_changed');
    await failAsyncJobAndRefundIfCharged(q.jobId,'source_changed','generation_failed',source.worker.attempt);
    await failAsyncJobAndRefundIfCharged(q.jobId,'source_changed','generation_failed',source.worker.attempt);
    expect((await query('SELECT rune_balance FROM users WHERE id=$1',[f.userId])).rows[0].rune_balance).toBe(200);
  });
  it('refunded retry creates a new paid reservation and late old failure cannot clobber it',async()=>{
    const f=await fixture(),q=await enqueueProHdGeneration({...f,expectedPayload:f.payload,idempotencyKey:'retry'}),source=await claim(f,q.jobId);
    await failAsyncJobAndRefundIfCharged(q.jobId,'failed','generation_failed',source.worker.attempt);await failProHdCase(f.accountId,f.caseId,q.jobId);
    const payload=await input(f.caseId),next=await enqueueProHdGeneration({...f,payload,expectedPayload:payload,idempotencyKey:'retry'});
    expect(next.jobId).not.toBe(q.jobId);expect(next.charge.ledgerTxnRef).not.toBe(q.charge.ledgerTxnRef);
    await failProHdCase(f.accountId,f.caseId,q.jobId);expect((await proQuery('SELECT status FROM pro.cases WHERE id=$1',[f.caseId])).rows[0].status).toBe('generating');
  });
  it('binds refinement to the last version and rejects changed report source',async()=>{
    const f=await fixture(),q=await enqueueProHdGeneration({...f,expectedPayload:f.payload}),source=await claim(f,q.jobId);
    const saved=await saveProHdGeneration(source,generated,q.charge.runes),payload=await input(f.caseId);
    const refinement={versionId:String(saved!.versionId),blockIndex:0,instruction:'Clarify'};
    const changed={...payload,birthDate:'2001-01-01'};await setCaseInput(f.accountId,f.caseId,changed);
    await expect(enqueueProHdGeneration({...f,payload:changed,expectedPayload:changed,refinement})).rejects.toThrow('pro_regenerate_first');
    await setCaseInput(f.accountId,f.caseId,payload);
    const next=await enqueueProHdGeneration({...f,payload,expectedPayload:payload,refinement});expect(next.charge.runes).toBe(5);
    const refine=await claim(f,next.jobId);await saveProHdGeneration(refine,generated,next.charge.runes);
    expect((await proQuery('SELECT status,ai_cost_runes FROM pro.cases WHERE id=$1',[f.caseId])).rows[0]).toMatchObject({status:'edited',ai_cost_runes:20});
  });
  it.each(['live','shadow'])('recovers a Pro commit after main completion crashes in %s billing',async(mode)=>{
    vi.stubEnv('PRO_BILLING_MODE',mode);const f=await fixture(),q=await enqueueProHdGeneration({...f,expectedPayload:f.payload}),source=await claim(f,q.jobId);
    await query("CREATE OR REPLACE FUNCTION public.pro_fixture_crash() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status='completed' THEN RAISE EXCEPTION 'fixture_commit_crash'; END IF; RETURN NEW; END $$");
    await query('CREATE TRIGGER pro_fixture_crash BEFORE UPDATE ON async_jobs FOR EACH ROW EXECUTE FUNCTION public.pro_fixture_crash()');
    try {await expect(saveProHdGeneration(source,generated,q.charge.runes)).rejects.toThrow('fixture_commit_crash');}
    finally {await query('DROP TRIGGER pro_fixture_crash ON async_jobs');await query('DROP FUNCTION public.pro_fixture_crash()');}
    const recovered=await recoverProHdGeneration(source);expect(recovered).toMatchObject({caseType,blockCount:1});
    await failAsyncJobAndRefundIfCharged(q.jobId,'transport_failure','generation_failed',source.worker.attempt);
    expect((await query("SELECT COUNT(*)::int AS n FROM rune_transactions WHERE type='refund'")).rows[0].n).toBe(0);
    expect((await proQuery('SELECT COUNT(*)::int AS n FROM pro.case_versions')).rows[0].n).toBe(1);
  });
  it('case purge removes frozen private copies and refunds only undelivered work',async()=>{
    const f=await fixture(),q=await enqueueProHdGeneration({...f,expectedPayload:f.payload});
    expect(await hardDeleteCase(f.accountId,f.caseId)).toBe(true);
    const job=(await query('SELECT * FROM async_jobs WHERE id=$1',[q.jobId])).rows[0];expect(job).toMatchObject({status:'failed',billing_state:'refunded',result:{caseType,deleted:true}});
    expect(job.input.frozenPayload).toBeUndefined();expect(job.input.frozenPractitionerContext).toBeUndefined();
  });
});
