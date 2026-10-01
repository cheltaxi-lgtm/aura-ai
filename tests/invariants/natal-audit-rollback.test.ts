import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { freezeNatalLegacyHistory } from "../../hosting/freeze-natal-legacy-history.mjs";
import { randomUUID, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { hasTestDb, assertSafeTestDatabaseUrl } from './db/setup';
import { restoreNatalRollback } from '../../hosting/restore-natal-rollback.mjs';

// Run the real migrator in an owned disposable DB; never change the browser fixture DB.
describe.runIf(hasTestDb)('Natal rollback preserves paid receipts', () => {
  let admin: Client, client: Client, url: string;
  const database = 'aura_test_natal_rollback_' + randomUUID().replaceAll('-', '');
  const migrate = () => execFileSync(process.execPath, ['scripts/migrate.mjs'], { env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe', timeout: 120000 });
  beforeAll(async () => {
    const base = process.env.TEST_DATABASE_URL!;
    assertSafeTestDatabaseUrl(base);
    admin = new Client({ connectionString: base });
    await admin.connect();
    await admin.query('CREATE DATABASE ' + database);
    const parsed = new URL(base); parsed.pathname = '/' + database; url = parsed.toString();
    migrate();
    client = new Client({ connectionString: url }); await client.connect();
  }, 180000);
  beforeEach(async () => { migrate(); await client.query('TRUNCATE users CASCADE'); });
  afterAll(async () => {
    await client?.end();
    if (admin) { if (!/^aura_test_natal_rollback_[a-f0-9]{32}$/.test(database)) throw Error('unsafe fixture'); await admin.query('DROP DATABASE IF EXISTS ' + database); await admin.end(); }
  });
  it('restores the previous schema when each purchase has one immutable version', async () => {
    await restoreNatalRollback(client);
    expect((await client.query("SELECT version FROM schema_migrations WHERE version IN ('164_natal_report_revisions.sql','165_natal_compatibility_participant_identity.sql','166_natal_participant_receipt_identity.sql')")).rows).toHaveLength(0);
    expect((await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND column_name IN ('generation_revision','participant_identity_id')")).rows).toHaveLength(0);
    expect((await client.query("SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname='natal_report_history_version_unique'")).rows[0].def).not.toContain('generation_revision');
  });
  it('refuses downconversion and preserves both paid revisions and all DDL', async () => {
    const owner = (await client.query("INSERT INTO users(name,gender,zodiac) VALUES('Rollback fixture','female','test') RETURNING id")).rows[0].id;
    for (let i = 0; i < 2; i++) await client.query("INSERT INTO natal_report_history(user_id,birth_fingerprint,engine_version,ephemeris,tradition,content,generation_revision) VALUES($1,'fixture','fixture','fixture','western','Paid immutable fixture',$2)", [owner, randomUUID()]);
    await expect(restoreNatalRollback(client)).rejects.toThrow('paid_natal_revisions_require_forward_recovery');
    expect((await client.query('SELECT id FROM natal_report_history')).rows).toHaveLength(2);
    expect((await client.query("SELECT version FROM schema_migrations WHERE version LIKE '16%' AND version >= '164' AND version < '167'")).rows).toHaveLength(3);
  });
  it('refuses participant deduplication that would discard a different person', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) ids.push((await client.query("INSERT INTO users(name,gender,zodiac) VALUES('Rollback fixture','female','test') RETURNING id")).rows[0].id);
    for (const participant of ids.slice(1)) await client.query("INSERT INTO natal_compatibility_reports(owner_user_id,participant_user_id,mode,status,owner_label,partner_label,owner_fingerprint,partner_fingerprint,pair_fingerprint,synastry_snapshot,invite_token_hash,expires_at) VALUES($1,$2,'invite','ready','Owner','Participant',$3,$3,$3,'{}'::jsonb,$4,NOW()+interval '30 days')", [ids[0], participant, 'a'.repeat(64), randomBytes(32)]);
    await expect(restoreNatalRollback(client)).rejects.toThrow('participant_reports_require_forward_recovery');
    expect((await client.query('SELECT participant_identity_id FROM natal_compatibility_reports')).rows).toHaveLength(2);
  });
  it('preserves a removed participant receipt instead of reopening an old invite token', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 2; i++) ids.push((await client.query("INSERT INTO users(name,gender,zodiac) VALUES('Rollback fixture','female','test') RETURNING id")).rows[0].id);
    await client.query("INSERT INTO natal_compatibility_reports(owner_user_id,participant_user_id,mode,status,owner_label,partner_label,owner_fingerprint,partner_fingerprint,pair_fingerprint,synastry_snapshot,invite_token_hash,expires_at) VALUES($1,$2,'manual','ready','Owner','Participant',$3,$3,$3,'{}'::jsonb,NULL,NOW()+interval '30 days')", [ids[0], ids[1], 'b'.repeat(64)]);
    await client.query('DELETE FROM users WHERE id=$1', [ids[1]]);
    await expect(restoreNatalRollback(client)).rejects.toThrow('retained_participant_requires_forward_recovery');
    expect((await client.query('SELECT participant_identity_id,participant_user_id FROM natal_compatibility_reports')).rows[0]).toEqual({ participant_identity_id: ids[1], participant_user_id: null });
    expect((await client.query("SELECT version FROM schema_migrations WHERE version LIKE '16%' AND version >= '164' AND version < '167'")).rows).toHaveLength(3);
  });

  it('freezes only matching numerics without changing content, evidence or payment fields', async () => {
    const owner = (await client.query("INSERT INTO users(name,gender,zodiac) VALUES('Freeze fixture','female','test') RETURNING id")).rows[0].id;
    const evidence = [{ id: 'fixture-position', type: 'position', tradition: 'western', category: 'identity', label: 'Солнце', value: 'Лев · 12°', confidence: 'high', sourcePath: 'western.sun', uncertainty: null, deepLink: '' }, { id: 'old-dynamic', type: 'transit', tradition: 'timing', value: 'Original historical date' }];
    const chart = { userId: owner, birthFingerprint: 'freeze-fixture', engineVersion: 'old-engine', western: { ephemeris: 'old-source', sun: { longitude: 132 } }, interpretations: { western: 'Cached private prose' }, transits: ['Current mutable context'] };
    await client.query('INSERT INTO natal_charts(user_id,engine_version,chart_data) VALUES($1,$2,$3)', [owner, chart.engineVersion, chart]);
    const report = (await client.query("INSERT INTO natal_report_history(user_id,birth_fingerprint,engine_version,ephemeris,tradition,content,evidence_refs,rune_cost) VALUES($1,$2,$3,$4,'western','Original paid content',$5,30) RETURNING to_jsonb(natal_report_history) AS report", [owner, chart.birthFingerprint, chart.engineVersion, chart.western.ephemeris, JSON.stringify(evidence)])).rows[0].report;
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'natal-freeze-fixture-'));
    try {
      await expect(freezeNatalLegacyHistory(client, () => [{ ...evidence[0], value: 'Wrong' }], directory)).rejects.toThrow('static_evidence_mismatch');
      expect((await client.query('SELECT chart_snapshot FROM natal_report_history WHERE id=$1',[report.id])).rows[0].chart_snapshot).toBeNull();
      expect(await freezeNatalLegacyHistory(client, () => [evidence[0]], directory)).toMatchObject({ frozen: 1, staticFactors: 1, timingOriginalFactors: 1, reportAndReceiptFieldsUnchanged: 1 });
      const after = (await client.query('SELECT to_jsonb(h) AS report FROM natal_report_history h WHERE id=$1',[report.id])).rows[0].report;
      const { chart_snapshot: snapshot, ...fields } = after;
      expect(fields).toEqual(Object.fromEntries(Object.entries(report).filter(([key]) => key !== 'chart_snapshot')));
      expect(snapshot).toMatchObject({ engineVersion: 'old-engine', western: chart.western }); expect(snapshot.interpretations).toBeUndefined(); expect(snapshot.transits).toBeUndefined();
    } finally {
      const absolute = path.resolve(directory), base = path.resolve(os.tmpdir());
      if (!absolute.startsWith(base + path.sep + 'natal-freeze-fixture-')) throw Error('unsafe fixture directory');
      fs.rmSync(absolute, { recursive: true, force: true });
    }
  });

});
