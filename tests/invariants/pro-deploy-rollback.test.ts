import {randomUUID} from 'node:crypto';
import {Client} from 'pg';
import {afterAll,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {readProGenerationRollbackCounts,assertProGenerationRollbackCompatible,supportsProGenerationRollback} from '../../hosting/pro-generation-rollback.mjs';
import {assertHdRollbackCompatible,previousHdCompatibility} from '../../hosting/restore-hd-rollback.mjs';
import {assertSafeTestDatabaseUrl,hasTestDb} from './db/setup';

describe.runIf(hasTestDb)('Pro rollback reads durable protocol state from both databases',()=>{
  let admin:Client,main:Client,pro:Client;
  const suffix=randomUUID().replaceAll('-',''),names=['aura_test_pro_rollback_main_'+suffix,'aura_test_pro_rollback_pro_'+suffix];
  beforeAll(async()=>{
    const base=process.env.TEST_DATABASE_URL!;assertSafeTestDatabaseUrl(base);admin=new Client({connectionString:base});await admin.connect();
    for(const name of names)await admin.query('CREATE DATABASE '+name);
    const mainUrl=new URL(base);mainUrl.pathname='/'+names[0];const proUrl=new URL(base);proUrl.pathname='/'+names[1];
    main=new Client({connectionString:mainUrl.toString()});pro=new Client({connectionString:proUrl.toString()});await main.connect();await pro.connect();
    await main.query('CREATE TABLE async_jobs(kind text,status text,input jsonb,period_metadata jsonb)');
    await pro.query('CREATE SCHEMA pro; CREATE TABLE pro.hd_delivery_receipts(job_id text,case_id bigint,case_type text)');
  });
  beforeEach(async()=>{await main.query('TRUNCATE async_jobs');await pro.query('TRUNCATE pro.hd_delivery_receipts');});
  afterAll(async()=>{await main?.end();await pro?.end();if(admin){for(const name of names){if(!/^aura_test_pro_rollback_(main|pro)_[a-f0-9]{32}$/.test(name))throw new Error('unsafe_fixture');await admin.query('DROP DATABASE IF EXISTS '+name);}await admin.end();}});
  it('allows positively empty legacy state without changing schema',async()=>{
    expect(await assertProGenerationRollbackCompatible(main,pro,false)).toEqual({activeProGenerations:0,frozenProSources:0,nonHdProReceipts:0});
  });
  it.each(['pending','running'])('blocks %s immutable jobs identified by metadata even before frozen payload is populated',async status=>{
    await main.query("INSERT INTO async_jobs VALUES('pro_premium_report',$1,'{}','{\"pro_source_identity\":\"hash\"}')",[status]);
    await expect(assertProGenerationRollbackCompatible(main,pro,false)).rejects.toThrow('pro_generation_requires_forward_recovery');
    expect((await main.query('SELECT COUNT(*)::int AS n FROM async_jobs')).rows[0].n).toBe(1);
  });
  it.each(['pending','running','failed','needs_regeneration','completed'])('blocks %s private frozen copies even after the active job is retired',async status=>{
    await main.query("INSERT INTO async_jobs VALUES('pro_premium_report',$1,$2::jsonb,'{}')",[status,JSON.stringify({caseType:'matrix',frozenPayload:{birthDate:'1990-01-01'},refinement:{instruction:'Private'}})]);
    const counts=await readProGenerationRollbackCounts(main,pro);expect(counts.frozenProSources).toBe(1);
    await expect(assertProGenerationRollbackCompatible(main,pro,false)).rejects.toThrow('pro_generation_requires_forward_recovery');
  });
  it.each(['natal','matrix','manual_spread'])('blocks orphaned %s receipt in separate Pro DB after main job and case are deleted',async type=>{
    await pro.query("INSERT INTO pro.hd_delivery_receipts VALUES('orphan',NULL,$1)",[type]);
    expect((await readProGenerationRollbackCounts(main,pro)).nonHdProReceipts).toBe(1);
    await expect(assertProGenerationRollbackCompatible(main,pro,false)).rejects.toThrow('pro_generation_requires_forward_recovery');
    expect((await pro.query('SELECT COUNT(*)::int AS n FROM pro.hd_delivery_receipts')).rows[0].n).toBe(1);
  });
  it('permits verified identical protocol readers while retaining all evidence',async()=>{
    await main.query("INSERT INTO async_jobs VALUES('pro_premium_report','running','{\"frozenPayload\":{}}','{}')");
    await pro.query("INSERT INTO pro.hd_delivery_receipts VALUES('receipt',NULL,'matrix')");
    expect(supportsProGenerationRollback(process.cwd(),process.cwd())).toBe(true);
    expect(await assertProGenerationRollbackCompatible(main,pro,true)).toEqual({activeProGenerations:1,frozenProSources:1,nonHdProReceipts:1});
  });
  it('the pre-service-start rollback gate also blocks incompatible Pro state',async()=>{
    await pro.query("INSERT INTO pro.hd_delivery_receipts VALUES('receipt',NULL,'manual_spread')");
    await expect(assertHdRollbackCompatible(main,pro,{receipts:true,engine:true,proReceipts:true,proGeneration:false})).rejects.toThrow('pro_generation_requires_forward_recovery');
    await assertHdRollbackCompatible(main,pro,previousHdCompatibility(process.cwd()));
  });
  it('fails closed when separate Pro schema cannot be counted',async()=>{
    await pro.query('ALTER TABLE pro.hd_delivery_receipts RENAME TO missing_receipts');
    await pro.query('CREATE VIEW pro.hd_delivery_receipts AS SELECT (1/0)::text AS case_type');
    try {await expect(assertProGenerationRollbackCompatible(main,pro,false)).rejects.toThrow();}
    finally {await pro.query('DROP VIEW pro.hd_delivery_receipts');await pro.query('ALTER TABLE pro.missing_receipts RENAME TO hd_delivery_receipts');}
  });
});
