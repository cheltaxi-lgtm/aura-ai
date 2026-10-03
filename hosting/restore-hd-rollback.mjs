import fs from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import {assertProGenerationRollbackCompatible,supportsProGenerationRollback} from './pro-generation-rollback.mjs';

// All writers must be stopped. Additive columns remain; never discard frozen
// purchases or downgrade the calculator underneath an accepted report.
export async function assertHdRollbackCompatible(main, pro, compatible = {}) {
  await main.query('BEGIN READ ONLY');
  try {
    await assertProGenerationRollbackCompatible(main,pro,compatible.proGeneration===true);
    if (!compatible.receipts) {
      for (const table of ['hd_reports', 'hd_composite_reports']) {
        const columns = await main.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name IN ('generation_context','semantic_identity')", [table]);
        if (columns.rows.length === 2) {
          const result = await main.query(`SELECT 1 FROM public.${table} WHERE generation_context IS NOT NULL OR semantic_identity IS NOT NULL LIMIT 1`);
          if (result.rows.length) throw Error('hd_frozen_purchase_requires_forward_recovery');
        } else if (columns.rows.length) throw Error('hd_schema_state_unverified');
      }
      const jobs = await main.query("SELECT 1 FROM public.async_jobs WHERE (kind IN ('hd_report','hd_composite_report') OR kind='pro_premium_report' AND input->>'caseType'='hd') AND status IN ('pending','running') LIMIT 1");
      if (jobs.rows.length) throw Error('hd_accepted_job_requires_forward_recovery');
    }
    if (!compatible.engine) {
      const charts = await main.query("SELECT 1 FROM public.hd_charts WHERE engine_version LIKE 'hd-v2-%' LIMIT 1");
      if (charts.rows.length) throw Error('hd_engine_identity_requires_forward_recovery');
    }
    // Pro may use its own database. A deleted case can still have a delivered
    // receipt; checking cases alone would erase the recovery proof.
    if (!compatible.proReceipts) {
      const table = await pro.query("SELECT to_regclass('pro.hd_delivery_receipts') IS NOT NULL AS present");
      if (table.rows[0]?.present) {
        const receipts = await pro.query('SELECT 1 FROM pro.hd_delivery_receipts LIMIT 1');
        if (receipts.rows.length) throw Error('pro_hd_delivery_requires_forward_recovery');
      }
      const jobs = await main.query("SELECT 1 FROM public.async_jobs WHERE kind='pro_premium_report' AND input->>'caseType'='hd' LIMIT 1");
      if (jobs.rows.length) throw Error('pro_hd_accepted_job_requires_forward_recovery');
    }
    await main.query('COMMIT');
  } catch (error) { await main.query('ROLLBACK'); throw error; }
}

export function previousHdCompatibility(previousDir,currentDir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')) {
  const has = (file, markers) => {
    const target = path.join(previousDir, file);
    if (!fs.existsSync(target)) return false;
    const source = fs.readFileSync(target, 'utf8');
    return markers.every(marker => source.includes(marker));
  };
  return {
    proGeneration:supportsProGenerationRollback(currentDir,previousDir),
    receipts: has('src/lib/services/hd-generation-service.ts', ['generation_revision', 'generation_context', 'assertHdGenerationCurrent'])
      && has('src/lib/services/hd-purchase-route.ts', ['acquireHdGeneration', 'saveHdGeneration'])
      && has('src/lib/async-jobs.ts', ['generation_revision']),
    engine: has('src/lib/human-design/types.ts', ['hd-v2-astronomy-engine-osculating-node-exact-arc88']),
    proReceipts: has('src/modules/pro/db/hd-generation.ts', ['hd_delivery_receipts', 'recoverProHdGeneration'])
      && has('src/app/(pro)/api/pro/jobs/premium-report/route.ts', ['recoverProHdGeneration'])
      && has('src/lib/async-jobs.ts', ['getProHdReceipt']),
  };
}

async function main(appDir, previousDir) {
  if (!path.isAbsolute(appDir) || !path.isAbsolute(previousDir)) throw Error('absolute_paths_required');
  const env = parseEnv(fs.readFileSync(path.join(appDir, '.env.local'), 'utf8'));
  if (!env.DATABASE_URL) throw Error('database_not_configured');
  let pg;
  try { pg = createRequire(path.join(appDir, 'package.json'))('pg'); }
  catch { pg = createRequire(path.join(previousDir, 'package.json'))('pg'); }
  const options = { connectionTimeoutMillis: 5000, statement_timeout: 5000, query_timeout: 6000,
    ssl: env.DATABASE_SSL === 'require' ? { rejectUnauthorized: env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false' } : undefined };
  const client = new pg.Client({ ...options, connectionString: env.DATABASE_URL });
  const pro = new pg.Client({ ...options, connectionString: env.PRO_DATABASE_URL || env.DATABASE_URL });
  client.on('error', () => undefined); pro.on('error', () => undefined);
  try { await client.connect(); await pro.connect(); await assertHdRollbackCompatible(client, pro, previousHdCompatibility(previousDir,appDir)); }
  finally { await Promise.allSettled([client.end(), pro.end()]); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await main(process.argv[2] || '', process.argv[3] || ''); console.log('hd_schema_rollback_compatible'); }
  catch { console.error('hd_state_requires_forward_recovery'); process.exitCode = 2; }
}
