#!/usr/bin/env node
/**
 * Zovus AI harness runner — wraps existing npm/scripts. No parallel test stack.
 *
 *   node scripts/ai-harness.mjs --scope auto --level fast
 *   node scripts/ai-harness.mjs --scope matrix --level full
 *   node scripts/ai-harness.mjs --scope production --level production
 *   node scripts/ai-harness.mjs --dry-run --json
 *   node scripts/ai-harness.mjs --validate
 *   node scripts/ai-harness.mjs --record-review code --result PASS
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CHECKS, LEVELS, PATH_SCOPES, REVIEW_IDS, SCOPES, STATE_PATH } from "./ai-harness-catalog.mjs";
import { completedAllowed } from "./ai-harness-gate.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const npmBin = process.platform === "win32" ? "npm.cmd" : "npm";
const npxBin = process.platform === "win32" ? "npx.cmd" : "npx";

function parseArgs(argv) {
  const out = {
    scope: "auto",
    level: "fast",
    dryRun: false,
    json: false,
    validate: false,
    list: false,
    writeState: true,
    recordReview: null,
    reviewResult: null,
    selftestFail: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--scope") out.scope = argv[++i];
    else if (a === "--level") out.level = argv[++i];
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--json") out.json = true;
    else if (a === "--validate") out.validate = true;
    else if (a === "--list") out.list = true;
    else if (a === "--no-state") out.writeState = false;
    else if (a === "--record-review") out.recordReview = argv[++i];
    else if (a === "--result") out.reviewResult = argv[++i];
    else if (a === "--selftest-fail") out.selftestFail = true;
  }
  return out;
}

function gitLines(args) {
  const r = spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });
  if (r.status !== 0) return [];
  return String(r.stdout || "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parsePorcelain(line) {
  if (!line || line.length < 4) return "";
  const rest = line.slice(3);
  const renamed = rest.includes(" -> ") ? rest.split(" -> ").pop() : rest;
  return String(renamed || "").replace(/\\/g, "/").trim();
}

export function detectScopes(files) {
  const hit = new Set();
  for (const file of files) {
    const rel = String(file).replace(/\\/g, "/");
    for (const id of PATH_SCOPES) {
      if (SCOPES[id].paths.test(rel)) hit.add(id);
    }
  }
  if (hit.size === 0) return ["full"];
  if (hit.has("harness") && hit.size === 1) return ["harness"];
  hit.delete("harness");
  if (hit.size >= 3) return ["full"];
  return [...hit];
}

function dirtyFiles() {
  const r = spawnSync("git", ["status", "--porcelain"], { cwd: ROOT, encoding: "utf8" });
  if (r.status !== 0) return [];
  return String(r.stdout || "")
    .split(/\r?\n/)
    .filter(Boolean)
    .map(parsePorcelain)
    .filter(Boolean);
}

function changedFiles() {
  const dirty = dirtyFiles();
  const vsMain = gitLines(["diff", "--name-only", "origin/main...HEAD"]);
  const vsHead = gitLines(["diff", "--name-only", "HEAD"]);
  return [...new Set([...dirty, ...vsMain, ...vsHead])];
}

function resolvePlan(scopeArg, level, files) {
  if (!LEVELS.includes(level)) {
    throw new Error(`Unknown level ${level}. Use ${LEVELS.join("|")}`);
  }
  const scopes = scopeArg === "auto" ? detectScopes(files) : [scopeArg];
  for (const s of scopes) {
    if (!SCOPES[s]) throw new Error(`Unknown scope ${s}`);
  }
  const ids = [];
  const seen = new Set();
  for (const s of scopes) {
    const spec = SCOPES[s];
    const list = [
      ...(spec[level] || spec.fast),
      ...(level === "production" ? spec.production : []),
    ];
    if (level === "production" && spec.full) {
      for (const id of spec.full) {
        if (!list.includes(id)) list.unshift(id);
      }
    }
    for (const id of list) {
      if (seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
    }
  }
  const productionRequired = ids.includes("prod-health") || ids.includes("prod-smoke");
  return { scopes, checkIds: ids, productionRequired };
}

function expandCmd(check) {
  if (check.npm) return { bin: npmBin, args: ["run", check.npm], cwd: ROOT };
  if (check.cmd) {
    const [bin0, ...rest] = check.cmd;
    const bin = bin0 === "npm" ? npmBin : bin0 === "npx" ? npxBin : bin0;
    const cwd = check.cwd ? path.join(ROOT, check.cwd) : ROOT;
    return { bin, args: rest, cwd };
  }
  if (check.vitest) {
    return {
      bin: npxBin,
      args: ["vitest", "run", ...check.vitest],
      cwd: ROOT,
    };
  }
  return null;
}

function runSpawn({ bin, args, cwd }) {
  const r = spawnSync(bin, args, {
    cwd,
    encoding: "utf8",
    shell: process.platform === "win32",
    env: { ...process.env, TZ: "UTC" },
  });
  const stdout = `${r.stdout || ""}${r.stderr || ""}`;
  const status = typeof r.status === "number" ? r.status : 1;
  return { status, stdout };
}

async function runBuiltin(id, scopes) {
  if (id === "validate") return validateCatalog();
  if (id === "prod-health") return prodHealth();
  if (id === "prod-smoke") return prodSmoke(scopes);
  throw new Error(`Unknown builtin ${id}`);
}

export async function validateCatalog() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const scripts = pkg.scripts || {};
  const missing = [];
  for (const [id, check] of Object.entries(CHECKS)) {
    if (check.npm && !scripts[check.npm]) missing.push(`${id} → npm run ${check.npm}`);
    if (check.cwd) {
      const cwd = path.join(ROOT, check.cwd);
      if (!fs.existsSync(cwd)) missing.push(`${id} → missing cwd ${check.cwd}`);
    }
  }
  for (const scope of Object.keys(SCOPES)) {
    for (const level of LEVELS) {
      for (const id of SCOPES[scope][level] || []) {
        if (!CHECKS[id]) missing.push(`${scope}.${level} → unknown check ${id}`);
      }
    }
  }
  if (missing.length) {
    return { status: 1, stdout: `catalog invalid:\n${missing.join("\n")}` };
  }
  return { status: 0, stdout: "catalog ok" };
}

async function fetchStatus(url) {
  const res = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(15000),
    headers: { "user-agent": "zovus-ai-harness" },
  });
  return res.status;
}

function allowedProdUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && (u.hostname === "zovus.ru" || u.hostname.endsWith(".zovus.ru"));
  } catch {
    return false;
  }
}

async function prodHealth() {
  const url = process.env.ZOVUS_PROD_HEALTH_URL || "https://zovus.ru/api/health";
  if (!allowedProdUrl(url)) {
    return { status: "partial", stdout: `prod health URL not allowlisted: ${url}` };
  }
  try {
    const code = await fetchStatus(url);
    if (code !== 200) return { status: 1, stdout: `health ${url} → ${code}` };
    return { status: 0, stdout: `health ${url} → 200` };
  } catch (err) {
    return { status: "partial", stdout: `cannot reach ${url}: ${err.message}` };
  }
}

async function prodSmoke(scopes) {
  const urls = new Set();
  for (const s of scopes) {
    for (const u of SCOPES[s].smokeUrls || []) urls.add(u);
  }
  if (!urls.size) return { status: 0, stdout: "no smoke urls" };
  const rows = [];
  let partial = false;
  let fail = false;
  for (const url of urls) {
    try {
      const code = await fetchStatus(url);
      const ok = code >= 200 && code < 400;
      rows.push(`${ok ? "PASS" : "FAIL"} ${code} ${url}`);
      if (!ok) fail = true;
    } catch (err) {
      rows.push(`PARTIAL ${url}: ${err.message}`);
      partial = true;
    }
  }
  if (fail) return { status: 1, stdout: rows.join("\n") };
  if (partial) return { status: "partial", stdout: rows.join("\n") };
  return { status: 0, stdout: rows.join("\n") };
}

function classifySkip(stdout) {
  const text = String(stdout || "");
  if (/Executable doesn't exist|playwright.*browser/i.test(text)) {
    return "Playwright browsers not installed (`npx playwright install chromium`)";
  }
  if (/ECONNREFUSED|ENOTFOUND|ETIMEDOUT|network/i.test(text) && /zovus\.ru|prod-health|prod-smoke/.test(text)) {
    return text.slice(0, 300);
  }
  return null;
}

function readState() {
  const p = path.join(ROOT, STATE_PATH);
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return {};
  }
}

function writeState(state) {
  const p = path.join(ROOT, STATE_PATH);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, `${JSON.stringify(state, null, 2)}\n`);
}

function headSha() {
  const r = spawnSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" });
  return String(r.stdout || "").trim() || "unknown";
}

async function runCheck(id, scopes) {
  const check = CHECKS[id];
  if (!check) return { id, status: "FAIL", reason: `unknown check ${id}` };
  const started = Date.now();
  let result;
  if (check.builtin) result = await runBuiltin(check.builtin, scopes);
  else result = runSpawn(expandCmd(check));
  const durationMs = Date.now() - started;
  if (result.status === "partial") {
    return { id, title: check.title, status: "PARTIAL", durationMs, reason: result.stdout };
  }
  if (result.status === 0) {
    return { id, title: check.title, status: "PASS", durationMs };
  }
  const skip = classifySkip(result.stdout);
  if (skip) {
    return { id, title: check.title, status: "PARTIAL", durationMs, reason: skip };
  }
  const tail = String(result.stdout || "").trim().split(/\r?\n/).slice(-12).join("\n");
  return { id, title: check.title, status: "FAIL", durationMs, reason: tail || `exit ${result.status}` };
}

function verdictOf(rows, productionRequired) {
  if (rows.some((r) => r.status === "FAIL")) return "FAIL";
  if (rows.some((r) => r.status === "PARTIAL")) return "PARTIAL";
  if (rows.some((r) => r.status === "pending" || r.status === "not_run")) return "PARTIAL";
  if (!rows.length) return "PARTIAL";
  void productionRequired;
  return "PASS";
}

function productionOf(rows, required) {
  if (!required) return "NOT_REQUIRED";
  const health = rows.find((r) => r.id === "prod-health");
  const smoke = rows.find((r) => r.id === "prod-smoke");
  const relevant = [health, smoke].filter(Boolean);
  if (!relevant.length) return "FAIL";
  if (relevant.some((r) => r.status === "FAIL")) return "FAIL";
  if (relevant.some((r) => r.status === "PARTIAL")) return "PARTIAL";
  if (relevant.every((r) => r.status === "PASS")) return "PASS";
  return "FAIL";
}

async function recordReview(id, result) {
  if (!REVIEW_IDS.includes(id)) throw new Error(`Unknown review ${id}`);
  if (!["PASS", "FAIL", "PARTIAL"].includes(result)) throw new Error("result must be PASS|FAIL|PARTIAL");
  const state = readState();
  state.reviews = { ...(state.reviews || {}), [id]: result };
  state.updatedAt = new Date().toISOString();
  writeState(state);
  return state;
}

function printHuman(state) {
  console.log(`SCOPE: ${state.scopes.join(",")}`);
  console.log(`LEVEL: ${state.level}`);
  console.log(`VERDICT: ${state.verdict}`);
  console.log(`PRODUCTION: ${state.production}`);
  console.log(`COMPLETED: ${completedAllowed(state) ? "allowed" : "blocked"}`);
  for (const row of state.checks || []) {
    const extra = row.reason ? ` — ${String(row.reason).split("\n")[0]}` : "";
    console.log(`  ${row.status.padEnd(8)} ${row.id}${extra}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.list) {
    for (const [id, spec] of Object.entries(SCOPES)) {
      console.log(`${id}: ${spec.title}`);
      for (const level of LEVELS) console.log(`  ${level}: ${(spec[level] || []).join(", ") || "(none)"}`);
    }
    process.exit(0);
  }
  if (args.validate) {
    const v = await validateCatalog();
    console.log(v.stdout);
    process.exit(v.status === 0 ? 0 : 1);
  }
  if (args.recordReview) {
    const state = await recordReview(args.recordReview, args.reviewResult);
    if (args.json) console.log(JSON.stringify(state, null, 2));
    else console.log(`review ${args.recordReview}=${args.reviewResult}`);
    process.exit(0);
  }

  const files = changedFiles();
  const plan = resolvePlan(args.scope, args.level, files);
  let checkIds = plan.checkIds;
  if (args.selftestFail) checkIds = ["__selftest_fail__", ...checkIds];

  if (args.dryRun) {
    const payload = { scopes: plan.scopes, level: args.level, checks: checkIds, productionRequired: plan.productionRequired };
    if (args.json) console.log(JSON.stringify(payload, null, 2));
    else {
      console.log(`SCOPE: ${plan.scopes.join(",")}`);
      console.log(`LEVEL: ${args.level}`);
      console.log(`PRODUCTION_REQUIRED: ${plan.productionRequired}`);
      for (const id of checkIds) console.log(`  ${id}`);
    }
    process.exit(0);
  }

  const rows = [];
  for (const id of checkIds) {
    if (id === "__selftest_fail__") {
      rows.push({ id, title: "selftest-fail", status: "FAIL", durationMs: 0, reason: "injected" });
      continue;
    }
    console.error(`[harness] ${id}…`);
    const row = await runCheck(id, plan.scopes);
    rows.push(row);
    console.error(`[harness] ${row.status} ${id}${row.reason ? ` — ${String(row.reason).split("\n")[0]}` : ""}`);
  }

  const verdict = verdictOf(rows, plan.productionRequired);
  const production = productionOf(rows, plan.productionRequired);
  const state = {
    version: 1,
    updatedAt: new Date().toISOString(),
    scope: args.scope,
    scopes: plan.scopes,
    level: args.level,
    verdict,
    production,
    productionRequired: plan.productionRequired,
    requiredChecks: checkIds.filter((id) => id !== "__selftest_fail__"),
    checks: rows,
    reviews: readState().reviews || {},
    head: headSha(),
    files: files.slice(0, 80),
  };
  if (args.writeState) writeState(state);
  if (args.json) console.log(JSON.stringify(state, null, 2));
  else printHuman(state);
  process.exit(verdict === "PASS" ? 0 : 1);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export { resolvePlan, verdictOf };
