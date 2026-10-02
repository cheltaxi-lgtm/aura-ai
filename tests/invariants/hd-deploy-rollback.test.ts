import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { assertHdRollbackCompatible, previousHdCompatibility } from '../../hosting/restore-hd-rollback.mjs';
import { assertSafeTestDatabaseUrl, hasTestDb } from './db/setup';

describe.runIf(hasTestDb)('HD deployment preserves durable identities across rollback', () => {
  let admin: Client, main: Client, pro: Client;
  const database = 'aura_test_hd_rollback_' + randomUUID().replaceAll('-', '');
  beforeAll(async () => {
    const base = process.env.TEST_DATABASE_URL!; assertSafeTestDatabaseUrl(base);
    admin = new Client({ connectionString: base }); await admin.connect();
    await admin.query('CREATE DATABASE ' + database);
    const url = new URL(base); url.pathname = '/' + database;
    main = new Client({ connectionString: url.toString() }); pro = new Client({ connectionString: url.toString() });
    await main.connect(); await pro.connect();
    await main.query(`CREATE TABLE hd_reports(generation_context jsonb,semantic_identity text);
      CREATE TABLE hd_composite_reports(LIKE hd_reports); CREATE TABLE hd_charts(engine_version text);
      CREATE TABLE async_jobs(kind text,status text,input jsonb); CREATE SCHEMA pro;
      CREATE TABLE pro.hd_delivery_receipts(job_id text)`);
  });
  beforeEach(async () => { await main.query('TRUNCATE hd_reports,hd_composite_reports,hd_charts,async_jobs,pro.hd_delivery_receipts'); });
  afterAll(async () => {
    await main?.end(); await pro?.end();
    if (admin) { if (!/^aura_test_hd_rollback_[a-f0-9]{32}$/.test(database)) throw Error('unsafe_fixture'); await admin.query('DROP DATABASE IF EXISTS ' + database); await admin.end(); }
  });
  it('keeps additive schema with an empty compatible legacy state', async () => {
    await assertHdRollbackCompatible(main, pro);
    expect((await main.query("SELECT column_name FROM information_schema.columns WHERE table_name='hd_reports'")).rows).toHaveLength(2);
  });
  it.each(['hd_reports','hd_composite_reports'])('preserves frozen %s even after its job disappears', async table => {
    await main.query(`INSERT INTO ${table} VALUES ('{}','immutable-purchase')`);
    await expect(assertHdRollbackCompatible(main, pro)).rejects.toThrow('hd_frozen_purchase_requires_forward_recovery');
    expect((await main.query(`SELECT * FROM ${table}`)).rows).toHaveLength(1);
  });
  it('rejects an accepted job before it obtains a receipt', async () => {
    await main.query("INSERT INTO async_jobs VALUES('hd_report','pending','{}')");
    await expect(assertHdRollbackCompatible(main, pro)).rejects.toThrow('hd_accepted_job_requires_forward_recovery');
  });
  it('preserves v2 chart identity without a paid report', async () => {
    await main.query("INSERT INTO hd_charts VALUES('hd-v2-astronomy-engine-osculating-node-exact-arc88')");
    await expect(assertHdRollbackCompatible(main, pro)).rejects.toThrow('hd_engine_identity_requires_forward_recovery');
  });
  it('retains a Pro delivery proof whose case was already deleted', async () => {
    await pro.query("INSERT INTO pro.hd_delivery_receipts VALUES('deleted-source-job')");
    await expect(assertHdRollbackCompatible(main, pro)).rejects.toThrow('pro_hd_delivery_requires_forward_recovery');
    expect((await pro.query('SELECT * FROM pro.hd_delivery_receipts')).rows).toHaveLength(1);
  });
  it('allows a release that implements all recovery readers', async () => {
    await main.query("INSERT INTO hd_reports VALUES('{}','purchase'); INSERT INTO hd_charts VALUES('hd-v2-fixture'); INSERT INTO async_jobs VALUES('pro_premium_report','running',jsonb_build_object('caseType','hd'))");
    await pro.query("INSERT INTO pro.hd_delivery_receipts VALUES('receipt')");
    const compatibility = previousHdCompatibility(process.cwd());
    expect(compatibility).toEqual({ receipts:true, engine:true, proReceipts:true });
    await assertHdRollbackCompatible(main, pro, compatibility);
  });
});
