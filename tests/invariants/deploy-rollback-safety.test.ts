import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
// Same operational module executes directly under /usr/bin/node after npm ci.
// @ts-expect-error Operational .mjs exports are intentionally untyped.
import { classifyRollbackSafety, inspectRollbackSafety, readBotRollbackCounts } from '../../hosting/check-deploy-rollback-safety.mjs';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const empty = { erasureJobs: 0, inbox: 0, paidOperations: 0, tombstones: 0, activeUpdates: 0, reminderSends: 0, legacyDropsPending: false };

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'zovus-rollback-check-'));
  roots.push(root);
  const app = path.join(root, 'new');
  const previous = path.join(root, 'old');
  mkdirSync(path.join(app, 'telegram-bot', 'custom data'), { recursive: true });
  mkdirSync(path.join(previous, 'telegram-bot', 'src'), { recursive: true });
  writeFileSync(path.join(app, '.env.local'), 'DATABASE_URL="postgres://test:DO_NOT_LOG_SECRET@localhost/test"\r\n');
  writeFileSync(path.join(app, 'telegram-bot', '.env'), 'BOT_DATA_DIR="custom data"\r\nBOT_DB_NAME="state.sqlite"\r\n');
  const oldStartup = path.join(previous, 'telegram-bot', 'src', 'index.ts');
  writeFileSync(oldStartup, 'await bot.api.deleteWebhook();');
  const dbPath = path.join(app, 'telegram-bot', 'custom data', 'state.sqlite');
  const db = new DatabaseSync(dbPath);
  db.exec(`CREATE TABLE bot_update_inbox(status TEXT); CREATE TABLE bot_paid_operations(status TEXT);
    CREATE TABLE bot_user_erasure(status TEXT); CREATE TABLE bot_processed_updates(status TEXT);
    CREATE TABLE bot_reminder_delivery(state TEXT);`);
  db.close();
  return { app, previous, oldStartup, dbPath };
}

describe('fail-closed deployment rollback safety', () => {
  it('allows only positively verified empty compatible state', () => {
    expect(classifyRollbackSafety(empty)).toMatchObject({ safe: true });
    expect(classifyRollbackSafety({ ...empty, error: true })).toMatchObject({ safe: false });
    expect(classifyRollbackSafety({ ...empty, inbox: undefined })).toMatchObject({ safe: false });
    expect(classifyRollbackSafety({ ...empty, erasureJobs: Number.NaN })).toMatchObject({ safe: false });
  });
  it.each(['erasureJobs', 'inbox', 'paidOperations', 'tombstones', 'activeUpdates', 'reminderSends'])('blocks unfinished %s', key => {
    expect(classifyRollbackSafety({ ...empty, [key]: 1 })).toMatchObject({ safe: false, reason: 'unfinished_durable_work' });
  });
  it('blocks the legacy poller which discards remote Telegram updates', () => {
    expect(classifyRollbackSafety({ ...empty, legacyDropsPending: true })).toMatchObject({ safe: false, reason: 'legacy_drops_pending_updates' });
  });
  it('reads quoted environment and custom SQLite location without exposing credentials', async () => {
    const f = fixture();
    const result = await inspectRollbackSafety(f.app, f.previous, async (url: string) => {
      expect(url).toBe('postgres://test:DO_NOT_LOG_SECRET@localhost/test');
      return 0;
    });
    expect(result).toMatchObject({ safe: true });
    expect(JSON.stringify(result)).not.toContain('DO_NOT_LOG_SECRET');
    writeFileSync(f.oldStartup, 'await bot.start({ drop_pending_updates: true });');
    expect(await inspectRollbackSafety(f.app, f.previous, async () => 0)).toMatchObject({ safe: false, reason: 'legacy_drops_pending_updates' });
  });
  it('counts unknown and pending SQLite states conservatively, preserving terminal records', async () => {
    const f = fixture();
    const db = new DatabaseSync(f.dbPath);
    db.exec(`INSERT INTO bot_update_inbox VALUES ('needs_review');
      INSERT INTO bot_paid_operations VALUES ('delivered'), ('failed'), ('ready'), ('pending'), ('unknown');
      INSERT INTO bot_user_erasure VALUES ('completed'), ('purged');
      INSERT INTO bot_processed_updates VALUES ('completed'), ('processing'), ('irreversible');
      INSERT INTO bot_reminder_delivery VALUES ('sent'), ('uncertain'), ('sending'), ('retry');`);
    db.close();
    expect(readBotRollbackCounts(f.dbPath)).toEqual({ inbox: 1, paidOperations: 3, tombstones: 2, activeUpdates: 2, reminderSends: 3 });
    expect(await inspectRollbackSafety(f.app, f.previous, async () => 0)).toMatchObject({ safe: false });
  });
  it('blocks missing database/schema and PostgreSQL failures without leaking raw errors', async () => {
    const f = fixture();
    const result = await inspectRollbackSafety(f.app, f.previous, async () => { throw new Error('DO_NOT_LOG_SECRET'); });
    expect(result).toEqual({ safe: false, reason: 'rollback_state_unverified' });
    rmSync(f.dbPath);
    expect(await inspectRollbackSafety(f.app, f.previous, async () => 0)).toMatchObject({ safe: false });
    expect(existsSync(f.dbPath)).toBe(false, 'read-only checker must not create a fresh empty database');
    new DatabaseSync(f.dbPath).close();
    expect(await inspectRollbackSafety(f.app, f.previous, async () => 0)).toMatchObject({ safe: false });
  });
});
