#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { DatabaseSync } from 'node:sqlite';

const COUNTS = ['erasureJobs', 'inbox', 'paidOperations', 'tombstones', 'activeUpdates', 'reminderSends'];

/** Unknown state can never establish that an older executable is safe. */
export function classifyRollbackSafety(evidence) {
  if (!evidence || evidence.error || COUNTS.some(key => !Number.isSafeInteger(evidence[key]) || evidence[key] < 0)) {
    return { safe: false, reason: 'rollback_state_unverified' };
  }
  if (!Number.isSafeInteger(evidence.memorySuppressions) || evidence.memorySuppressions < 0) return { safe: false, reason: 'rollback_state_unverified' };
  if (!Number.isSafeInteger(evidence.activeHdAdminRewrites) || evidence.activeHdAdminRewrites < 0) return { safe: false, reason: 'rollback_state_unverified' };
  if (evidence.memorySuppressions > 0 && evidence.supportsMemorySuppression !== true) return { safe: false, reason: 'legacy_ignores_forgotten_memory' };
  if (evidence.activeHdAdminRewrites > 0 && evidence.supportsHdAdminRewriteMarker !== true) return { safe: false, reason: 'legacy_ignores_hd_admin_rewrite' };
  const pending = COUNTS.filter(key => evidence[key] > 0);
  if (pending.length) return { safe: false, reason: 'unfinished_durable_work', pending };
  // An old poller that drops Telegram's remote queue is unsafe even when the
  // local inbox is empty: new messages can arrive immediately after this check.
  if (evidence.legacyDropsPending !== false) return { safe: false, reason: 'legacy_drops_pending_updates' };
  return { safe: true, reason: 'no_unfinished_durable_work' };
}

export function readBotRollbackCounts(databasePath) {
  const db = new DatabaseSync(databasePath, { readOnly: true });
  try {
    db.exec('PRAGMA busy_timeout = 2000; BEGIN;');
    const count = sql => {
      const n = Number(db.prepare(sql).get().n);
      if (!Number.isSafeInteger(n) || n < 0) throw new Error('invalid_count');
      return n;
    };
    return {
      inbox: count("SELECT COUNT(*) AS n FROM bot_update_inbox"),
      paidOperations: count("SELECT COUNT(*) AS n FROM bot_paid_operations WHERE status NOT IN ('delivered', 'failed')"),
      // Completed tombstones still reject pre-erasure messages and old account
      // notifications. Conservatively keep a compatible executable for them.
      tombstones: count("SELECT COUNT(*) AS n FROM bot_user_erasure"),
      activeUpdates: count("SELECT COUNT(*) AS n FROM bot_processed_updates WHERE status <> 'completed'"),
      reminderSends: count("SELECT COUNT(*) AS n FROM bot_reminder_delivery WHERE state <> 'sent'"),
    };
  } finally { db.close(); }
}

async function readErasureCount(databaseUrl) {
  if (!databaseUrl) throw new Error('database_not_configured');
  // Imported from the new release after npm ci. Missing dependencies fail closed.
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: databaseUrl, connectionTimeoutMillis: 5000,
    statement_timeout: 5000, query_timeout: 6000, application_name: 'deploy-rollback-safety' });
  client.on('error', () => undefined);
  try {
    await client.connect();
    await client.query('BEGIN READ ONLY');
    const result = await client.query("SELECT COUNT(*)::text AS n FROM account_erasure_jobs WHERE stage <> 'completed'");
    const table = await client.query("SELECT to_regclass('public.user_memory_source_suppressions') IS NOT NULL AS present");
    const memory = table.rows[0].present
      ? await client.query("SELECT COUNT(*)::text AS n FROM user_memory_source_suppressions") : { rows: [{ n: '0' }] };
    const rewriteColumn = await client.query("SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='hd_reports' AND column_name='admin_rewrite_started_at') AS present");
    const rewrites = rewriteColumn.rows[0].present
      ? await client.query("SELECT COUNT(*)::text AS n FROM hd_reports WHERE admin_rewrite_started_at IS NOT NULL") : { rows: [{ n: '0' }] };
    return { erasureJobs: Number(result.rows[0].n), memorySuppressions: Number(memory.rows[0].n), activeHdAdminRewrites: Number(rewrites.rows[0].n) };
  } finally { await client.end(); }
}

export async function inspectRollbackSafety(appDir, previousDir, pgCount = readErasureCount) {
  try {
    if (!path.isAbsolute(appDir) || !path.isAbsolute(previousDir)) throw new Error('absolute_paths_required');
    // Node's dotenv parser handles quotes/CRLF without shell evaluation. Never
    // print parsed credentials, connection errors, user IDs, or stored payloads.
    const siteEnv = parseEnv(fs.readFileSync(path.join(appDir, '.env.local'), 'utf8'));
    const botEnv = parseEnv(fs.readFileSync(path.join(appDir, 'telegram-bot', '.env'), 'utf8'));
    const botRoot = path.join(appDir, 'telegram-bot');
    const dataDir = path.resolve(botRoot, botEnv.BOT_DATA_DIR?.trim() || 'data');
    const dbPath = path.resolve(dataDir, botEnv.BOT_DB_NAME?.trim() || 'bot.sqlite');
    const previousStartup = fs.readFileSync(path.join(previousDir, 'telegram-bot', 'src', 'index.ts'), 'utf8');
    const evidence = {
      ...await pgCount(siteEnv.DATABASE_URL),
      supportsMemorySuppression: ['src/lib/user-memory.ts', 'src/lib/session-memory.ts', 'src/lib/memory/user-facts.ts', 'src/lib/memory/extraction-jobs.ts'].every(file => {
        const target = path.join(previousDir, file);
        return fs.existsSync(target) && /user_memory_source_suppressions|isMemorySourceSuppressed/.test(fs.readFileSync(target, 'utf8'));
      }),
      supportsHdAdminRewriteMarker: Object.entries({
        'src/lib/services/human-design-service.ts': /admin_rewrite_started_at[\s\S]*isHdReportRewriteInProgress|isHdReportRewriteInProgress[\s\S]*admin_rewrite_started_at/,
        'src/app/api/human-design/report/route.ts': /isHdReportRewriteInProgress/,
        'src/app/api/human-design/report/ask/route.ts': /isHdReportReadable/,
        'src/app/cabinet/human-design/reports/[id]/print/page.tsx': /isHdReportReadable/,
        'src/lib/reports/private-pdf-access.ts': /admin_rewrite_started_at/,
        'src/lib/cabinet-data.ts': /admin_rewrite_started_at/,
      }).every(([file, pattern]) => {
        const target = path.join(previousDir, file);
        return fs.existsSync(target) && pattern.test(fs.readFileSync(target, 'utf8'));
      }),
      ...readBotRollbackCounts(dbPath),
      legacyDropsPending: /drop_pending_updates\s*:\s*true\b/.test(previousStartup),
    };
    return { ...classifyRollbackSafety(evidence), counts: { ...Object.fromEntries(COUNTS.map(key => [key, evidence[key]])), activeHdAdminRewrites: evidence.activeHdAdminRewrites } };
  } catch {
    return classifyRollbackSafety({ error: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await inspectRollbackSafety(process.argv[2] || '', process.argv[3] || '');
  console.log(JSON.stringify(result));
  process.exitCode = result.safe ? 0 : 2;
}
