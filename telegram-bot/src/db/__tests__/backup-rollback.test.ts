import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { botConfig } from "../../config.js";
import { getDb, migrate } from "../client.js";
import { migrateDown, migrateUp } from "../migrate-runner.js";
import { createDatabaseBackup } from "../backup.js";

migrate(); migrateUp();
const db = getDb();
const fixtureDir = mkdtempSync(join(botConfig.dataDir, "backup-check-"));
db.exec("PRAGMA wal_autocheckpoint = 0; CREATE TABLE IF NOT EXISTS backup_test (id INTEGER PRIMARY KEY, value TEXT);");
db.prepare("INSERT OR REPLACE INTO backup_test VALUES (1, ?)").run("committed WAL sentinel");
const snapshot = join(fixtureDir, "snapshot'quote.sqlite");
createDatabaseBackup(snapshot);
const restored = new DatabaseSync(snapshot);
try {
  assert.equal((restored.prepare("PRAGMA integrity_check").get() as { integrity_check: string }).integrity_check, "ok");
  assert.equal((restored.prepare("SELECT value FROM backup_test WHERE id = 1").get() as { value: string }).value, "committed WAL sentinel");
  restored.exec("UPDATE backup_test SET value = 'restored database accepts writes' WHERE id = 1");
  assert.equal((db.prepare("SELECT value FROM backup_test WHERE id = 1").get() as { value: string }).value, "committed WAL sentinel");
} finally { restored.close(); }

const migration = "999_test_rollback";
db.prepare("INSERT INTO bot_schema_migrations (id, applied_at) VALUES (?, ?)").run(migration, new Date().toISOString());
writeFileSync(join(fixtureDir, `${migration}.down.sql`), "DELETE FROM backup_test; DELETE FROM deliberately_missing_table;");
try {
  assert.throws(() => migrateDown(fixtureDir), /no such table/);
  assert(db.prepare("SELECT 1 FROM backup_test WHERE id = 1").get(), "failed down restores earlier successful statements");
  assert(db.prepare("SELECT 1 FROM bot_schema_migrations WHERE id = ?").get(migration), "failed down preserves migration journal");
  writeFileSync(join(fixtureDir, `${migration}.down.sql`), "DELETE FROM backup_test;");
  assert.deepEqual(migrateDown(fixtureDir), [migration]);
  assert(!db.prepare("SELECT 1 FROM bot_schema_migrations WHERE id = ?").get(migration));
} finally {
  db.prepare("DELETE FROM bot_schema_migrations WHERE id = ?").run(migration);
  db.exec("DROP TABLE backup_test;");
}
console.log("ok: WAL-aware backup / standalone restore and integrity / down migration atomic rollback");
