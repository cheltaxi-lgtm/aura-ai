/**
 * Vitest setupFiles entry: load .env.test* and point DATABASE_URL at the test DB
 * before any product module creates a pg Pool.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../../..");

function readEnvFile(name: string): Record<string, string> {
  const p = path.join(ROOT, name);
  const out: Record<string, string> = {};
  if (!fs.existsSync(p)) return out;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const m = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    let val = m[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[m[1]] = val;
  }
  return out;
}

function applyEnvFile(name: string, { overwrite = false } = {}) {
  const entries = readEnvFile(name);
  for (const [key, val] of Object.entries(entries)) {
    if (overwrite || process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
  return entries;
}

// Primary URL from project env files (not a possibly polluted shell DATABASE_URL).
const filePrimary =
  readEnvFile(".env.local").DATABASE_URL ||
  readEnvFile(".env").DATABASE_URL ||
  "";
process.env.DATABASE_URL_PRIMARY_SNAPSHOT = filePrimary;

// TEST_DATABASE_URL: shell/CI wins; else .env.test*
const testFromFiles =
  readEnvFile(".env.test.local").TEST_DATABASE_URL ||
  readEnvFile(".env.test").TEST_DATABASE_URL ||
  "";
const testUrl = (process.env.TEST_DATABASE_URL || testFromFiles || "").trim();
if (testUrl) process.env.TEST_DATABASE_URL = testUrl;

// Load remaining keys without clobbering TEST_DATABASE_URL / redirected DATABASE_URL.
applyEnvFile(".env");
applyEnvFile(".env.local");
applyEnvFile(".env.test");
applyEnvFile(".env.test.local");

if (testUrl) {
  const lower = testUrl.toLowerCase();
  if (
    lower.includes("prod") ||
    lower.includes("beget") ||
    lower.includes("zovus.ru")
  ) {
    throw new Error(
      "Refusing TEST_DATABASE_URL: looks like a production host (prod/beget/zovus.ru)"
    );
  }
  // Compare against file primary (and CI DATABASE_URL if it was set before redirect).
  const primaryForCompare = (
    filePrimary ||
    process.env.DATABASE_URL_PRIMARY_SNAPSHOT ||
    ""
  ).trim();
  if (primaryForCompare && testUrl === primaryForCompare) {
    throw new Error(
      "Refusing TEST_DATABASE_URL: must not equal DATABASE_URL (would hit the primary DB)"
    );
  }
  // Product code reads DATABASE_URL via getPool().
  process.env.DATABASE_URL = testUrl;
}

export const hasTestDb = Boolean(testUrl);
