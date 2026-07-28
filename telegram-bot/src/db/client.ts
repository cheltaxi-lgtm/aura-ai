import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { botConfig } from "../config.js";

let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (db) return db;
  db = new DatabaseSync(botConfig.dbPath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  return db;
}

export function migrate(): void {
  const schemaPath = resolve(dirname(fileURLToPath(import.meta.url)), "schema.sql");
  const sql = readFileSync(schemaPath, "utf8");
  getDb().exec(sql);
  seedFlags();
}

function seedFlags(): void {
  const now = new Date().toISOString();
  const upsert = getDb().prepare(
    `INSERT INTO bot_flags (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO NOTHING`
  );
  upsert.run("bot_enabled", botConfig.flags.botEnabled ? "1" : "0", now);
  upsert.run("day_card_enabled", botConfig.flags.dayCardEnabled ? "1" : "0", now);
  upsert.run("reminders_enabled", botConfig.flags.remindersEnabled ? "1" : "0", now);
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function todayInTz(timeZone = botConfig.timezone): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
