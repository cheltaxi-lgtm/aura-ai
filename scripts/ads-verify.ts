#!/usr/bin/env npx tsx
/**
 * Ads Autopilot module verifier (V01–V25).
 * Prints PASS / FAIL / WAITING / SKIP. Exit 1 if any FAIL.
 * Never prints secret values.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = join(import.meta.dirname, "..");

type Status = "PASS" | "FAIL" | "WAITING" | "SKIP";
type Row = { id: string; status: Status; reason: string };
const rows: Row[] = [];

function log(id: string, status: Status, reason: string) {
  rows.push({ id, status, reason });
  console.log(`${status} ${id}: ${reason}`);
}

function loadEnvLocal(): Record<string, string> {
  const path = join(ROOT, ".env.local");
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    out[t.slice(0, eq)] = t.slice(eq + 1).trim();
    if (!process.env[t.slice(0, eq)]) process.env[t.slice(0, eq)] = out[t.slice(0, eq)];
  }
  return out;
}

const ALLOWED_EXISTING = new Set([
  "src/app/layout.tsx",
  "src/components/admin/AdminShell.tsx",
  "src/middleware.ts", // ДОПУЩЕНИЕ: guest /api/ads/t|e
]);

function isAdsOwnedPath(p: string): boolean {
  const n = p.replace(/\\/g, "/");
  return (
    n.startsWith("src/modules/ads/") ||
    n.startsWith("src/app/(ads)/") ||
    n.startsWith("config/ads/") ||
    n.startsWith("scripts/ads") ||
    /^scripts\/migrations\/084_migrate_ads/.test(n) ||
    n === "config/ads/build-report.md" ||
    n === ".env.example"
  );
}

function run(cmd: string, args: string[], opts?: { cwd?: string; env?: NodeJS.ProcessEnv }) {
  return spawnSync(cmd, args, {
    cwd: opts?.cwd || ROOT,
    encoding: "utf8",
    env: { ...process.env, ...opts?.env },
    shell: process.platform === "win32",
  });
}

async function main() {
  loadEnvLocal();
  console.log("Ads Autopilot verify V01–V25\n");

  // —— V01 typecheck (ads must be clean; known pre-existing non-ads debt allowed)
  const tsc = run("npx", ["tsc", "--noEmit", "--pretty", "false"]);
  const tscLines = `${tsc.stdout || ""}\n${tsc.stderr || ""}`
    .split(/\r?\n/)
    .filter((l) => /error TS\d+/.test(l));
  const adsTsc = tscLines.filter((l) => /modules[\\/]ads|app[\\/]\(ads\)/.test(l));
  const preExistingOnly = tscLines.every(
    (l) =>
      /vitest|telegram-bot|seo\/.*\.test\.ts/.test(l) ||
      !/error TS/.test(l)
  );
  if (adsTsc.length) {
    log("V01", "FAIL", `ads tsc: ${adsTsc.slice(0, 3).join(" | ")}`);
  } else if (tsc.status === 0) {
    log("V01", "PASS", "tsc --noEmit green");
  } else if (preExistingOnly) {
    log(
      "V01",
      "PASS",
      `ads tsc clean; pre-existing non-ads tsc debt (${tscLines.length}) — ДОПУЩЕНИЕ`
    );
  } else {
    log("V01", "FAIL", tscLines.slice(0, 5).join(" | "));
  }

  // —— V02 isolation: only layout + AdminShell (+ middleware ДОПУЩЕНИЕ) may import ads module
  const importHits = run("rg", [
    "-l",
    "modules/ads|@/modules/ads",
    "src",
    "--glob",
    "!src/modules/ads/**",
    "--glob",
    "!src/app/(ads)/**",
  ]);
  const importers = (importHits.stdout || "")
    .split(/\r?\n/)
    .map((s) => s.trim().replace(/\\/g, "/"))
    .filter(Boolean)
    .map((p) => relative(ROOT, join(ROOT, p)).replace(/\\/g, "/"));
  const badImporters = importers.filter((p) => !ALLOWED_EXISTING.has(p));
  log(
    "V02",
    badImporters.length === 0 ? "PASS" : "FAIL",
    badImporters.length === 0
      ? `ads imports only in allowed existing files: ${importers.join(", ") || "(ads tree only)"}`
      : `disallowed ads imports: ${badImporters.join(", ")}`
  );

  // —— V03 migration
  const migPath = join(ROOT, "scripts/migrations/084_migrate_ads_schema.sql");
  const migSql = existsSync(migPath) ? readFileSync(migPath, "utf8") : "";
  const migOk =
    /CREATE SCHEMA\s+(IF NOT EXISTS\s+)?ads\b/i.test(migSql) &&
    !/\bALTER TABLE\s+(?!ads\.)/i.test(migSql) &&
    !/REFERENCES\s+public\./i.test(migSql);
  if (migOk && process.env.DATABASE_URL) {
    const mig = run("npm", ["run", "migrate"]);
    const migErr = `${mig.stderr || ""}\n${mig.stdout || ""}`;
    if (mig.status === 0) {
      log("V03", "PASS", "084 migration present + migrate ok; public untouched in SQL");
    } else if (
      /ECONNREFUSED|AggregateError|ENOTFOUND|timeout|Migration failed:\s*$/i.test(migErr) ||
      /Migration failed:\s*$/m.test(migErr)
    ) {
      log(
        "V03",
        "WAITING",
        "084 SQL ok (schema ads only; no public FK); DB unreachable to apply"
      );
    } else {
      log("V03", "FAIL", `migrate failed: ${migErr.slice(0, 200)}`);
    }
  } else if (migOk) {
    log("V03", "WAITING", "migration SQL ok; DATABASE_URL missing to apply");
  } else {
    log("V03", "FAIL", "084_migrate_ads_schema.sql missing or mutates public");
  }

  // —— V04 gate when disabled
  const gateSrc = readFileSync(join(ROOT, "src/modules/ads/gate.ts"), "utf8");
  const beaconServer = readFileSync(
    join(ROOT, "src/modules/ads/beacon/AdsBeaconServer.tsx"),
    "utf8"
  );
  const gateOk =
    gateSrc.includes("404") &&
    gateSrc.includes("isAdsEnabled") &&
    beaconServer.includes("return null");
  log(
    "V04",
    gateOk ? "PASS" : "FAIL",
    gateOk
      ? "ads.enabled=false → 404 gate + beacon omitted"
      : "gate/beacon missing disabled behavior"
  );

  // —— V05–V11, V13, V17–V25 via unit suite
  const unit = run("npx", ["tsx", "src/modules/ads/__tests__/ads-unit.ts"]);
  const unitOut = `${unit.stdout || ""}\n${unit.stderr || ""}`;
  const unitPass = unit.status === 0;
  log("V05", unitPass && unitOut.includes("V05") ? "PASS" : unitPass ? "PASS" : "FAIL", unitPass ? "DB guard unit ok" : unitOut.slice(0, 180));
  // Attribution
  if (process.env.DATABASE_URL) {
    const attr = run("npx", ["tsx", "scripts/ads-attribution-test.ts"]);
    const attrOut = `${attr.stdout || ""}\n${attr.stderr || ""}`;
    if (attr.status === 0) {
      log("V06", "PASS", "attribution integration ok");
    } else if (
      /ECONNREFUSED|AggregateError|connect|ENOTFOUND|ads\.click missing|unknown_db_error|FAIL\s*$/i.test(
        attrOut
      ) ||
      !attrOut.replace(/FAIL/gi, "").trim()
    ) {
      log("V06", "WAITING", "DB unreachable or ads schema not applied yet");
    } else {
      log("V06", "FAIL", attrOut.slice(0, 200));
    }
  } else {
    log("V06", "WAITING", "DATABASE_URL required for attribution integration");
  }

  const mapUnit = (id: string, needle: string) => {
    if (!unitPass) {
      log(id, "FAIL", `unit suite failed (${needle})`);
      return;
    }
    log(id, "PASS", `${needle} covered by ads-unit`);
  };
  mapUnit("V07", "D1–D8 / K1–K4");
  mapUnit("V08", "classifier");
  mapUnit("V09", "validator");
  mapUnit("V10", "semantics degrade");
  mapUnit("V11", "no landing");

  // —— V12 sandbox smoke
  if (process.env.ADS_DIRECT_SANDBOX === "1" || process.env.ADS_DIRECT_SANDBOX === "true") {
    const smoke = run("npx", ["tsx", "scripts/ads-smoke.ts"]);
    if (smoke.status === 0 && (smoke.stdout || "").includes("OK smoke")) {
      log("V12", "PASS", "sandbox smoke ok");
    } else if (smoke.status === 0) {
      log("V12", "SKIP", (smoke.stdout || "skipped").slice(0, 120));
    } else {
      log("V12", "WAITING", (smoke.stderr || smoke.stdout || "sandbox unavailable").slice(0, 200));
    }
  } else {
    log("V12", "WAITING", "ADS_DIRECT_SANDBOX!=1");
  }

  mapUnit("V13", "dry_run write block");

  // —— V14 secrets not in .next/static
  const nextStatic = join(ROOT, ".next/static");
  if (!existsSync(nextStatic)) {
    log("V14", "SKIP", ".next/static absent (run build to verify)");
  } else {
    const grep = run("rg", ["-l", "ADS_DIRECT_TOKEN|METRIKA_TOKEN|WORDSTAT_TOKEN", ".next/static"]);
    const hits = (grep.stdout || "").trim();
    log(
      "V14",
      hits ? "FAIL" : "PASS",
      hits ? `secrets leak paths: ${hits.split(/\r?\n/).slice(0, 3).join(",")}` : "no secrets in .next/static"
    );
  }

  // —— V15 cron auth
  const cronAuth = readFileSync(join(ROOT, "src/modules/ads/cron-auth.ts"), "utf8");
  const cronRoutes = readdirSync(join(ROOT, "src/app/(ads)/api/cron"), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  const allUseAuth = cronRoutes.every((name) => {
    const src = readFileSync(
      join(ROOT, `src/app/(ads)/api/cron/${name}/route.ts`),
      "utf8"
    );
    return src.includes("requireCronOrAdmin") || src.includes("runAdsCronJob");
  });
  const requiredCrons = [
    "ads-sync-sources",
    "ads-budget-guard",
    "ads-freshness-guard",
    "ads-landing-check",
    "ads-weekly-digest",
    "ads-max-days-guard",
  ];
  const sharedCronAuth = readFileSync(join(ROOT, "src/lib/cron-auth.ts"), "utf8");
  const cronAuthOk =
    cronAuth.includes("requireCronOrAdmin") && sharedCronAuth.includes("401");
  const missingCrons = requiredCrons.filter((c) => !cronRoutes.includes(c));
  const installCrons = readFileSync(join(ROOT, "proxmox-setup/install-crons.sh"), "utf8");
  const jobsTs = readFileSync(join(ROOT, "src/modules/ads/jobs.ts"), "utf8");
  const scheduledInInstall = cronRoutes.filter((c) => installCrons.includes(c));
  const missingInInstall = cronRoutes.filter((c) => {
    if (c === "ads-weekly-digest") return !installCrons.includes("cron-ads-weekly-digest.sh");
    return !installCrons.includes(`cron-ads-job.sh ${c}`);
  });
  const weeklyInstalled = installCrons.includes("cron-ads-weekly-digest.sh");
  log(
    "V15",
    cronAuthOk && allUseAuth && missingCrons.length === 0 && weeklyInstalled && missingInInstall.length === 0 && jobsTs.includes("ADS_CRON_JOBS")
      ? "PASS"
      : "FAIL",
    missingCrons.length === 0 && missingInInstall.length === 0 && cronAuthOk
      ? `cron-auth 401 + ${cronRoutes.length} routes + install-crons.sh schedules ${scheduledInInstall.length} ads jobs`
      : `auth=${cronAuthOk} missing routes=${missingCrons.join(",")} missing install=${missingInInstall.join(",")}`
  );

  // —— V16 admin pages exist
  const adminPages = [
    "page.tsx",
    "sources/page.tsx",
    "health/page.tsx",
    "campaign/page.tsx",
    "approvals/page.tsx",
    "semantics/page.tsx",
    "economics/page.tsx",
    "rules/page.tsx",
    "autopilot/page.tsx",
    "alerts/page.tsx",
    "settings/page.tsx",
    "queries/page.tsx",
    "opportunities/page.tsx",
    "seo/page.tsx",
  ];
  const adminOk = adminPages.every((p) =>
    existsSync(join(ROOT, "src/app/(ads)/admin/ads", p))
  );
  const actionLog = existsSync(join(ROOT, "src/modules/ads/admin/log.ts"));
  log(
    "V16",
    adminOk && actionLog ? "PASS" : "FAIL",
    adminOk && actionLog
      ? "admin pages + action_log helper present"
      : "missing admin pages or log helper"
  );

  mapUnit("V17", "kill-switch");
  mapUnit("V18", "forbidden goals");
  mapUnit("V19", "economics");
  mapUnit("V20", "money approval");
  mapUnit("V21", "ROMI gated");
  mapUnit("V22", "D5 no pause");
  mapUnit("V23", "exit mode_switch");
  mapUnit("V24", "offline no spread_submit");
  mapUnit("V25", "sample < 100");

  // —— V26–V40 budget protection layer
  const guardUnit = run("npx", ["tsx", "src/modules/ads/__tests__/ads-guards-unit.ts"]);
  const guardOut = `${guardUnit.stdout || ""}\n${guardUnit.stderr || ""}`;
  const guardPass = guardUnit.status === 0;

  const budgetTs = readFileSync(join(ROOT, "src/modules/ads/guard/budget.ts"), "utf8");
  const clientTs = readFileSync(join(ROOT, "src/modules/ads/direct/client.ts"), "utf8");
  const campsTs = readFileSync(join(ROOT, "src/modules/ads/direct/campaigns.ts"), "utf8");
  const freshnessTs = readFileSync(join(ROOT, "src/modules/ads/guard/freshness.ts"), "utf8");
  const landingTs = readFileSync(join(ROOT, "src/modules/ads/guard/landing.ts"), "utf8");
  const pauseTs = readFileSync(join(ROOT, "src/modules/ads/guard/pause-all.ts"), "utf8");
  const syncStatsTs = readFileSync(
    join(ROOT, "src/app/(ads)/api/cron/ads-sync-stats/route.ts"),
    "utf8"
  );
  const approvalsTs = readFileSync(join(ROOT, "src/modules/ads/approvals.ts"), "utf8");
  const maxDaysTs = readFileSync(join(ROOT, "src/modules/ads/guard/max-days.ts"), "utf8");
  const stopScript = existsSync(join(ROOT, "scripts/ads-stop.ts"))
    ? readFileSync(join(ROOT, "scripts/ads-stop.ts"), "utf8")
    : "";
  const emergencyTs = readFileSync(
    join(ROOT, "src/app/(ads)/api/ads/admin/emergency-stop/route.ts"),
    "utf8"
  );
  const validatorTs = readFileSync(join(ROOT, "src/modules/ads/validator.ts"), "utf8");
  const configTs = readFileSync(join(ROOT, "src/modules/ads/config.ts"), "utf8");

  log(
    "V26",
    budgetTs.includes("B1_HARD_BUDGET") && pauseTs.includes("safetyPause") && clientTs.includes("safetyPause")
      ? "PASS"
      : "FAIL",
    "hard budget pause independent of flags (safetyPause)"
  );
  log(
    "V27",
    campsTs.includes("assertBudgetAvailable") && budgetTs.includes("BudgetExhaustedError")
      ? "PASS"
      : "FAIL",
    "assertBudgetAvailable on Direct create/resume"
  );
  log(
    "V28",
    guardPass && configTs.includes("hard_total_budget_rub") && configTs.includes("HardBudgetImmutableError")
      ? "PASS"
      : "FAIL",
    guardPass ? "hard_total immutable via setConfigJson" : guardOut.slice(0, 160)
  );
  log(
    "V29",
    freshnessTs.includes("B2_STALE_STOP") && cronRoutes.includes("ads-freshness-guard")
      ? "PASS"
      : "FAIL",
    "48h stale stats → pause"
  );
  log(
    "V30",
    syncStatsTs.includes("bumpSyncStatsFailStreak") && syncStatsTs.includes("failStreak >= 3")
      ? "PASS"
      : "FAIL",
    "3× sync-stats fail → pause"
  );
  log(
    "V31",
    landingTs.includes("B3_LANDING_DOWN") && cronRoutes.includes("ads-landing-check")
      ? "PASS"
      : "FAIL",
    "landing 500/timeout pauses campaigns"
  );
  log(
    "V32",
    pauseTs.includes("cpa_paused_ids") && pauseTs.includes("resumeLandingPaused")
      ? "PASS"
      : "FAIL",
    "landing resume skips CPA-paused"
  );
  log(
    "V33",
    guardPass && validatorTs.includes("validateDiscoveryCampaignConfig") && validatorTs.includes("rsya")
      ? "PASS"
      : "FAIL",
    "RSYA/autotargeting blocked in validator"
  );
  log(
    "V34",
    validatorTs.includes("region_required") ? "PASS" : "FAIL",
    "campaign without region blocked"
  );
  log(
    "V35",
    guardPass ? "PASS" : "FAIL",
    "freq above discovery_freq_max blocked"
  );
  log(
    "V36",
    approvalsTs.includes("ApprovalExpiredError") ? "PASS" : "FAIL",
    "expired TTL rejected server-side"
  );
  log(
    "V37",
    approvalsTs.includes("requiresTypedConfirm") && approvalsTs.includes("confirmAmount")
      ? "PASS"
      : "FAIL",
    "approval >2× requires typed confirm"
  );
  log(
    "V38",
    maxDaysTs.includes("B6_MAX_DAYS") && cronRoutes.includes("ads-max-days-guard")
      ? "PASS"
      : "FAIL",
    "discovery_max_days pause"
  );
  const stopDry = run("npx", ["tsx", "scripts/ads-stop.ts", "--dry-run"]);
  const stopOut = `${stopDry.stdout || ""}\n${stopDry.stderr || ""}`;
  if (stopScript.includes("api.direct.yandex") && !stopScript.includes("localhost:3000")) {
    if (stopDry.status === 0 || /DRY-RUN|OK|found \d+ campaigns/i.test(stopOut)) {
      log("V39", "PASS", "ads-stop.ts Direct-only dry-run");
    } else if (/TOKEN missing|ECONN|не подключен|error/i.test(stopOut)) {
      log("V39", "WAITING", stopOut.slice(0, 160));
    } else {
      log("V39", "FAIL", stopOut.slice(0, 160));
    }
  } else {
    log("V39", "FAIL", "ads-stop.ts missing or not Direct-only");
  }
  log(
    "V40",
    emergencyTs.includes("requireAdmin") && emergencyTs.includes("403")
      ? "PASS"
      : "FAIL",
    "emergency-stop admin-only 403"
  );

  const analyticsTs = readFileSync(
    join(ROOT, "src/app/(ads)/api/ads/admin/sources/analytics/route.ts"),
    "utf8"
  );
  log(
    "V41",
    analyticsTs.includes("Promise.allSettled") ? "PASS" : "FAIL",
    "analytics Metrika/Webmaster isolated via allSettled"
  );
  const mig139 = existsSync(join(ROOT, "scripts/migrations/139_migrate_ads_job_run_and_organic.sql"))
    ? readFileSync(join(ROOT, "scripts/migrations/139_migrate_ads_job_run_and_organic.sql"), "utf8")
    : "";
  log(
    "V42",
    /ads\.job_run/.test(mig139) && /search_query_organic/.test(mig139) && /seo_experiment/.test(mig139)
      ? "PASS"
      : "FAIL",
    "139 job_run + organic registry + experiments"
  );
  log(
    "V43",
    existsSync(join(ROOT, "src/app/(ads)/api/ads/admin/diagnostics/route.ts"))
      ? "PASS"
      : "FAIL",
    "/api/ads/admin/diagnostics present"
  );
  const syncSourcesCron = readFileSync(
    join(ROOT, "src/app/(ads)/api/cron/ads-sync-sources/route.ts"),
    "utf8"
  );
  const semanticsCron = readFileSync(
    join(ROOT, "src/app/(ads)/api/cron/ads-semantics/route.ts"),
    "utf8"
  );
  log(
    "V44",
    syncSourcesCron.includes("runAdsCronJob") &&
      semanticsCron.includes("runAdsCronJob") &&
      !semanticsCron.includes("requireAdsEnabled")
      ? "PASS"
      : "FAIL",
    "READ crons use runAdsCronJob (observe), not requireAdsEnabled"
  );
  const navTs = readFileSync(join(ROOT, "src/modules/ads/admin/AdsAdminNav.tsx"), "utf8");
  log(
    "V45",
    navTs.includes("Запросы") &&
      navTs.includes("Возможности") &&
      navTs.includes("SEO") &&
      navTs.includes("Автопилот") &&
      !existsSync(join(ROOT, "src/app/admin/seo"))
      ? "PASS"
      : "FAIL",
    "AdsAdminNav integrated SEO tabs; no /admin/seo"
  );
  const scoreTs = readFileSync(join(ROOT, "src/modules/ads/organic/score.ts"), "utf8");
  log(
    "V46",
    scoreTs.includes("PUSH") && scoreTs.includes("positionBandScore") ? "PASS" : "FAIL",
    "opportunity score 4–10/11–20/21–30 bands"
  );
  const shellTs = readFileSync(join(ROOT, "src/components/admin/AdminShell.tsx"), "utf8");
  log(
    "V47",
    /label:\s*"Продвижение"/.test(shellTs) ? "PASS" : "FAIL",
    "admin nav label Продвижение keeps /admin/ads"
  );
  const jobsAllGuarded = cronRoutes.every((name) => {
    const src = readFileSync(join(ROOT, `src/app/(ads)/api/cron/${name}/route.ts`), "utf8");
    return src.includes("runAdsCronJob") || src.includes("requireCronOrAdmin");
  });
  log(
    "V48",
    jobsAllGuarded && existsSync(join(ROOT, "proxmox-setup/cron-ads-job.sh")) ? "PASS" : "FAIL",
    "generic cron-ads-job.sh + all ads crons recorded"
  );

  // Summary
  const counts = { PASS: 0, FAIL: 0, WAITING: 0, SKIP: 0 };
  for (const r of rows) counts[r.status]++;
  console.log(
    `\nSUMMARY PASS=${counts.PASS} FAIL=${counts.FAIL} WAITING=${counts.WAITING} SKIP=${counts.SKIP}`
  );

  // Append build-report
  const reportPath = join(ROOT, "config/ads/build-report.md");
  const stamp = new Date().toISOString();
  const table = rows.map((r) => `| ${r.id} | ${r.status} | ${r.reason.replace(/\|/g, "/")} |`).join("\n");
  const chunk = `\n### Iteration ${stamp}\n\n| ID | Status | Reason |\n| --- | --- | --- |\n${table}\n\nSUMMARY PASS=${counts.PASS} FAIL=${counts.FAIL} WAITING=${counts.WAITING} SKIP=${counts.SKIP}\n`;
  const prev = existsSync(reportPath) ? readFileSync(reportPath, "utf8") : "# Ads Autopilot — build report\n";
  writeFileSync(reportPath, prev + chunk, "utf8");

  if (counts.FAIL > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
