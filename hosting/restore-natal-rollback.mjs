import fs from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

/** Writers must be stopped. Never remove a paid revision to restore old code. */
export async function restoreNatalRollback(client) {
  await client.query('BEGIN');
  try {
    const column = await client.query("SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='natal_report_history' AND column_name='generation_revision') AS present");
    const participantIndex = await client.query("SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version='165_natal_compatibility_participant_identity.sql') AS present");
    if (participantIndex.rows[0]?.present) {
      await client.query('LOCK TABLE natal_compatibility_reports IN ACCESS EXCLUSIVE MODE');
      const duplicate = await client.query("SELECT 1 FROM natal_compatibility_reports WHERE pair_fingerprint IS NOT NULL AND status<>'expired' GROUP BY owner_user_id,pair_fingerprint HAVING count(*)>1 LIMIT 1");
      if (duplicate.rows.length) throw Error('participant_reports_require_forward_recovery');
      await client.query('DROP INDEX idx_natal_compatibility_owner_pair');
      await client.query("CREATE UNIQUE INDEX idx_natal_compatibility_owner_pair ON natal_compatibility_reports(owner_user_id,pair_fingerprint) WHERE pair_fingerprint IS NOT NULL AND status<>'expired'");
      await client.query("DELETE FROM schema_migrations WHERE version='165_natal_compatibility_participant_identity.sql'");
    }
    const retainedIdentity = await client.query("SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version='166_natal_participant_receipt_identity.sql') AS present");
    if (retainedIdentity.rows[0]?.present) {
      const orphan = await client.query("SELECT 1 FROM natal_compatibility_reports WHERE participant_user_id IS NULL AND participant_identity_id IS NOT NULL LIMIT 1");
      if (orphan.rows.length) throw Error('retained_participant_requires_forward_recovery');
      await client.query('DROP TRIGGER IF EXISTS retain_natal_participant_identity ON natal_compatibility_reports');
      await client.query('DROP FUNCTION IF EXISTS retain_natal_participant_identity()');
      await client.query('ALTER TABLE natal_compatibility_reports DROP COLUMN IF EXISTS participant_identity_id');
      await client.query("DELETE FROM schema_migrations WHERE version='166_natal_participant_receipt_identity.sql'");
    }
    if (column.rows[0]?.present) {
      await client.query('LOCK TABLE natal_report_history IN ACCESS EXCLUSIVE MODE');
      const duplicate = await client.query(`SELECT 1 FROM natal_report_history GROUP BY user_id,birth_fingerprint,engine_version,ephemeris,tradition,report_type HAVING count(*)>1 LIMIT 1`);
      if (duplicate.rows.length) throw Error('paid_natal_revisions_require_forward_recovery');
      await client.query('ALTER TABLE natal_report_history DROP CONSTRAINT natal_report_history_version_unique');
      await client.query('ALTER TABLE natal_report_history ADD CONSTRAINT natal_report_history_version_unique UNIQUE(user_id,birth_fingerprint,engine_version,ephemeris,tradition,report_type)');
      await client.query('ALTER TABLE natal_report_history DROP COLUMN generation_revision');
      await client.query("DELETE FROM schema_migrations WHERE version='164_natal_report_revisions.sql'");
    }
    await client.query('COMMIT');
  } catch(error) { await client.query('ROLLBACK'); throw error; }
}

async function main(appDir, previousDir) {
  if (!path.isAbsolute(appDir) || !path.isAbsolute(previousDir)) throw Error('absolute_paths_required');
  const previous = path.join(previousDir,'src/lib/services/natal-chart-service.ts');
  if (fs.existsSync(previous) && /generation_revision/.test(fs.readFileSync(previous,'utf8'))) return;
  const env = parseEnv(fs.readFileSync(path.join(appDir,'.env.local'),'utf8'));
  let pg;
  try { pg = createRequire(path.join(appDir,'package.json'))('pg'); }
  catch { pg = createRequire(path.join(previousDir,'package.json'))('pg'); }
  const client = new pg.Client({connectionString:env.DATABASE_URL,connectionTimeoutMillis:5000,statement_timeout:10000});
  try { await client.connect(); await restoreNatalRollback(client); }
  finally { await client.end(); }
}
if(process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await main(process.argv[2]||'',process.argv[3]||''); console.log('natal_schema_rollback_compatible'); }
  catch { console.error('natal_schema_requires_forward_recovery'); process.exitCode=2; }
}
