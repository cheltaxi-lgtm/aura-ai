import fs from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

/** Called only after deploy has stopped every writer and accepted durable rollback. */
export async function restoreMatrixRollback(client, downSql) {
  await client.query('BEGIN');
  try {
    const state=await client.query("SELECT to_regclass('public.numerology_report_identity_unique') AS present");
    if(state.rows[0]?.present) {
      await client.query('LOCK TABLE numerology_report_history IN ACCESS EXCLUSIVE MODE');
      await client.query(downSql);
      await client.query("DELETE FROM schema_migrations WHERE version='153_matrix_report_identity.sql'");
    }
    await client.query('COMMIT');
  } catch(error) { await client.query('ROLLBACK'); throw error; }
}

async function main(appDir, previousDir) {
  if(!path.isAbsolute(appDir)||!path.isAbsolute(previousDir)) throw Error('absolute_paths_required');
  if(fs.existsSync(path.join(previousDir,'scripts/migrations/153_matrix_report_identity.sql'))) return;
  const env=parseEnv(fs.readFileSync(path.join(appDir,'.env.local'),'utf8'));
  let pg;
  try { pg=createRequire(path.join(appDir,'package.json'))('pg'); }
  catch { pg=createRequire(path.join(previousDir,'package.json'))('pg'); }
  const client=new pg.Client({connectionString:env.DATABASE_URL,connectionTimeoutMillis:5000,statement_timeout:10000});
  try { await client.connect(); await restoreMatrixRollback(client,fs.readFileSync(path.join(appDir,'scripts/migrations/153_matrix_report_identity.down.sql'),'utf8')); }
  finally { await client.end(); }
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try { await main(process.argv[2]||'',process.argv[3]||''); console.log('matrix_schema_rollback_compatible'); }
  catch { console.error('matrix_schema_requires_forward_recovery'); process.exitCode=2; }
}
