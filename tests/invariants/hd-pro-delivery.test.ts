import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {query} from '@/lib/db';
import {proQuery} from '@/modules/pro/db';
import {calculateHdChart} from '@/lib/human-design/calculate';
import {enqueueProHdGeneration,bindProHdCharge,claimProHdGeneration,assertProHdGenerationCurrent,saveProHdGeneration,recoverProHdGeneration,failProHdCase,type ProHdSource} from '@/modules/pro/db/hd-generation';
import {setCaseInput,addVersion,hardDeleteCase} from '@/modules/pro/db/cases';
import {deleteUserAccountCompletely} from '@/lib/user-deletion';
import {applyForProAccount} from '@/modules/pro/db/accounts';
import {chargeProAction,getProTrialState,refundProAction} from '@/modules/pro/db/billing';
import {failAsyncJobAndRefundIfCharged} from '@/lib/async-jobs';
import {hasTestDb,installDbLifecycle} from './db/setup';

describe.runIf(hasTestDb)('HD Pro durable delivery boundaries',()=>{
  installDbLifecycle();
  beforeAll(async()=>{
    // The public snapshot predates the optional Pro schema. Bootstrap it from
    // its actual canonical migrations, with no synthetic migration ledger.
    for(const file of ['102_migrate_pro_schema.sql','103_migrate_pro_delivery_billing.sql','113_migrate_pro_case_type_hd.sql','121_migrate_pro_thread_msg_idem.sql','123_migrate_pro_case_cost_rub.sql','168_pro_hd_delivery_receipts.sql'])await proQueryBootstrap(readFileSync(`scripts/migrations/${file}`,'utf8'));
  });
  async function proQueryBootstrap(sql:string){const {getProPool}=await import('@/modules/pro/db');await getProPool().query(sql);}
  beforeEach(async()=>{await proQuery('TRUNCATE pro.accounts RESTART IDENTITY CASCADE');vi.stubEnv('PRO_BILLING_MODE','live');vi.stubEnv('PRO_TRIAL_ENFORCE','false');});
  async function fixture(){
    const userId=(await query("INSERT INTO users(name,gender,zodiac,rune_balance) VALUES('HD Pro fixture','female','test',200) RETURNING id")).rows[0].id;
    const accountId=(await proQuery("INSERT INTO pro.accounts(user_id,status,tier) VALUES($1,'active','pro') RETURNING id",[userId])).rows[0].id;
    const clientId=(await proQuery("INSERT INTO pro.clients(account_id,alias) VALUES($1,'Fixture') RETURNING id",[accountId])).rows[0].id;
    const caseId=(await proQuery("INSERT INTO pro.cases(account_id,client_id,type,status) VALUES($1,$2,'hd','input_ready') RETURNING id",[accountId,clientId])).rows[0].id;
    const payload={birthDate:'1987-04-03',birthTime:'14:00',timezone:'Asia/Yekaterinburg',timeKnown:true};
    await proQuery("INSERT INTO pro.case_inputs(case_id,payload,source) VALUES($1,$2::jsonb,'manual')",[caseId,JSON.stringify(payload)]);
    return {userId,accountId,clientId,caseId,payload};
  }
  async function queue(f:Awaited<ReturnType<typeof fixture>>){return enqueueProHdGeneration({...f,expectedPayload:f.payload});}
  async function claim(f:Awaited<ReturnType<typeof fixture>>,jobId:string):Promise<ProHdSource>{
    const workerId=randomUUID();
    const job=(await query("UPDATE async_jobs SET status='running',worker_id=$2,attempt_count=1,locked_at=now() WHERE id=$1 RETURNING *",[jobId,workerId])).rows[0];
    const source:ProHdSource={...f,payload:job.input.frozenPayload,alias:'Fixture',question:null,transactionId:job.charge_transaction_id,worker:{jobId,attempt:{workerId,attemptCount:1}}};
    source.expectedVersionId=job.input.refinement?.versionId;
    await bindProHdCharge(source);source.claimToken=await claimProHdGeneration(source);return source;
  }
  const generated={blocks:[{id:'fixture',title:'Fixture',body:'Saved receipt fixture'}],uncertaintyMarks:[],snapshot:{caseType:'hd' as const,birthDate:'1987-04-03',birthTime:'14:00',timeKnown:true,placeLabel:null,timezone:'Asia/Yekaterinburg',hdChart:calculateHdChart({birthDate:'1987-04-03',birthTime:'14:00',timezone:'Asia/Yekaterinburg'}) as unknown as Record<string,unknown>},aiTelemetry:{modelId:'fixture/hd',usage:{promptTokens:10,completionTokens:20},llmCalls:1,costRub:null}};
  it('parallel enqueue binds one charged job and one frozen source',async()=>{
    const f=await fixture();const [a,b]=await Promise.all([queue(f),queue(f)]);
    expect(a.jobId).toBe(b.jobId);expect((await query('SELECT COUNT(*)::int AS n FROM async_jobs')).rows[0].n).toBe(1);
    expect((await query("SELECT COUNT(*)::int AS n FROM rune_transactions WHERE type='spend'")).rows[0].n).toBe(1);
    const job=(await query('SELECT * FROM async_jobs WHERE id=$1',[a.jobId])).rows[0];expect(job.billing_state).toBe('charged');expect(job.input.frozenPayload.premiumJobId).toBe(a.jobId);
  });
  it('same attempt claims provider generation only once',async()=>{
    const f=await fixture(),queued=await queue(f),source=await claim(f,queued.jobId);
    await expect(claimProHdGeneration(source)).rejects.toThrow('CLAIM_BUSY');await assertProHdGenerationCurrent(source);
    expect((await query('SELECT billing_state FROM async_jobs WHERE id=$1',[queued.jobId])).rows[0].billing_state).toBe('charged');
  });
  it.each(['edit','archive','deleteClient','humanVersion'])('rejects late save after %s and refunds the held purchase once',async(mode)=>{
    const f=await fixture(),queued=await queue(f),source=await claim(f,queued.jobId);
    if(mode==='edit')await setCaseInput(f.accountId,f.caseId,{...f.payload,birthDate:'2001-01-01'});
    if(mode==='archive')await proQuery("UPDATE pro.cases SET status='archived' WHERE id=$1",[f.caseId]);
    if(mode==='deleteClient')await proQuery("UPDATE pro.clients SET deleted_at=now() WHERE id=$1",[f.clientId]);
    if(mode==='humanVersion')await addVersion(f.accountId,f.caseId,{source:'human',blocks:generated.blocks,status:'edited'});
    await expect(saveProHdGeneration(source,generated,queued.charge.runes)).rejects.toThrow('pro_hd_source_changed');
    await failAsyncJobAndRefundIfCharged(queued.jobId,'source_changed','generation_failed',source.worker.attempt);
    await failAsyncJobAndRefundIfCharged(queued.jobId,'source_changed','generation_failed',source.worker.attempt);
    expect((await query('SELECT rune_balance FROM users WHERE id=$1',[f.userId])).rows[0].rune_balance).toBe(200);
    expect((await proQuery('SELECT COUNT(*)::int AS n FROM pro.hd_delivery_receipts')).rows[0].n).toBe(0);
    if(mode==='edit')expect((await proQuery('SELECT payload FROM pro.case_inputs WHERE case_id=$1',[f.caseId])).rows[0].payload.birthDate).toBe('2001-01-01');
    if(mode==='archive')expect((await proQuery('SELECT status FROM pro.cases WHERE id=$1',[f.caseId])).rows[0].status).toBe('archived');
  });
  it('saved receipt recovers delivery after source deletion without refund or a second version',async()=>{
    const f=await fixture(),queued=await queue(f),source=await claim(f,queued.jobId);
    await saveProHdGeneration(source,generated,queued.charge.runes);
    await proQuery('DELETE FROM pro.cases WHERE id=$1',[f.caseId]);
    await query("UPDATE async_jobs SET status='running',billing_state='charged',worker_id=$2,attempt_count=1,result=NULL WHERE id=$1",[queued.jobId,source.worker.attempt.workerId]);
    const recovered=await recoverProHdGeneration(source);expect(recovered).toMatchObject({deleted:true,caseType:'hd'});
    await failAsyncJobAndRefundIfCharged(queued.jobId,'completion_transport_failure','generation_failed',source.worker.attempt);
    expect((await query("SELECT COUNT(*)::int AS n FROM rune_transactions WHERE type='refund'")).rows[0].n).toBe(0);
    expect((await query('SELECT status FROM async_jobs WHERE id=$1',[queued.jobId])).rows[0].status).toBe('completed');
  });
  it('old failure cannot overwrite a newer reserved job',async()=>{
    const f=await fixture(),queued=await queue(f),source=await claim(f,queued.jobId);
    await failAsyncJobAndRefundIfCharged(queued.jobId,'generation_failed','generation_failed',source.worker.attempt);
    await failProHdCase(f.accountId,f.caseId,queued.jobId);
    const payload=(await proQuery('SELECT payload FROM pro.case_inputs WHERE case_id=$1',[f.caseId])).rows[0].payload;
    const newer=await enqueueProHdGeneration({...f,payload,expectedPayload:payload});
    await failProHdCase(f.accountId,f.caseId,queued.jobId);
    expect((await proQuery('SELECT status FROM pro.cases WHERE id=$1',[f.caseId])).rows[0].status).toBe('generating');expect(newer.jobId).not.toBe(queued.jobId);
  });
  it('shared trial budget serializes HD and other Pro purchases',async()=>{
    vi.stubEnv('PRO_BILLING_MODE','shadow');vi.stubEnv('PRO_TRIAL_ENFORCE','true');
    const f=await fixture();await proQuery("UPDATE pro.accounts SET tier='free_trial',limits=$2::jsonb WHERE id=$1",[f.accountId,JSON.stringify({trial_runes:15,trial_ends_at:'2099-01-01'})]);
    const result=await Promise.allSettled([queue(f),chargeProAction({...f,action:'refine_block',idempotencyKey:`other:${randomUUID()}`})]);
    expect(result.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    expect(Number((await proQuery('SELECT COALESCE(SUM(runes),0) AS n FROM pro.usage_log WHERE account_id=$1',[f.accountId])).rows[0].n)).toBeLessThanOrEqual(15);
  });
  it('failed shadow HD releases trial quota for the account screen and a different Pro action',async()=>{
    vi.stubEnv('PRO_BILLING_MODE','shadow');vi.stubEnv('PRO_TRIAL_ENFORCE','true');
    const f=await fixture();await proQuery("UPDATE pro.accounts SET tier='free_trial',limits=$2::jsonb WHERE id=$1",[f.accountId,JSON.stringify({trial_runes:15,trial_ends_at:'2099-01-01'})]);
    const queued=await queue(f),source=await claim(f,queued.jobId);
    await failAsyncJobAndRefundIfCharged(queued.jobId,'generation_failed','generation_failed',source.worker.attempt);
    await failProHdCase(f.accountId,f.caseId,queued.jobId);
    expect(await getProTrialState(f.accountId)).toMatchObject({spentRunes:0,runesLeft:15,blocked:false});
    await chargeProAction({...f,action:'refine_block',idempotencyKey:'different-case-action'});
    expect((await getProTrialState(f.accountId))?.spentRunes).toBe(5);
  });
  it('refinement charges five runes once and binds the latest delivered chart version',async()=>{
    const f=await fixture(),first=await queue(f),source=await claim(f,first.jobId);
    const receipt=await saveProHdGeneration(source,generated,first.charge.runes);
    const payload=(await proQuery('SELECT payload FROM pro.case_inputs WHERE case_id=$1',[f.caseId])).rows[0].payload;
    const queued=await enqueueProHdGeneration({...f,payload,expectedPayload:payload,refinement:{versionId:String(receipt!.versionId),blockIndex:0,instruction:'Clarify'}});
    expect(queued.charge.runes).toBe(5);const refine=await claim(f,queued.jobId);
    await saveProHdGeneration(refine,generated,queued.charge.runes);
    expect((await proQuery('SELECT ai_cost_runes,status,ai_cost_rub FROM pro.cases WHERE id=$1',[f.caseId])).rows[0]).toMatchObject({ai_cost_runes:20,status:'edited',ai_cost_rub:null});
    expect((await query('SELECT rune_balance FROM users WHERE id=$1',[f.userId])).rows[0].rune_balance).toBe(180);
    expect((await proQuery('SELECT COUNT(*)::int AS n FROM pro.case_versions WHERE case_id=$1',[f.caseId])).rows[0].n).toBe(2);
  });
  it('refuses an old snapshot after a birth edit before creating a job or charge',async()=>{
    const f=await fixture(),first=await queue(f),source=await claim(f,first.jobId);
    const receipt=await saveProHdGeneration(source,generated,first.charge.runes);
    const old=(await proQuery('SELECT payload FROM pro.case_inputs WHERE case_id=$1',[f.caseId])).rows[0].payload;
    const payload={...old,birthDate:'2001-01-01'};await setCaseInput(f.accountId,f.caseId,payload);
    await expect(enqueueProHdGeneration({...f,payload,expectedPayload:payload,refinement:{versionId:String(receipt!.versionId),blockIndex:0,instruction:'Clarify'}})).rejects.toThrow('hd_regenerate_first');
    expect((await query("SELECT COUNT(*)::int AS n FROM rune_transactions WHERE type='spend'")).rows[0].n).toBe(1);
    expect((await query('SELECT COUNT(*)::int AS n FROM async_jobs')).rows[0].n).toBe(1);
  });
  it.each(['live','shadow'])('recovers a Pro commit followed by a main completion failure in %s mode',async(mode)=>{
    vi.stubEnv('PRO_BILLING_MODE',mode);
    const f=await fixture(),queued=await queue(f),source=await claim(f,queued.jobId);
    await query(`CREATE OR REPLACE FUNCTION public.hd_fixture_completion_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id='${queued.jobId}'::uuid AND NEW.status='completed' THEN RAISE EXCEPTION 'fixture_main_completion_crash'; END IF; RETURN NEW; END $$`);
    await query('CREATE TRIGGER hd_fixture_completion_fail BEFORE UPDATE ON async_jobs FOR EACH ROW EXECUTE FUNCTION public.hd_fixture_completion_fail()');
    try {await expect(saveProHdGeneration(source,generated,queued.charge.runes)).rejects.toThrow('fixture_main_completion_crash');}
    finally {await query('DROP TRIGGER hd_fixture_completion_fail ON async_jobs');await query('DROP FUNCTION public.hd_fixture_completion_fail()');}
    expect((await proQuery('SELECT COUNT(*)::int AS n FROM pro.hd_delivery_receipts WHERE job_id=$1',[queued.jobId])).rows[0].n).toBe(1);
    expect((await query('SELECT status FROM async_jobs WHERE id=$1',[queued.jobId])).rows[0].status).toBe('running');
    await failAsyncJobAndRefundIfCharged(queued.jobId,'completion_crash','generation_failed',source.worker.attempt);
    expect((await query('SELECT status,billing_state,input FROM async_jobs WHERE id=$1',[queued.jobId])).rows[0]).toMatchObject({status:'completed',billing_state:'completed'});
    expect((await query('SELECT input FROM async_jobs WHERE id=$1',[queued.jobId])).rows[0].input.frozenPayload).toBeUndefined();
    expect((await query("SELECT COUNT(*)::int AS n FROM rune_transactions WHERE type='refund'")).rows[0].n).toBe(0);
    expect((await proQuery('SELECT COUNT(*)::int AS n FROM pro.case_versions WHERE case_id=$1',[f.caseId])).rows[0].n).toBe(1);
  });
  it('purges pending HD frozen copies and refunds exactly once',async()=>{
    const f=await fixture(),queued=await queue(f);
    await proQuery("INSERT INTO pro.audit_log(account_id,actor,action,target,meta) VALUES($1,'user','case.refine_block',$2,$3::jsonb)",[f.accountId,String(f.caseId),JSON.stringify({instruction:'Private refinement'})]);
    expect(await hardDeleteCase(f.accountId,f.caseId)).toBe(true);expect(await hardDeleteCase(f.accountId,f.caseId)).toBe(false);
    const job=(await query('SELECT * FROM async_jobs WHERE id=$1',[queued.jobId])).rows[0];
    expect(job).toMatchObject({status:'failed',billing_state:'refunded',result:{deleted:true,caseType:'hd'}});
    expect(job.input.frozenPayload).toBeUndefined();expect(job.input.frozenAlias).toBeUndefined();
    expect((await proQuery('SELECT COUNT(*)::int AS n FROM pro.audit_log WHERE account_id=$1',[f.accountId])).rows[0].n).toBe(0);
    expect((await query('SELECT rune_balance FROM users WHERE id=$1',[f.userId])).rows[0].rune_balance).toBe(200);
    expect((await query("SELECT COUNT(*)::int AS n FROM rune_transactions WHERE type='refund'")).rows[0].n).toBe(1);
  });
  it('full erasure removes Pro cases, receipts, audit copies and blocks stale Pro application',async()=>{
    const f=await fixture(),queued=await queue(f),source=await claim(f,queued.jobId);await saveProHdGeneration(source,generated,queued.charge.runes);
    await proQuery("INSERT INTO pro.audit_log(account_id,actor,actor_user_id,action,meta) VALUES($1,'user',$2,'fixture',$3::jsonb)",[f.accountId,f.userId,JSON.stringify({instruction:'Private fixture'})]);
    await deleteUserAccountCompletely(randomUUID(),f.userId);
    for(const table of ['accounts','cases','hd_delivery_receipts','audit_log'])expect((await proQuery(`SELECT COUNT(*)::int AS n FROM pro.${table}`)).rows[0].n).toBe(0);
    await expect(applyForProAccount({userId:f.userId,displayName:'Late'})).rejects.toThrow('account_inactive');
  });
  it('tenant-scoped billing keeps equal and oversized client keys independent',async()=>{
    const a=await fixture(),b=await fixture();
    for(const key of ['shared-client-key','invalid key '.repeat(30)]) {
      const charges=await Promise.all([chargeProAction({...a,action:'refine_block',idempotencyKey:key}),chargeProAction({...b,action:'refine_block',idempotencyKey:key})]);
      expect(charges.every(c=>c.runes===5&&!c.deduplicated)).toBe(true);expect(charges[0].ledgerTxnRef).not.toBe(charges[1].ledgerTxnRef);
      const again=await chargeProAction({...a,action:'refine_block',idempotencyKey:key});expect(again.deduplicated).toBe(true);expect(again.ledgerTxnRef).toBe(charges[0].ledgerTxnRef);
    }
    expect((await query("SELECT COUNT(*)::int AS n FROM rune_transactions WHERE type='spend'")).rows[0].n).toBe(4);
  });

  it('retry settles a pending purchase after Pro deletion commits and main commit fails',async()=>{
    const f=await fixture(),queued=await queue(f);
    await query(`CREATE OR REPLACE FUNCTION public.hd_fixture_purge_commit_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id='${queued.jobId}'::uuid AND NEW.status='failed' THEN RAISE EXCEPTION 'fixture_purge_main_commit_crash'; END IF; RETURN NEW; END $$`);
    await query('CREATE CONSTRAINT TRIGGER hd_fixture_purge_commit_fail AFTER UPDATE ON async_jobs DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.hd_fixture_purge_commit_fail()');
    try {await expect(hardDeleteCase(f.accountId,f.caseId)).rejects.toThrow('fixture_purge_main_commit_crash');}
    finally {await query('DROP TRIGGER hd_fixture_purge_commit_fail ON async_jobs');await query('DROP FUNCTION public.hd_fixture_purge_commit_fail()');}
    expect((await proQuery('SELECT id FROM pro.cases WHERE id=$1',[f.caseId])).rows).toHaveLength(0);
    expect((await query('SELECT input,status FROM async_jobs WHERE id=$1',[queued.jobId])).rows[0]).toMatchObject({status:'pending',input:{caseType:'hd'}});
    expect(await hardDeleteCase(f.accountId,f.caseId)).toBe(false);
    const job=(await query('SELECT * FROM async_jobs WHERE id=$1',[queued.jobId])).rows[0];
    expect(job).toMatchObject({status:'failed',billing_state:'refunded',result:{deleted:true}});expect(job.input.frozenPayload).toBeUndefined();
    expect((await query('SELECT rune_balance FROM users WHERE id=$1',[f.userId])).rows[0].rune_balance).toBe(200);
    expect((await query("SELECT COUNT(*)::int AS n FROM rune_transactions WHERE type='refund'")).rows[0].n).toBe(1);
  });
  it('a refunded Pro client key cannot consume a free replacement action',async()=>{
    const f=await fixture(),key='retry-after-refund';
    const purchase=await chargeProAction({...f,action:'refine_block',idempotencyKey:key});
    await refundProAction({userId:f.userId,idempotencyKey:key,transactionId:purchase.ledgerTxnRef,spentRunes:purchase.runes,shadow:false});
    await expect(chargeProAction({...f,action:'refine_block',idempotencyKey:key})).rejects.toThrow('pro_idempotency_refunded');
    expect((await query('SELECT rune_balance FROM users WHERE id=$1',[f.userId])).rows[0].rune_balance).toBe(200);
    expect((await query("SELECT COUNT(*)::int AS n FROM rune_transactions WHERE type='spend'")).rows[0].n).toBe(1);
  });

});
