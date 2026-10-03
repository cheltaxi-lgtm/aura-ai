import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

// Match the actual readers, dispatchers and deletion paths. A changed or
// missing implementation is conservatively incompatible while durable state
// still depends on this protocol; an isolated marker string is insufficient.
const PROTOCOL_FILES=[
  'src/modules/pro/db/hd-generation.ts',
  'src/modules/pro/db/hd-purge.ts',
  'src/modules/pro/db/cases.ts',
  'src/app/(pro)/api/pro/cases/[id]/route.ts',
  'src/app/(pro)/api/pro/jobs/premium-report/route.ts',
  'src/lib/async-jobs.ts',
  'src/lib/services/durable-report-receipt.ts',
  'scripts/run-async-jobs.ts',
];
export const PRO_ROLLBACK_COUNTS=['activeProGenerations','frozenProSources','nonHdProReceipts'];

export function proGenerationProtocolFingerprint(directory) {
  try {
    const hash=createHash('sha256');
    for(const file of PROTOCOL_FILES) {
      const text=fs.readFileSync(path.join(directory,file),'utf8').replaceAll('\r\n','\n');
      if(!text.trim())return null;
      hash.update(file+'\0'+text+'\0');
    }
    return hash.digest('hex');
  } catch { return null; }
}

export function supportsProGenerationRollback(currentDirectory,previousDirectory) {
  const current=proGenerationProtocolFingerprint(currentDirectory);
  return Boolean(current&&current===proGenerationProtocolFingerprint(previousDirectory));
}

/** Read-only queries; callers stop all writers before deciding to restore. */
export async function readProGenerationRollbackCounts(main,pro) {
  const count=(raw)=>{
    if(raw===undefined||raw===null||raw==='')throw new Error('pro_rollback_state_unverified');
    const n=Number(raw);
    if(!Number.isSafeInteger(n)||n<0)throw new Error('pro_rollback_state_unverified');
    return n;
  };
  const jobsTable=(await main.query("SELECT to_regclass('public.async_jobs') IS NOT NULL AS present")).rows[0]?.present;
  if(typeof jobsTable!=='boolean')throw new Error('pro_rollback_state_unverified');
  let activeProGenerations=0,frozenProSources=0,nonHdProReceipts=0;
  if(jobsTable) {
    const columns=(await main.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='async_jobs'")).rows.map(row=>row.column_name);
    if(!['kind','status','input'].every(column=>columns.includes(column)))throw new Error('pro_rollback_state_unverified');
    const metadata=columns.includes('period_metadata')?"COALESCE(period_metadata,'{}'::jsonb)":"'{}'::jsonb";
    const result=await main.query("SELECT COUNT(*) FILTER (WHERE status IN ('pending','running') AND (input ? 'frozenPayload' OR input ? 'refinement' OR "+metadata+" ? 'pro_source_identity'))::text AS active, COUNT(*) FILTER (WHERE input ? 'frozenPayload' OR input ? 'refinement' OR input ? 'frozenPractitionerContext' OR input ? 'frozenQuestion' OR input ? 'frozenAlias')::text AS frozen FROM public.async_jobs WHERE kind='pro_premium_report'");
    activeProGenerations=count(result.rows[0]?.active);frozenProSources=count(result.rows[0]?.frozen);
  }
  const receiptTable=(await pro.query("SELECT to_regclass('pro.hd_delivery_receipts') IS NOT NULL AS present")).rows[0]?.present;
  if(typeof receiptTable!=='boolean')throw new Error('pro_rollback_state_unverified');
  if(receiptTable) {
    const column=(await pro.query("SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='pro' AND table_name='hd_delivery_receipts' AND column_name='case_type') AS present")).rows[0]?.present;
    if(typeof column!=='boolean')throw new Error('pro_rollback_state_unverified');
    if(column)nonHdProReceipts=count((await pro.query("SELECT COUNT(*)::text AS n FROM pro.hd_delivery_receipts WHERE case_type IS DISTINCT FROM 'hd'")).rows[0]?.n);
  }
  return {activeProGenerations,frozenProSources,nonHdProReceipts};
}

export async function assertProGenerationRollbackCompatible(main,pro,supported=false) {
  const counts=await readProGenerationRollbackCounts(main,pro);
  if(!supported&&PRO_ROLLBACK_COUNTS.some(key=>counts[key]>0))throw new Error('pro_generation_requires_forward_recovery');
  return counts;
}
