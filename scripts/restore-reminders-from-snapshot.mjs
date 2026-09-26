#!/usr/bin/env node
/** One-time recovery of daily reminder choices from a pre-159 database snapshot. */
import fs from "node:fs";
import pg from "pg";

const sourceName = process.env.REMINDER_RESTORE_SOURCE_DB_NAME;
if (!/^codex_mail_recovery_[a-z0-9_]+$/.test(sourceName || "")) {
  throw new Error("REMINDER_RESTORE_SOURCE_DB_NAME must name an isolated recovery database");
}

const envText = fs.readFileSync("/opt/aura-ai/.env.local", "utf8");
const databaseUrl = envText.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g, "");
if (!databaseUrl) throw new Error("DATABASE_URL missing");
const targetName = process.env.REMINDER_RESTORE_TARGET_DB_NAME;
if (targetName && !/^codex_mail_target_[a-z0-9_]+$/.test(targetName)) {
  throw new Error("REMINDER_RESTORE_TARGET_DB_NAME must name an isolated test database");
}
const targetUrl = new URL(databaseUrl);
if (targetName) targetUrl.pathname = `/${targetName}`;
const sourceUrl = new URL(databaseUrl);
sourceUrl.pathname = `/${sourceName}`;
const apply = process.argv.includes("--apply");

const accountSql = `SELECT ua.id, ua.profile_user_id, ua.daily_cards_reminder,
       u.notification_prefs
  FROM user_accounts ua
  LEFT JOIN users u ON u.id=ua.profile_user_id
  WHERE ua.erasure_requested_at IS NULL
    AND (u.id IS NULL OR u.erasure_requested_at IS NULL)`;

const current = new pg.Client({ connectionString: targetUrl.toString() });
const source = new pg.Client({ connectionString: sourceUrl.toString() });
await Promise.all([current.connect(), source.connect()]);
let transactionStarted = false;
let committed = false;
try {
  const sourceMigrated = await source.query(
    "SELECT 1 FROM schema_migrations WHERE version='159_retention_integrity.sql'"
  );
  const liveMigrated = await current.query(
    "SELECT 1 FROM schema_migrations WHERE version='159_retention_integrity.sql'"
  );
  const defaultsRestored = await current.query(
    "SELECT 1 FROM schema_migrations WHERE version='162_restore_daily_reminder_defaults.sql'"
  );
  if (sourceMigrated.rowCount || !liveMigrated.rowCount) {
    throw new Error("Source must predate migration 159 and target must include it");
  }
  if (!defaultsRestored.rowCount) throw new Error("Apply migration 162 before recovery");
  const sourceRows = (await source.query(accountSql)).rows;
  if (apply) {
    await current.query("BEGIN");
    transactionStarted = true;
    // Lock both preference owners before reading live values. An unsubscribe
    // cannot land between the recovery decision and its UPDATE.
    await current.query("SELECT id FROM user_accounts ORDER BY id FOR UPDATE");
    await current.query("SELECT id FROM users ORDER BY id FOR UPDATE");
  }
  const currentRows = (await current.query(accountSql)).rows;
  if (sourceRows.length < 50 || currentRows.length < sourceRows.length) {
    throw new Error("Unexpected source or target account count");
  }
  const before = new Map(sourceRows.map((row) => [row.id, row]));
  const changes = [];
  let preservedOldOff = 0;
  let newAccounts = 0;

  for (const row of currentRows) {
    const old = before.get(row.id);
    if (!old) {
      newAccounts++;
      continue;
    }
    if (!old.daily_cards_reminder) {
      preservedOldOff++;
      continue;
    }
    // The owner requested restoration of the pre-159 daily campaign. We
    // restore only accounts whose reminder was ON in that snapshot; there is
    // no trustworthy log of preference changes made during the reset window.
    const master = true;
    const patch = {};
    for (const key of ["dailyEmail", "dailyInApp", "dailyTelegram"]) {
      const desired = Boolean(
        row.notification_prefs?.[key] === true || old.notification_prefs?.[key] === true
      );
      if (desired && row.notification_prefs?.[key] !== true) patch[key] = true;
    }
    if (master !== row.daily_cards_reminder || Object.keys(patch).length) {
      changes.push({ id: row.id, profileUserId: row.profile_user_id, master, patch });
    }
  }

  console.log(JSON.stringify({
    mode: apply ? "apply" : "dry_run",
    sourceAccounts: sourceRows.length,
    currentAccounts: currentRows.length,
    newAccounts,
    preservedOldOff,
    accountsToRestore: changes.length,
    masterToEnable: changes.filter((row) => row.master).length,
    dailyEmailToEnable: changes.filter((row) => row.patch.dailyEmail).length,
    telegramToEnable: changes.filter((row) => row.patch.dailyTelegram).length,
  }));

  if (apply) {
    const backupPath = targetName
      ? `/tmp/${targetName}-reminder-before.json`
      : "/opt/aura-ai/backups/reminder-recovery-before-20260924.json";
    if (fs.existsSync(backupPath)) throw new Error(`Rollback snapshot already exists: ${backupPath}`);
    const currentById = new Map(currentRows.map((row) => [row.id, row]));
    fs.writeFileSync(backupPath, JSON.stringify(changes.map((row) => ({
      id: row.id,
      profileUserId: row.profileUserId,
      before: {
        master: currentById.get(row.id).daily_cards_reminder,
        notificationPrefs: currentById.get(row.id).notification_prefs,
      },
    }))), { mode: 0o600, flag: "wx" });
    for (const row of changes) {
      await current.query(
        "UPDATE user_accounts SET daily_cards_reminder=$2 WHERE id=$1",
        [row.id, row.master]
      );
      if (row.profileUserId && Object.keys(row.patch).length) {
        await current.query(
          `UPDATE users SET notification_prefs=COALESCE(notification_prefs,'{}'::jsonb)
             || $2::jsonb WHERE id=$1`,
          [row.profileUserId, JSON.stringify(row.patch)]
        );
      }
    }
    await current.query("COMMIT");
    committed = true;
    console.log("Reminder choices restored");
  }
} finally {
  if (transactionStarted && !committed) await current.query("ROLLBACK");
  await Promise.all([current.end(), source.end()]);
}
