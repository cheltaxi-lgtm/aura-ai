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
    return Number(result.rows[0].n);
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
      erasureJobs: await pgCount(siteEnv.DATABASE_URL),
      ...readBotRollbackCounts(dbPath),
      legacyDropsPending: /drop_pending_updates\s*:\s*true\b/.test(previousStartup),
    };
    return { ...classifyRollbackSafety(evidence), counts: Object.fromEntries(COUNTS.map(key => [key, evidence[key]])) };
  } catch {
    return classifyRollbackSafety({ error: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await inspectRollbackSafety(process.argv[2] || '', process.argv[3] || '');
  console.log(JSON.stringify(result));
  process.exitCode = result.safe ? 0 : 2;
}
