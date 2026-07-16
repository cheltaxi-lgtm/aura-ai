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
  "idx_rune_transactions_refund_once",
  "idx_user_accounts_unlimited",
  "idx_user_achievements_user",
  "idx_payments_referrer",
  "idx_natal_report_history_user_created",
  "idx_natal_report_history_charge",
  "idx_natal_timing_cache_user_generated",
  "idx_natal_event_preferences_due",
  "idx_natal_event_delivery_log_delivered",
  "idx_private_report_shares_owner",
  "idx_private_report_shares_active_token",
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

function walkTextFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    if (SKIP_DIRS.has(name) || name === ".git") continue;
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      walkTextFiles(full, out);
    } else if (
      /\.(?:bash|conf|env|example|js|json|jsx|md|mjs|service|sh|sql|toml|ts|tsx|yaml|yml)$/i.test(name)
    ) {
      out.push(full);
    }
  }
  return out;
}

function sourceLine(content, index) {
  return content.slice(0, index).split(/\r?\n/).length;
}

function checkRepositorySecrets() {
  const scanRoots = ["src", "scripts", "hosting", "proxmox-setup", ".github"];
  const files = scanRoots.flatMap((dir) => walkTextFiles(path.join(ROOT, dir)));
  const envExample = path.join(ROOT, ".env.example");
  if (fs.existsSync(envExample)) files.push(envExample);

  const providerKeyPatterns = [
    ["OpenRouter", /\bsk-or-v1-[A-Za-z0-9_-]{16,}\b/g],
    ["OpenAI-style", /\bsk-(?!or-v1-|ant-)(?:proj-)?[A-Za-z0-9_-]{20,}\b/g],
    ["Anthropic", /\bsk-ant-[A-Za-z0-9_-]{16,}\b/g],
    ["Google AI", /\bAIza[0-9A-Za-z_-]{20,}\b/g],
    ["Groq", /\bgsk_[A-Za-z0-9_-]{16,}\b/g],
    ["Hugging Face", /\bhf_[A-Za-z0-9]{20,}\b/g],
  ];

  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    const rel = path.relative(ROOT, file).replace(/\\/g, "/");
    for (const [provider, pattern] of providerKeyPatterns) {
      pattern.lastIndex = 0;
      for (const match of content.matchAll(pattern)) {
        fail(`secret scan: ${provider} credential pattern in ${rel}:${sourceLine(content, match.index)}`);
      }
    }
  }

  const deployFiles = ["hosting", "proxmox-setup", "scripts"]
    .flatMap((dir) => walkTextFiles(path.join(ROOT, dir)))
    .filter((file) => /\.(?:bash|sh)$/i.test(file));
  const assignmentPattern =
    /^\s*(?:export\s+|readonly\s+|local\s+)?([A-Z][A-Z0-9_]*(?:API_KEY|PASSWORD|SECRET|TOKEN))\s*=\s*(.*)$/;
  const emittedAssignmentPattern =
    /\b(?:echo|printf)\b.*?["']([A-Z][A-Z0-9_]*(?:API_KEY|PASSWORD|SECRET|TOKEN))=([^"']+)["']/;
  const safePlaceholder =
    /^(?:|["']{2}|<[^>]+>|\.\.\.|change[-_ ]?me.*|dummy.*|example.*|placeholder.*|test[-_ ].*|your[-_ ].*)$/i;

  function isSafeSecretValue(rawValue) {
    const value = rawValue.trim().replace(/^(['"])(.*)\1$/, "$2").trim();
    return value.startsWith("$") || safePlaceholder.test(value);
  }

  for (const file of deployFiles) {
    const rel = path.relative(ROOT, file).replace(/\\/g, "/");
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
    lines.forEach((line, index) => {
      const match = line.match(assignmentPattern);
      if (match && !isSafeSecretValue(match[2])) {
        fail(`secret scan: hardcoded ${match[1]} assignment in ${rel}:${index + 1}`);
      }

      const emitted = line.match(emittedAssignmentPattern);
      const dynamicPrintf =
        emitted &&
        /^%s(?:\\n)?$/.test(emitted[2]) &&
        line.includes(`"$${emitted[1]}"`);
      if (emitted && !dynamicPrintf && !isSafeSecretValue(emitted[2])) {
        fail(`secret scan: hardcoded emitted ${emitted[1]} assignment in ${rel}:${index + 1}`);
      }
    });
  }

  if (!failures.some((item) => item.startsWith("secret scan:"))) {
    ok(`secret scan: ${files.length} source/config files and ${deployFiles.length} deploy scripts checked`);
  }
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
  const startMatch = new RegExp(
    `create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?${tableName}\\s*\\(`,
    "i"
  ).exec(sql);
  if (!startMatch || startMatch.index == null) return "";

  const open = startMatch.index + startMatch[0].lastIndexOf("(");
  let depth = 0;
  let inSingleQuote = false;
  for (let index = open; index < sql.length; index++) {
    const char = sql[index];
    if (char === "'" && sql[index - 1] !== "\\") {
      if (inSingleQuote && sql[index + 1] === "'") {
        index++;
        continue;
      }
      inSingleQuote = !inSingleQuote;
      continue;
    }
    if (inSingleQuote) continue;
    if (char === "(") depth++;
    if (char === ")" && --depth === 0) {
      return sql.slice(open + 1, index);
    }
  }
  return "";
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

  const natalHistoryBlock = extractCreateTableBlock(sql, "natal_report_history");
  if (!natalHistoryBlock) {
    fail("schema.sql: CREATE TABLE natal_report_history block not found");
  } else {
    for (const col of [
      "user_id",
      "birth_fingerprint",
      "engine_version",
      "ephemeris",
      "tradition",
      "report_type",
      "content",
      "structured_data",
      "evidence_refs",
      "rune_cost",
      "charge_transaction_id",
      "claim_token",
    ]) {
      if (!natalHistoryBlock.includes(col)) {
        fail(`schema.sql: natal_report_history.${col} missing in CREATE TABLE`);
      }
    }
  }

  const runeTransactionsBlock = extractCreateTableBlock(sql, "rune_transactions");
  if (!runeTransactionsBlock.includes("refund_of_transaction_id")) {
    fail("schema.sql: rune_transactions.refund_of_transaction_id missing in CREATE TABLE");
  }

  const jointBlock = extractCreateTableBlock(sql, "joint_readings");
  if (!jointBlock || !jointBlock.includes("synastry_data")) {
    fail("schema.sql: joint_readings.synastry_data missing in CREATE TABLE");
  }

  const privateSharesBlock = extractCreateTableBlock(sql, "private_report_shares");
  if (!privateSharesBlock) {
    fail("schema.sql: CREATE TABLE private_report_shares block not found");
  } else {
    for (const col of ["owner_user_id", "token", "report_kind", "report_id", "selected_sections", "public_payload", "expires_at", "revoked_at"]) {
      if (!privateSharesBlock.includes(col)) fail(`schema.sql: private_report_shares.${col} missing`);
    }
    if (!privateSharesBlock.includes("length(token) >= 43")) {
      fail("schema.sql: private report share token entropy bound missing");
    }
  }
  const privateShareMigrationPath = path.join(ROOT, "scripts/migrations/067_migrate_private_report_shares.sql");
  if (!fs.existsSync(privateShareMigrationPath)) {
    fail("schema.sql: migration 067_migrate_private_report_shares.sql not found");
  }

  for (const table of ["natal_timing_cache", "natal_event_preferences", "natal_event_delivery_log"]) {
    if (!extractCreateTableBlock(sql, table)) {
      fail(`schema.sql: CREATE TABLE ${table} block not found`);
    }
  }
  if (!sql.includes("horizon_days in (7, 30, 90, 365)")) {
    fail("schema.sql: natal timing horizon bound missing");
  }
  const timingMigrationPath = path.join(ROOT, "scripts/migrations/065_migrate_natal_timing.sql");
  if (!fs.existsSync(timingMigrationPath)) {
    fail("schema.sql: migration 065_migrate_natal_timing.sql not found");
  } else {
    const timingMigration = fs.readFileSync(timingMigrationPath, "utf8").toLowerCase();
    for (const token of [
      "natal_timing_cache",
      "natal_event_preferences",
      "natal_event_delivery_log",
      "horizon_days in (7, 30, 90, 365)",
      "on conflict (user_id) do nothing",
    ]) {
      if (!timingMigration.includes(token)) {
        fail(`schema.sql: timing migration missing ${token}`);
      }
    }
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

function checkNatalEvidenceAi() {
  const routePath = path.join(ROOT, "src/app/api/natal-chart/interpretation/route.ts");
  const contextPath = path.join(ROOT, "src/lib/prompts/natal-context.ts");
  const readingPath = path.join(ROOT, "src/app/api/reading/route.ts");
  const chatPath = path.join(ROOT, "src/lib/services/chat-orchestrator.ts");
  const preferencesPath = path.join(ROOT, "src/lib/services/natal-ai-preferences-service.ts");
  const workspacePath = path.join(ROOT, "src/components/natal/AstrologyWorkspace.tsx");
  const settingsPath = path.join(ROOT, "src/components/natal/NatalSettings.tsx");
  const migrationPath = path.join(ROOT, "scripts/migrations/066_migrate_natal_ai_preferences.sql");
  for (const file of [
    routePath, contextPath, readingPath, chatPath, preferencesPath, workspacePath, settingsPath, migrationPath,
  ]) {
    if (!fs.existsSync(file)) fail(`natal evidence guardrail missing ${path.relative(ROOT, file)}`);
  }
  if (failures.some((item) => item.startsWith("natal evidence guardrail missing"))) return;

  const route = fs.readFileSync(routePath, "utf8");
  const generatorPath = path.join(ROOT, "src/lib/natal/generate-validated-report.ts");
  const generator = fs.existsSync(generatorPath) ? fs.readFileSync(generatorPath, "utf8") : "";
  const validationFailed = route.indexOf("!generated.ok");
  const rollback = route.indexOf("await rollback();", validationFailed);
  const release = route.indexOf("releaseNatalInterpretationClaim");
  if (!(route.includes("generateValidatedNatalReport") && validationFailed >= 0 && rollback > validationFailed)) {
    fail("natal report: validate, one repair pass, then rollback ordering is missing");
  }
  if (!(release >= 0 && /finally\s*\{[\s\S]*releaseNatalInterpretationClaim/.test(route))) {
    fail("natal report: claim must be released in finally");
  }
  if (
    (!generator.includes("jsonObject: true") && !generator.includes("completeChatDetailed")) ||
    !generator.includes("getNatalModel") ||
    generator.includes('fallback: "minimal"') ||
    generator.includes('fallback: "salvage"') ||
    !route.includes("evidenceRefs: evidence")
  ) {
    fail("natal report: natal model, strict JSON, no salvage/minimal success path required");
  }

  const context = fs.readFileSync(contextPath, "utf8");
  const reading = fs.readFileSync(readingPath, "utf8");
  const chat = fs.readFileSync(chatPath, "utf8");
  const preferences = fs.readFileSync(preferencesPath, "utf8");
  const workspace = fs.readFileSync(workspacePath, "utf8");
  const settings = fs.readFileSync(settingsPath, "utf8");
  const migration = fs.readFileSync(migrationPath, "utf8");
  if (!context.includes("scopeNatalEvidence") || !context.includes("params.topic")) {
    fail("natal chat: evidence context must be relevance-scoped");
  }
  if (
    !chat.includes('purpose: "chat"') ||
    !context.includes("isNatalContextEnabled") ||
    !context.includes("params.purpose") ||
    !preferences.includes("ai_context_enabled")
  ) {
    fail("natal chat: purpose-specific server-side opt-in enforcement missing");
  }
  if (
    !reading.includes('purpose: "tarot"') ||
    !context.includes("isNatalContextEnabled") ||
    !preferences.includes("tarot_context_enabled")
  ) {
    fail("tarot natal context: server-side opt-in enforcement missing");
  }
  if (
    !/ai_context_enabled\s+boolean\s+not\s+null\s+default\s+false/i.test(migration) ||
    !/tarot_context_enabled\s+boolean\s+not\s+null\s+default\s+false/i.test(migration) ||
    /\binsert\s+into\s+natal_ai_preferences\b/i.test(migration)
  ) {
    fail("natal AI context: migration must keep chat and tarot consent default-off");
  }
  const ackIdx = route.indexOf("body.aiDataUseAcknowledged !== true");
  // Prefer call-site markers so import lines do not precede the acknowledgment guard.
  const chargeIdx = Math.max(
    route.indexOf("await BillingService.chargeRuneAction("),
    route.indexOf("await chargeRuneActionForWorkerJob(")
  );
  if (
    !settings.includes("aiContextEnabled") ||
    !settings.includes("tarotContextEnabled") ||
    !workspace.includes("aiDataUseAcknowledged: true") ||
    ackIdx < 0 ||
    chargeIdx < 0 ||
    ackIdx > chargeIdx
  ) {
    fail("natal AI context: separate controls and paid-report disclosure acknowledgment required");
  }
  if (!failures.some((item) => item.startsWith("natal report:") || item.startsWith("natal chat:") || item.startsWith("tarot natal context:") || item.startsWith("natal AI context:"))) {
    ok("natal evidence AI: validation, repair/refund, scoping, and opt-in enforced");
  }
}

function checkNatalShareAndNotificationConsent() {
  const pagePath = path.join(ROOT, "src/app/reports/shared/[token]/page.tsx");
  const publicRoutePath = path.join(ROOT, "src/app/api/public/reports/[token]/route.ts");
  const shareServicePath = path.join(ROOT, "src/lib/services/public-report-share-service.ts");
  const middlewarePath = path.join(ROOT, "src/middleware.ts");
  const timingServicePath = path.join(ROOT, "src/lib/services/natal-timing-service.ts");
  const migration065Path = path.join(ROOT, "scripts/migrations/065_migrate_natal_timing.sql");
  const migration068Path = path.join(ROOT, "scripts/migrations/068_harden_natal_backend.sql");
  const required = [
    pagePath, publicRoutePath, shareServicePath, middlewarePath, timingServicePath, migration065Path, migration068Path,
  ];
  for (const file of required) {
    if (!fs.existsSync(file)) fail(`natal security regression: missing ${path.relative(ROOT, file)}`);
  }
  if (required.some((file) => !fs.existsSync(file))) return;

  const page = fs.readFileSync(pagePath, "utf8");
  const publicRoute = fs.readFileSync(publicRoutePath, "utf8");
  const shareService = fs.readFileSync(shareServicePath, "utf8");
  const middleware = fs.readFileSync(middlewarePath, "utf8");
  if (
    page.includes("next/headers") ||
    /\bheaders\s*\(/.test(page) ||
    /\bfetch\s*\(/.test(page) ||
    /x-forwarded-proto|\.get\(\s*["']host["']\s*\)/i.test(page)
  ) {
    fail("natal security regression: shared report page must not derive an SSR fetch origin from request headers");
  }
  if (
    !page.includes("getActivePublicReportShare") ||
    !publicRoute.includes("getActivePublicReportShare") ||
    !shareService.includes("revoked_at IS NULL") ||
    !shareService.includes("expires_at > NOW()") ||
    !shareService.includes("isHighEntropyShareToken")
  ) {
    fail("natal security regression: page and public API must share active, token-validated DB lookup");
  }
  if (
    !middleware.includes('"/api/public/reports/"') ||
    middleware.includes('"/api/public/"') ||
    middleware.includes('"/api/public"')
  ) {
    fail("natal security regression: middleware must expose only the public reports API prefix");
  }
  if (
    !publicRoute.includes("enforcePaidRouteRateLimit") ||
    !publicRoute.includes('"Cache-Control": "private, no-store"') ||
    !publicRoute.includes('"X-Robots-Tag": "noindex, nofollow"') ||
    !/\{\s*error:\s*["']not_found["']\s*\}[\s\S]{0,100}status:\s*404/.test(publicRoute) ||
    !shareService.includes("SELECT public_payload, expires_at")
  ) {
    fail("natal security regression: public report API must rate-limit and return sanitized no-store/noindex payloads with safe 404s");
  }

  const schema = fs.readFileSync(path.join(ROOT, "src/lib/schema.sql"), "utf8");
  const timingService = fs.readFileSync(timingServicePath, "utf8");
  const migration065 = fs.readFileSync(migration065Path, "utf8");
  const migration068 = fs.readFileSync(migration068Path, "utf8");
  if (
    !/CREATE TABLE IF NOT EXISTS natal_event_preferences[\s\S]*?enabled BOOLEAN NOT NULL DEFAULT FALSE/i.test(schema) ||
    !/CREATE TABLE IF NOT EXISTS natal_event_preferences[\s\S]*?enabled BOOLEAN NOT NULL DEFAULT FALSE/i.test(migration065) ||
    !/SELECT user_id,\s*FALSE,/i.test(migration065) ||
    !/const DEFAULT_PREFS[\s\S]*?enabled:\s*false/i.test(timingService)
  ) {
    fail("natal consent regression: event notifications must default off in schema, migration, and service");
  }
  if (
    !/ALTER COLUMN enabled SET DEFAULT FALSE/i.test(migration068) ||
    !/WHERE enabled = TRUE\s+AND updated_at = created_at/i.test(migration068)
  ) {
    fail("natal consent regression: 068 must disable only untouched legacy backfill preferences");
  }

  if (!failures.some((item) =>
    item.startsWith("natal security regression:") || item.startsWith("natal consent regression:")
  )) {
    ok("natal share and notification consent: no header-derived fetch, default-off preferences enforced");
  }
}

function checkNatalDeploySafety() {
  const requiredMigrations = [
    "064_migrate_natal_report_history.sql",
    "065_migrate_natal_timing.sql",
    "066_migrate_natal_ai_preferences.sql",
    "067_migrate_private_report_shares.sql",
    "068_harden_natal_backend.sql",
  ];
  const requiredRoutes = [
    "src/app/api/cron/natal-transits/route.ts",
    "src/app/api/natal-chart/ai-preferences/route.ts",
    "src/app/api/natal-chart/event-preferences/route.ts",
    "src/app/api/natal-chart/history/route.ts",
    "src/app/api/natal-chart/interpretation/route.ts",
    "src/app/api/natal-chart/route.ts",
    "src/app/api/natal-chart/timing/route.ts",
    "src/app/api/public/reports/[token]/route.ts",
    "src/app/api/report-shares/[id]/route.ts",
    "src/app/api/report-shares/route.ts",
  ];
  for (const migration of requiredMigrations) {
    if (!fs.existsSync(path.join(ROOT, "scripts", "migrations", migration))) {
      fail(`natal deploy: missing migration ${migration}`);
    }
  }
  for (const route of requiredRoutes) {
    if (!fs.existsSync(path.join(ROOT, route))) {
      fail(`natal deploy: missing route ${route}`);
    }
  }

  const migratePath = path.join(ROOT, "scripts/migrate.mjs");
  const migrate = fs.readFileSync(migratePath, "utf8");
  if (
    !/BASELINE_MAX_VERSION\s*=\s*63\b/.test(migrate) ||
    !/version\s*<=\s*BASELINE_MAX_VERSION/.test(migrate) ||
    !/Protected pending migrations require SQL execution/.test(migrate)
  ) {
    fail("natal deploy: migration baseline must be explicitly capped at 063");
  }
  for (const migration of requiredMigrations) {
    if (new RegExp(`(?:baseline|allowlist)[\\s\\S]{0,300}${migration}`, "i").test(migrate)) {
      fail(`natal deploy: protected migration may be baselined: ${migration}`);
    }
  }

  const schemaCheckPath = path.join(ROOT, "scripts/verify-natal-deploy-schema.mjs");
  if (!fs.existsSync(schemaCheckPath)) {
    fail("natal deploy: post-migrate schema checker missing");
  } else {
    const schemaCheck = fs.readFileSync(schemaCheckPath, "utf8");
    for (const item of [...requiredMigrations, "natal_report_history", "natal_timing_cache", "natal_event_preferences", "natal_event_delivery_log", "natal_ai_preferences", "private_report_shares"]) {
      if (!schemaCheck.includes(item)) fail(`natal deploy: schema checker missing ${item}`);
    }
  }

  const deployPath = path.join(ROOT, "proxmox-setup/vm_local_deploy.sh");
  const deploy = fs.readFileSync(deployPath, "utf8");
  const testsAt = deploy.indexOf("npm test");
  const buildAt = deploy.indexOf("NEXT_DIST_DIR=.next-candidate npm run build");
  const migrateAt = deploy.indexOf("scripts/migrate.mjs");
  const schemaAt = deploy.indexOf("scripts/verify-natal-deploy-schema.mjs");
  const switchAt = deploy.indexOf("mv .next-candidate .next");
  if (!(testsAt >= 0 && testsAt < buildAt && buildAt < switchAt)) {
    fail("natal deploy: npm test and one candidate build must finish before service switch");
  }
  if ((deploy.match(/NEXT_DIST_DIR=\.next-candidate npm run build/g) ?? []).length !== 1) {
    fail("natal deploy: candidate .next build must run exactly once");
  }
  if (!(migrateAt >= 0 && migrateAt < schemaAt && schemaAt < switchAt)) {
    fail("natal deploy: migration records/schema must be verified before service switch");
  }
  if (
    deploy.includes("npm run build:geonames") ||
    !deploy.includes("verify_geonames_index") ||
    !deploy.includes("/api/cron/natal-transits") ||
    !deploy.includes("natal_cron_installed=1")
  ) {
    fail("natal deploy: packaged GeoNames and installed/authenticated natal cron gates are required");
  }
  if (/echo[^\n]*\$_CRON_SECRET/.test(deploy)) {
    fail("natal deploy: cron secret must never be printed");
  }

  const packer = fs.readFileSync(path.join(ROOT, "hosting/deploy-beget.ps1"), "utf8");
  for (const item of [...requiredMigrations, ...requiredRoutes, "cities.min.json"]) {
    if (!packer.includes(item)) fail(`natal deploy: workspace preflight missing ${item}`);
  }
  if (!packer.includes("Required deploy artifacts:")) {
    fail("natal deploy: workspace preflight must list/count required artifacts");
  }

  if (!failures.some((item) => item.startsWith("natal deploy:"))) {
    ok("natal deploy: migrations, artifacts, candidate tests/build, GeoNames, and cron gated");
  }
}

function main() {
  console.log("verify-guardrails\n");

  checkRepositorySecrets();
  checkClientServerBoundary();
  checkSchema();
  checkHealthEndpoint();
  checkRuneCredit();
  checkNatalEvidenceAi();
  checkNatalShareAndNotificationConsent();
  checkNatalDeploySafety();

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
