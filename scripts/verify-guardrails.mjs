/**
 * Lightweight static guardrails — no Docker, no test framework.
 * Run: npm run verify:guardrails
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src");

const SKIP_DIRS = new Set(["node_modules", ".next", "dist", "build", "coverage"]);

const CLIENT_FORBIDDEN_IMPORTS = [
  "@/lib/db",
  "@/lib/llm",
  "@/lib/settings",
  "@/lib/session",
  "@/lib/numerology/numerolog-finalize",
  "natalengine",
  "celestine",
  "ephimeris-moshier",
  "lib/db",
  "lib/llm",
  "lib/settings",
  "lib/session",
  "numerolog-finalize",
  "pg",
  "net",
  "tls",
  "fs",
  "path",
  "crypto",
  "server-only",
];

const SCHEMA_SESSION_COLUMNS = [
  "character_key",
  "intention",
  "spread_type",
  "cards",
  "status",
  "awaiting_context",
];

const SCHEMA_INDEXES = [
  "idx_sessions_user_character",
  "idx_sessions_active",
  "idx_chat_messages_session_character_created",
  "idx_session_memories_user_created",
  "idx_session_memories_session_unique",
  "idx_rune_transactions_unshown",
  "idx_user_accounts_unlimited",
  "idx_user_achievements_user",
  "idx_payments_referrer",
];

const failures = [];
const passes = [];

function fail(msg) {
  failures.push(msg);
  console.error(`[fail] ${msg}`);
}

function ok(msg) {
  passes.push(msg);
  console.log(`[ok] ${msg}`);
}

function walkDir(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      walkDir(full, out);
    } else if (/\.(tsx?|jsx?)$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

function isClientFile(content) {
  const head = content.slice(0, 400);
  return /^\s*["']use client["']\s*;?/m.test(head);
}

function importLines(content) {
  const lines = content.split(/\r?\n/);
  const imports = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m =
      line.match(/^\s*import\s+(?:type\s+)?(?:[\w*{}\s,]+)\s+from\s+['"]([^'"]+)['"]/) ||
      line.match(/^\s*import\s+['"]([^'"]+)['"]/);
    if (m) imports.push({ line: i + 1, spec: m[1], text: line.trim() });
  }
  return imports;
}

function importForbidden(spec) {
  const s = spec.replace(/\\/g, "/");

  const exactOrSubpath = (prefix) => s === prefix || s.startsWith(`${prefix}/`);

  if (exactOrSubpath("@/lib/db") || s === "pg" || s.endsWith("/lib/db")) return "@/lib/db";
  if (exactOrSubpath("@/lib/llm") || s.endsWith("/lib/llm")) return "@/lib/llm";
  if (exactOrSubpath("@/lib/settings") || s.endsWith("/lib/settings")) return "@/lib/settings";
  if (s === "@/lib/session" || s.endsWith("/lib/session")) return "@/lib/session";
  if (s.includes("numerolog-finalize")) return "numerolog-finalize";
  if (s === "natalengine" || s.startsWith("natalengine/")) return "natalengine";
  if (s === "celestine" || s.startsWith("celestine/")) return "celestine";
  if (s === "ephimeris-moshier" || s.startsWith("ephimeris-moshier/")) return "ephimeris-moshier";

  for (const pkg of ["pg", "net", "tls", "fs", "path", "crypto", "server-only"]) {
    if (s === pkg) return pkg;
  }

  return null;
}

function checkClientServerBoundary() {
  const files = walkDir(SRC);
  let clientCount = 0;
  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    if (!isClientFile(content)) continue;
    clientCount++;
    const rel = path.relative(ROOT, file).replace(/\\/g, "/");
    for (const imp of importLines(content)) {
      const forbidden = importForbidden(imp.spec);
      if (forbidden) {
        fail(
          `Client file ${rel} imports server-only module "${imp.spec}" (rule: ${forbidden}) at line ${imp.line}`
        );
      }
    }
  }
  if (failures.length === 0 || !failures.some((f) => f.startsWith("Client file"))) {
    ok(`client/server boundary: ${clientCount} client files scanned, no forbidden imports`);
  }
}

function extractCreateTableBlock(sql, tableName) {
  const re = new RegExp(
    `create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?${tableName}\\s*\\(([\\s\\S]*?)\\)\\s*;`,
    "i"
  );
  const m = sql.match(re);
  return m ? m[1] : "";
}

function checkSchema() {
  const schemaPath = path.join(ROOT, "src/lib/schema.sql");
  if (!fs.existsSync(schemaPath)) {
    fail("schema.sql not found at src/lib/schema.sql");
    return;
  }
  const raw = fs.readFileSync(schemaPath, "utf8");
  const sql = raw.toLowerCase();

  const sessionsBlock = extractCreateTableBlock(sql, "sessions");
  if (!sessionsBlock) {
    fail("schema.sql: CREATE TABLE sessions block not found");
  } else {
    for (const col of SCHEMA_SESSION_COLUMNS) {
      if (!sessionsBlock.includes(col)) {
        fail(`schema.sql: sessions.${col} missing in CREATE TABLE`);
      }
    }
  }

  const usersBlock = extractCreateTableBlock(sql, "users");
  if (!usersBlock) {
    fail("schema.sql: CREATE TABLE users block not found");
  } else if (!usersBlock.includes("starter_runes_granted")) {
    fail("schema.sql: users.starter_runes_granted missing in CREATE TABLE");
  }

  const memoriesBlock = extractCreateTableBlock(sql, "session_memories");
  if (!memoriesBlock) {
    fail("schema.sql: CREATE TABLE session_memories block not found");
  } else if (!memoriesBlock.includes("session_id")) {
    fail("schema.sql: session_memories.session_id missing in CREATE TABLE");
  }

  const natalBlock = extractCreateTableBlock(sql, "natal_charts");
  if (!natalBlock) {
    fail("schema.sql: CREATE TABLE natal_charts block not found");
  } else {
    for (const col of ["user_id", "house_system", "chart_data", "engine_version", "last_transit_notify_at"]) {
      if (!natalBlock.includes(col)) {
        fail(`schema.sql: natal_charts.${col} missing in CREATE TABLE`);
      }
    }
  }

  const jointBlock = extractCreateTableBlock(sql, "joint_readings");
  if (!jointBlock || !jointBlock.includes("synastry_data")) {
    fail("schema.sql: joint_readings.synastry_data missing in CREATE TABLE");
  }

  for (const idx of SCHEMA_INDEXES) {
    if (!sql.includes(idx.toLowerCase())) {
      fail(`schema.sql: index ${idx} not found`);
    }
  }

  if (!sql.includes("'runes'") && !sql.includes("('runes'")) {
    fail("schema.sql: platform_settings seed for 'runes' not found");
  }

  if (!failures.some((f) => f.startsWith("schema.sql"))) {
    ok("schema.sql: critical columns, indexes, and runes seed present");
  }
}

function checkHealthEndpoint() {
  const healthPath = path.join(ROOT, "src/app/api/health/route.ts");
  if (!fs.existsSync(healthPath)) {
    fail("health route not found at src/app/api/health/route.ts");
    return;
  }
  const content = fs.readFileSync(healthPath, "utf8");

  const jsonCalls = [...content.matchAll(/NextResponse\.json\s*\(\s*(\{[\s\S]*?\})\s*,/g)];
  if (jsonCalls.length === 0) {
    fail("health route: NextResponse.json payload not found");
    return;
  }

  const sensitiveKeys = ["llm", "provider", "model", "db"];
  for (const match of jsonCalls) {
    const payload = match[1].toLowerCase();
    for (const key of sensitiveKeys) {
      const keyRe = new RegExp(`\\b${key}\\s*:`, "i");
      const quotedRe = new RegExp(`["']${key}["']\\s*:`, "i");
      if (keyRe.test(match[1]) || quotedRe.test(match[1])) {
        fail(`health route: public NextResponse.json exposes sensitive key "${key}"`);
      }
    }
  }

  if (!failures.some((f) => f.startsWith("health route"))) {
    ok("health route: public JSON payload has no llm/db/provider/model keys");
  }
}

function extractFunctionBody(content, fnName) {
  const re = new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${fnName}\\s*\\(`);
  const m = content.match(re);
  if (!m || m.index == null) return null;

  let i = m.index + m[0].length;
  let parenDepth = 1;
  while (i < content.length && parenDepth > 0) {
    const ch = content[i];
    if (ch === "(") parenDepth++;
    else if (ch === ")") parenDepth--;
    i++;
  }

  const braceStart = content.indexOf("{", i);
  if (braceStart < 0) return null;

  let depth = 0;
  for (let j = braceStart; j < content.length; j++) {
    if (content[j] === "{") depth++;
    else if (content[j] === "}") {
      depth--;
      if (depth === 0) return content.slice(braceStart, j + 1);
    }
  }
  return null;
}

function checkRuneCredit() {
  const runeServicePath = path.join(ROOT, "src/lib/rune-service.ts");
  const paymentWebhook = path.join(ROOT, "src/app/api/payment/webhook/route.ts");
  const runesWebhook = path.join(ROOT, "src/app/api/runes/webhook/route.ts");

  if (!fs.existsSync(runeServicePath)) {
    fail("rune-service.ts not found");
    return;
  }

  const content = fs.readFileSync(runeServicePath, "utf8");
  const fnBody = extractFunctionBody(content, "creditRunesFromPayment");
  if (!fnBody) {
    fail("creditRunesFromPayment function body not found");
    return;
  }

  if (!/rune_packages/i.test(fnBody)) {
    fail("creditRunesFromPayment must query rune_packages");
  }
  if (/\brunesAmount\b/.test(fnBody)) {
    fail("creditRunesFromPayment must not reference runesAmount in body");
  }
  if (/metadata\.(runesAmount|amount)/.test(fnBody)) {
    fail("creditRunesFromPayment must not read metadata.runesAmount or metadata.amount");
  }

  for (const webhookPath of [paymentWebhook, runesWebhook]) {
    if (!fs.existsSync(webhookPath)) continue;
    const wh = fs.readFileSync(webhookPath, "utf8");
    const rel = path.relative(ROOT, webhookPath).replace(/\\/g, "/");
    if (/creditRunesFromPayment\s*\(\s*\{[\s\S]*?runesAmount/s.test(wh)) {
      fail(`${rel}: must not pass runesAmount to creditRunesFromPayment`);
    }
  }

  if (!failures.some((f) => f.includes("creditRunesFromPayment") || f.includes("webhook"))) {
    ok("rune credit: package lookup from DB, no metadata amount in crediting path");
  }
}

function main() {
  console.log("verify-guardrails\n");

  checkClientServerBoundary();
  checkSchema();
  checkHealthEndpoint();
  checkRuneCredit();

  console.log(`\n--- summary ---`);
  console.log(`passed: ${passes.length}`);
  console.log(`failed: ${failures.length}`);

  if (failures.length > 0) {
    console.error("\nGuardrails FAILED");
    process.exit(1);
  }

  console.log("\nGuardrails OK");
}

main();
