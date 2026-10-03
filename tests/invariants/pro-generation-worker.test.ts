import {beforeEach,describe,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
const m=vi.hoisted(()=>({bind:vi.fn(),claim:vi.fn(),current:vi.fn(),save:vi.fn(),recover:vi.fn(),fail:vi.fn(),settle:vi.fn(),premium:vi.fn(),draft:vi.fn(),refine:vi.fn(),refineHd:vi.fn(),enabled:vi.fn()}));
vi.mock('@/lib/async-job-worker-auth',()=>({getAsyncJobWorkerUserId:()=> 'user',getReportWorkerJobFromRequest:()=>({jobId:'job',attempt:{workerId:'worker',attemptCount:1}})}));
vi.mock('@/lib/async-job-lifecycle',()=>({makeWorkerProgressReporter:()=>vi.fn()}));
vi.mock('@/modules/pro/gate',()=>({requireProEnabled:()=>null}));
vi.mock('@/modules/pro/config',()=>({isProAiEnabled:m.enabled}));
vi.mock('@/modules/pro/db/hd-generation',()=>({bindProHdCharge:m.bind,claimProHdGeneration:m.claim,assertProHdGenerationCurrent:m.current,saveProHdGeneration:m.save,recoverProHdGeneration:m.recover,failProHdCase:m.fail}));
vi.mock('@/lib/async-jobs',()=>({failAsyncJobAndRefundIfCharged:m.settle}));
vi.mock('@/modules/pro/ai/generate-premium',()=>({generateProPremiumReport:m.premium}));
vi.mock('@/modules/pro/ai/draft',()=>({generateCaseDraft:m.draft}));
vi.mock('@/modules/pro/ai/refine-block',()=>({refineProReportBlock:m.refine}));
vi.mock('@/modules/pro/ai/hd-refine',()=>({refineProHdReport:m.refineHd}));
import {POST} from '@/app/(pro)/api/pro/jobs/premium-report/route';
const blocks=[{id:'a',title:'Title',body:'Complete report.'}];
const base={accountId:'a',caseId:'c',caseType:'matrix',chargeTransactionId:'receipt',chargeRunes:15,frozenPayload:{birthDate:'1990-01-01',premiumJobId:'job'},frozenQuestion:'Frozen question',frozenClientId:'client',frozenAlias:'Frozen alias',frozenPractitionerContext:'Frozen context'};
async function run(body:Record<string,unknown>){return POST(new NextRequest('http://127.0.0.1/api/pro/jobs/premium-report',{method:'POST',body:JSON.stringify(body)}));}
beforeEach(()=>{vi.clearAllMocks();m.enabled.mockReturnValue(true);m.claim.mockResolvedValue('claim');m.current.mockResolvedValue(undefined);m.recover.mockResolvedValue(null);m.bind.mockResolvedValue(undefined);m.save.mockResolvedValue({caseId:'c',versionId:'1'});m.settle.mockResolvedValue({failed:true});m.premium.mockImplementation(async opts=>{await opts.beforeRequest();return {blocks,snapshot:{caseType:opts.type},uncertaintyMarks:[]}});m.draft.mockImplementation(async opts=>{await opts.beforeRequest();return {blocks,uncertaintyMarks:[],stub:false,outcome:'ok'}});m.refine.mockImplementation(async opts=>{await opts.beforeRequest();return {...blocks[0],body:'Refined'}});m.refineHd.mockImplementation(async opts=>{await opts.beforeRequest();return {blocks,snapshot:opts.snapshot,uncertaintyMarks:[]}});});
describe('Pro worker immutable source and settlement',()=>{
  it.each(['hd','natal','matrix','manual_spread'])('generates %s only from frozen input and binds guard before provider/save',async caseType=>{
    expect((await run({...base,caseType})).status).toBe(200);
    const opts=(caseType==='manual_spread'?m.draft:m.premium).mock.calls[0]![0];
    expect(opts).toMatchObject({payload:base.frozenPayload,question:base.frozenQuestion,clientAlias:base.frozenAlias,beforeRequest:expect.any(Function),deadlineAt:expect.any(Number)});
    expect(m.current).toHaveBeenCalledTimes(2);expect(m.save.mock.calls[0]![0]).toMatchObject({caseType,claimToken:'claim',practitionerContext:base.frozenPractitionerContext});
    expect(m.settle).not.toHaveBeenCalled();
  });
  it.each(['natal','matrix','manual_spread'])('refines %s as a guarded new version',async caseType=>{
    const refinement={versionId:'prior',blockIndex:0,instruction:'Clarify',blocks,snapshot:null};
    expect((await run({...base,caseType,refinement,chargeRunes:5})).status).toBe(200);
    expect(m.refine).toHaveBeenCalledOnce();expect(m.save.mock.calls[0]![0].expectedVersionId).toBe('prior');expect(m.save.mock.calls[0]![1].blocks[0].body).toBe('Refined');
  });
  it('recovers a prior committed receipt before reading retired source or contacting provider',async()=>{
    m.recover.mockResolvedValue({caseId:'c',versionId:'1'});
    expect((await run({accountId:'a',caseId:'c',caseType:'natal'})).status).toBe(200);
    expect(m.bind).not.toHaveBeenCalled();expect(m.premium).not.toHaveBeenCalled();expect(m.settle).not.toHaveBeenCalled();
  });
  it('legacy mutable job without frozen input fails and settles before provider',async()=>{
    expect((await run({accountId:'a',caseId:'c',caseType:'natal'})).status).toBe(409);
    expect(m.premium).not.toHaveBeenCalled();expect(m.settle).toHaveBeenCalledOnce();expect(m.fail).toHaveBeenCalledWith('a','c','job');
  });
  it('source cancellation prevents provider and save, and settles only the current attempt',async()=>{
    m.current.mockRejectedValue(Object.assign(new Error('source_changed'),{status:409}));
    expect((await run(base)).status).toBe(409);expect(m.premium).not.toHaveBeenCalled();expect(m.save).not.toHaveBeenCalled();expect(m.settle).toHaveBeenCalledWith('job','source_changed','generation_failed',{workerId:'worker',attemptCount:1});
  });
  it('manual provider fallback is never delivered as a paid report',async()=>{
    m.draft.mockResolvedValue({blocks,uncertaintyMarks:[],stub:true,outcome:'failed'});
    expect((await run({...base,caseType:'manual_spread'})).status).toBe(502);expect(m.save).not.toHaveBeenCalled();expect(m.settle).toHaveBeenCalledOnce();
  });
  it('busy replay cannot fail or refund the owner currently producing the report',async()=>{
    m.claim.mockRejectedValue(Object.assign(new Error('CLAIM_BUSY'),{status:409}));
    expect((await run(base)).status).toBe(409);expect(m.settle).not.toHaveBeenCalled();expect(m.premium).not.toHaveBeenCalled();
  });
  it('does not clobber newer case status when settlement rejected a stale worker',async()=>{
    m.current.mockRejectedValue(new Error('stale'));m.settle.mockResolvedValue({failed:false});
    await run(base);expect(m.fail).not.toHaveBeenCalled();
  });
});
