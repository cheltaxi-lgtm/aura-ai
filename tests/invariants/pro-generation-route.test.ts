import {beforeEach,describe,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({auth:vi.fn(),get:vi.fn(),input:vi.fn(),client:vi.fn(),versions:vi.fn(),setInput:vi.fn(),enqueue:vi.fn(),ai:vi.fn(),worker:vi.fn(),facts:vi.fn()}));
vi.mock('@/modules/pro/auth',()=>({requireProPractitioner:m.auth}));
vi.mock('@/modules/pro/db/cases',()=>({getCase:m.get,getCaseInput:m.input,listVersions:m.versions,setCaseInput:m.setInput,addVersion:vi.fn(),hardDeleteCase:vi.fn(),inferRestoreStatus:vi.fn(),updateCaseStatus:vi.fn()}));
vi.mock('@/modules/pro/db/clients',()=>({getClient:m.client,updateClient:vi.fn()}));
vi.mock('@/modules/pro/db/accounts',()=>({writeAudit:vi.fn()}));
vi.mock('@/modules/pro/db/deliveries',()=>({createDelivery:vi.fn(),remintDelivery:vi.fn(),revokeAllDeliveriesForCase:vi.fn(),revokeDelivery:vi.fn()}));
vi.mock('@/modules/pro/adapters',()=>({natalAdapter:{enrichPlace:async(x:unknown)=>x,summarizeInput:(x:unknown)=>x,computeFacts:m.facts},hdAdapter:{enrichPlace:async(x:unknown)=>x,summarizeInput:(x:unknown)=>x,computeFacts:m.facts},matrixAdapter:{computeFacts:m.facts}}));
vi.mock('@/modules/pro/db',()=>({proQuery:vi.fn()}));
vi.mock('@/modules/pro/db/billing',()=>({InsufficientFundsError:class extends Error{},ProTrialExceededError:class extends Error{}}));
vi.mock('@/lib/services/billing-service',()=>({insufficientFundsResponse:vi.fn()}));
vi.mock('@/modules/pro/config',()=>({isProAiEnabled:m.ai}));
vi.mock('@/lib/async-job-worker-auth',()=>({isAsyncJobWorkerConfigured:m.worker}));
vi.mock('@/lib/async-job-enqueue',()=>({acceptedReportExtras:()=>({kind:'pro_premium_report'})}));
vi.mock('@/modules/pro/db/hd-generation',()=>({enqueueProHdGeneration:m.enqueue}));
import {PATCH} from '@/app/(pro)/api/pro/cases/[id]/route';
async function run(body:unknown){return PATCH(new Request('http://127.0.0.1/api/pro/cases/12',{method:'PATCH',body:JSON.stringify(body)}),{params:Promise.resolve({id:'12'})});}
beforeEach(()=>{vi.clearAllMocks();m.setInput.mockReset();m.auth.mockResolvedValue({ok:true,ctx:{account:{id:'2'},profileUserId:'owner'}});m.get.mockResolvedValue({id:'12',client_id:'3',type:'manual_spread',status:'input_ready'});m.input.mockResolvedValue({payload:{birthDate:'1990-01-01',cards:['Маг']}});m.client.mockResolvedValue({id:'3',alias:'Client'});m.versions.mockResolvedValue([{id:'1',source:'ai',blocks:[{id:'a',body:'Complete'}]}]);m.ai.mockReturnValue(true);m.worker.mockReturnValue(true);m.facts.mockReturnValue({ok:true,matrix:{},evidenceText:'facts'});m.enqueue.mockResolvedValue({jobId:'job',charge:{runes:15},deduped:false});});
describe('Pro generation request reservation',()=>{
  it.each(['hd','natal','matrix','manual_spread'])('reserves %s without mutating source before charge and queue commit',async type=>{
    m.get.mockResolvedValue({id:'12',client_id:'3',type,status:'input_ready'});
    const response=await run({action:'generate',idempotencyKey:'transport-key'});expect(response.status).toBe(202);expect(await response.json()).toMatchObject({async:true,jobId:'job',pollUrl:'/api/jobs/job'});
    expect(m.enqueue.mock.calls[0]![0]).toMatchObject({userId:'owner',accountId:'2',caseId:'12',expectedPayload:{birthDate:'1990-01-01',cards:['Маг']},idempotencyKey:'transport-key'});expect(m.setInput).not.toHaveBeenCalled();
  });
  it.each(['ai','worker'])('does not charge when %s is unavailable',async flag=>{
    m[flag as 'ai'|'worker'].mockReturnValue(false);expect((await run({action:'generate'})).status).toBe(503);expect(m.enqueue).not.toHaveBeenCalled();
  });
  it('returns a resource-bound key conflict without fallback generation',async()=>{
    m.enqueue.mockRejectedValue(Object.assign(new Error('pro_idempotency_conflict'),{status:409}));expect((await run({action:'generate',idempotencyKey:'same'})).status).toBe(409);expect(m.setInput).not.toHaveBeenCalled();
  });
  it('returns 409 when editing a running report, including a generation starting after the initial read',async()=>{
    m.get.mockResolvedValueOnce({id:'12',client_id:'3',type:'manual_spread',status:'generating'});
    expect((await run({action:'input',payload:{cards:['Шут']}})).status).toBe(409);expect(m.setInput).not.toHaveBeenCalled();
    m.setInput.mockRejectedValueOnce(Object.assign(new Error('generation_in_progress'),{status:409}));
    const response=await run({action:'input',payload:{cards:['Шут']}});expect(response.status).toBe(409);expect(await response.json()).toMatchObject({error:'generation_in_progress'});
  });
  it('rejects empty saved manual cards before charging',async()=>{
    m.input.mockResolvedValue({payload:{cards:[]}});expect((await run({action:'generate'})).status).toBe(400);expect(m.enqueue).not.toHaveBeenCalled();
  });
  it('queues refinement with exact last version, section, and instruction',async()=>{
    expect((await run({action:'refine_block',blockIndex:0,instruction:' Clarify ',idempotencyKey:'refine'})).status).toBe(202);
    expect(m.enqueue.mock.calls[0]![0]).toMatchObject({refinement:{versionId:'1',blockIndex:0,instruction:'Clarify'},idempotencyKey:'refine'});
  });
  it('preserves the explicitly requested version on a completed refinement replay',async()=>{
    m.versions.mockResolvedValue([{id:'1',blocks:[{id:'a',body:'Original'}]},{id:'2',blocks:[{id:'a',body:'New version'}]}]);
    expect((await run({action:'refine_block',versionId:'1',blockIndex:0,instruction:'Clarify',idempotencyKey:'replay'})).status).toBe(202);
    expect(m.enqueue.mock.calls[0]![0].refinement.versionId).toBe('1');
  });
  it('rejects archived and missing sections before reservation',async()=>{
    expect((await run({action:'refine_block',blockIndex:4,instruction:'Clarify'})).status).toBe(404);expect(m.enqueue).not.toHaveBeenCalled();
    m.get.mockResolvedValue({type:'matrix',status:'archived'});expect((await run({action:'generate'})).status).toBe(409);expect(m.enqueue).not.toHaveBeenCalled();
  });
});
