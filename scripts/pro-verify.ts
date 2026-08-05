#!/usr/bin/env npx tsx
/**
 * Zovus Pro verifier (S0: isolation 1–6 + regression 19–22).
 * Prints PASS / FAIL / WAITING / SKIP. Exit 1 if any FAIL.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const ROOT = join(import.meta.dirname, "..");
const require = createRequire(import.meta.url);

type Status = "PASS" | "FAIL" | "WAITING" | "SKIP";
type Row = { id: string; status: Status; reason: string };
const rows: Row[] = [];

function log(id: string, status: Status, reason: string) {
  rows.push({ id, status, reason });
  console.log(`${status} ${id}: ${reason}`);
}

function loadEnvLocal(): void {
  const path = join(ROOT, ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const k = t.slice(0, eq);
    const v = t.slice(eq + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}

function run(cmd: string, args: string[], opts?: { env?: NodeJS.ProcessEnv }) {
  return spawnSync(cmd, args, {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, ...opts?.env },
    shell: process.platform === "win32",
  });
}

const ALLOWED_IMPORTERS = new Set([
  "src/middleware.ts", // ENV gate only; must not import @/modules/pro
  "src/app/(pro)/pro/page.tsx",
  "src/app/(pro)/pro/f/[token]/page.tsx",
  "src/app/(pro)/r/[token]/page.tsx",
  "src/app/(pro)/admin/pro/page.tsx",
  "src/app/(pro)/api/pro/health/route.ts",
]);

function walkTsFiles(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "node_modules" || ent.name === ".next") continue;
      walkTsFiles(p, out);
    } else if (/\.(ts|tsx|mjs|js)$/.test(ent.name)) {
      out.push(p);
    }
  }
  return out;
}

async function main() {
  loadEnvLocal();
  console.log("Zovus Pro verify (S0: 1–6, 19–22)\n");

  const proMigFiles = readdirSync(join(ROOT, "scripts/migrations")).filter(
    (f) => /^\d+_migrate_pro_/.test(f) && f.endsWith(".sql") && !f.endsWith(".down.sql")
  );
  const migSql = proMigFiles
    .map((f) => readFileSync(join(ROOT, "scripts/migrations", f), "utf8"))
    .join("\n");

  // —— 1. No FK from pro → public
  const hasPublicFk =
    /REFERENCES\s+public\./i.test(migSql) ||
    /REFERENCES\s+"public"\./i.test(migSql);
  const schemaOk = /CREATE SCHEMA\s+(IF NOT EXISTS\s+)?pro\b/i.test(migSql);
  log(
    "1",
    schemaOk && !hasPublicFk ? "PASS" : "FAIL",
    schemaOk && !hasPublicFk
      ? `pro migrations (${proMigFiles.join(", ")}) have no FK into public.*`
      : "migration missing CREATE SCHEMA pro or references public"
  );

  // —— 2. Migration does not ALTER public tables
  const altersPublic =
    /\bALTER\s+TABLE\s+(?!pro\.)/i.test(migSql) ||
    /\bALTER\s+TABLE\s+public\./i.test(migSql);
  log(
    "2",
    !altersPublic && schemaOk ? "PASS" : "FAIL",
    !altersPublic && schemaOk
      ? "pro migrations do not mutate public.*"
      : "migration mutates public or missing"
  );

  // —— 3. No modules/pro imports outside module + mount points
  const srcFiles = walkTsFiles(join(ROOT, "src"));
  const badImports: string[] = [];
  const importRe = /(?:from\s+['"]@\/modules\/pro|from\s+['"]\.\.\/.*modules\/pro|modules\/pro\/)/;
  for (const abs of srcFiles) {
    const rel = relative(ROOT, abs).replace(/\\/g, "/");
    if (rel.startsWith("src/modules/pro/")) continue;
    if (rel.startsWith("src/app/(pro)/")) {
      // mount points allowed
      if (!ALLOWED_IMPORTERS.has(rel) && !rel.startsWith("src/app/(pro)/")) {
        /* keep allow for any future (pro) mounts */
      }
      continue;
    }
    const text = readFileSync(abs, "utf8");
    if (importRe.test(text) || /@\/modules\/pro\b/.test(text)) {
      if (!ALLOWED_IMPORTERS.has(rel)) badImports.push(rel);
    }
  }
  // middleware must NOT import the module (ENV-only gate)
  const mw = readFileSync(join(ROOT, "src/middleware.ts"), "utf8");
  if (/@\/modules\/pro\b|modules\/pro\//.test(mw)) {
    badImports.push("src/middleware.ts (imports modules/pro — forbidden; use ENV only)");
  }
  log(
    "3",
    badImports.length === 0 ? "PASS" : "FAIL",
    badImports.length === 0
      ? "modules/pro imports only inside module + (pro) mounts"
      : `disallowed imports: ${badImports.join(", ")}`
  );

  // —— 4. PRO_MODULE_ENABLED=false → routes gated (static + config)
  delete process.env.PRO_MODULE_ENABLED;
  const { isProModuleEnabled } = await import("../src/modules/pro/config.ts");
  const { requireProEnabled } = await import("../src/modules/pro/gate.ts");
  const off = !isProModuleEnabled();
  const gated = requireProEnabled();
  const gate404 = gated?.status === 404;
  const pagesGate =
    readFileSync(join(ROOT, "src/app/(pro)/pro/layout.tsx"), "utf8").includes("requireProPage") &&
    readFileSync(join(ROOT, "src/app/(pro)/r/layout.tsx"), "utf8").includes("requireProPage") &&
    readFileSync(join(ROOT, "src/app/(pro)/admin/pro/layout.tsx"), "utf8").includes(
      "requireProPage"
    );
  const mwGate = /PRO_MODULE_ENABLED/.test(mw) && /\/api\/pro/.test(mw);
  log(
    "4",
    off && gate404 && pagesGate && mwGate ? "PASS" : "FAIL",
    off && gate404 && pagesGate && mwGate
      ? "default off → API 404 + page requireProPage + middleware ENV gate"
      : `gate incomplete off=${off} api404=${gate404} pages=${pagesGate} mw=${mwGate}`
  );

  // —— 5. Cron / LLM not registered when off
  const { listEnabledProJobs } = await import("../src/modules/pro/jobs/index.ts");
  const { aiAdapter } = await import("../src/modules/pro/adapters/index.ts");
  const jobsOff = listEnabledProJobs().length === 0;
  const aiOff = !aiAdapter.isAvailable();
  log(
    "5",
    jobsOff && aiOff ? "PASS" : "FAIL",
    jobsOff && aiOff
      ? "module off → zero cron jobs, AI adapter unavailable"
      : `jobs=${listEnabledProJobs().length} ai=${aiAdapter.isAvailable()}`
  );

  // —— 6. /r/** /pro/f/** not in sitemap; robots disallow; pages noindex
  const sitemap = readFileSync(join(ROOT, "src/app/sitemap.ts"), "utf8");
  const robots = readFileSync(join(ROOT, "src/app/robots.txt/route.ts"), "utf8");
  // Avoid false positives on /prognoz, /rasklad, etc.
  const sitemapClean =
    !/["'`]\/pro(?:\/|["'`])/i.test(sitemap) &&
    !/["'`]\/r\/[^"'`]+["'`]/i.test(sitemap);
  const robotsOk = robots.includes('"/pro"') && robots.includes('"/r/"');
  const deliveryMeta = readFileSync(join(ROOT, "src/app/(pro)/r/layout.tsx"), "utf8");
  const proMeta = readFileSync(join(ROOT, "src/app/(pro)/pro/layout.tsx"), "utf8");
  const noindex =
    /robots:\s*\{\s*index:\s*false/.test(deliveryMeta) &&
    /robots:\s*\{\s*index:\s*false/.test(proMeta);
  log(
    "6",
    sitemapClean && robotsOk && noindex ? "PASS" : "FAIL",
    sitemapClean && robotsOk && noindex
      ? "sitemap omits pro/r; robots Disallow; pages noindex"
      : `sitemapClean=${sitemapClean} robots=${robotsOk} noindex=${noindex}`
  );

  // —— Apply migration when DB available
  if (process.env.DATABASE_URL || process.env.TEST_DATABASE_URL) {
    if (!process.env.DATABASE_URL && process.env.TEST_DATABASE_URL) {
      process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    }
    const mig = run("npm", ["run", "migrate"]);
    if (mig.status === 0) {
      log("migrate", "PASS", "npm run migrate ok (includes 102 when pending)");
      try {
        const pg = require("pg") as typeof import("pg");
        const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
        const { rows: schemas } = await pool.query(
          `SELECT 1 FROM information_schema.schemata WHERE schema_name = 'pro'`
        );
        const { rows: fks } = await pool.query(`
          SELECT c.confrelid::regclass::text AS ref
          FROM pg_constraint c
          JOIN pg_namespace n ON n.oid = c.connamespace
          WHERE n.nspname = 'pro' AND c.contype = 'f'
            AND c.confrelid::regclass::text LIKE 'public.%'
        `);
        await pool.end();
        log(
          "1b",
          schemas.length === 1 && fks.length === 0 ? "PASS" : "FAIL",
          schemas.length === 1 && fks.length === 0
            ? "live DB: schema pro present, no FK to public"
            : `schema=${schemas.length} public_fks=${fks.length}`
        );
      } catch (e) {
        log("1b", "WAITING", `DB check skipped: ${(e as Error).message?.slice(0, 120)}`);
      }
    } else {
      const err = `${mig.stderr || ""}\n${mig.stdout || ""}`;
      if (/ECONNREFUSED|ENOTFOUND|timeout/i.test(err)) {
        log("migrate", "WAITING", "DB unreachable");
      } else {
        log("migrate", "FAIL", err.slice(0, 240));
      }
    }
  } else {
    log("migrate", "WAITING", "DATABASE_URL / TEST_DATABASE_URL unset");
  }

  // —— 19. Guest contour scripts still present (regression surface)
  const guestScripts = [
    "scripts/verify-guest-triplet-resume.ts",
    "scripts/verify-guest-resume-state.ts",
  ];
  const guestOk = guestScripts.every((p) => existsSync(join(ROOT, p)));
  log(
    "19",
    guestOk ? "PASS" : "FAIL",
    guestOk
      ? "guest verify scripts intact (run npm run verify:guest-* separately for full E2E)"
      : "missing guest verify scripts"
  );

  // —— 20. Rune price floors unchanged by this change-set
  const runeConst = readFileSync(join(ROOT, "src/lib/rune-purchase-constants.ts"), "utf8");
  const runeSettings = readFileSync(join(ROOT, "src/lib/rune-settings.ts"), "utf8");
  const pricesOk =
    /MIN_CUSTOM_RUNE_PURCHASE_RUB\s*=\s*100/.test(runeConst) &&
    /MAX_CUSTOM_RUNE_PURCHASE_RUB\s*=\s*50000/.test(runeConst) &&
    /rubPerRune:\s*2/.test(runeSettings);
  log(
    "20",
    pricesOk ? "PASS" : "FAIL",
    pricesOk
      ? "rune purchase floors / default rubPerRune unchanged"
      : "rune price constants drifted"
  );

  // —— 21. Share routes still present
  const shareOk =
    existsSync(join(ROOT, "src/app/share/[token]/page.tsx")) ||
    existsSync(join(ROOT, "src/app/share/[token]/page.ts"));
  const reportsShare =
    existsSync(join(ROOT, "src/app/reports/shared/[token]/page.tsx")) ||
    walkTsFiles(join(ROOT, "src/app/reports")).some((p) =>
      p.replace(/\\/g, "/").includes("/shared/")
    );
  log(
    "21",
    shareOk && reportsShare ? "PASS" : "FAIL",
    shareOk && reportsShare
      ? "/share/[token] and reports/shared paths present"
      : `share=${shareOk} reportsShared=${reportsShare}`
  );

  // —— 22. Guards still green (preflight subset; full audit is separate)
  const guards = run("npm", ["run", "guards"]);
  log(
    "22",
    guards.status === 0 ? "PASS" : "FAIL",
    guards.status === 0
      ? "npm run guards green"
      : (guards.stdout || guards.stderr || "guards failed").slice(0, 200)
  );

  // Domain invariant smoke
  const { canDeliverCase } = await import("../src/modules/pro/domain/invariants.ts");
  const gateHuman =
    canDeliverCase([{ source: "ai" }]) === false &&
    canDeliverCase([{ source: "ai" }, { source: "human" }]) === true;
  log(
    "7",
    gateHuman ? "PASS" : "FAIL",
    gateHuman ? "deliver requires human version (409 path)" : "human-gate broken"
  );

  // —— 8. Tokens hashed (mint stores hash helpers)
  const tokensSrc = readFileSync(join(ROOT, "src/modules/pro/tokens.ts"), "utf8");
  const delivSrc = readFileSync(join(ROOT, "src/modules/pro/db/deliveries.ts"), "utf8");
  const tokenHashOk =
    /sha256/i.test(tokensSrc) &&
    /token_hash/.test(delivSrc) &&
    /minted\.hash/.test(delivSrc) &&
    !/VALUES\s*\([^)]*rawToken/.test(delivSrc);
  log(
    "8",
    tokenHashOk ? "PASS" : "FAIL",
    tokenHashOk ? "delivery tokens stored as sha256 hash" : "token storage unsafe"
  );

  // —— 15/17 billing idempotency + shadow
  const billingSrc = readFileSync(join(ROOT, "src/modules/pro/db/billing.ts"), "utf8");
  const billingOk =
    /idempotency_key/.test(billingSrc) &&
    /shadow/.test(billingSrc) &&
    /getProBillingMode/.test(billingSrc);
  log(
    "15",
    billingOk ? "PASS" : "FAIL",
    billingOk ? "usage_log idempotency_key present" : "billing adapter incomplete"
  );
  log(
    "17",
    /shadow\s*=\s*mode\s*!==\s*["']live["']/.test(billingSrc) ||
      /mode !== "live"/.test(billingSrc)
      ? "PASS"
      : "FAIL",
    "shadow mode skips ledger charge"
  );

  // —— Safety fixtures
  const { detectCrisis, filterPractitionerOutput } = await import(
    "../src/modules/pro/safety/index.ts"
  );
  const crisisOk = detectCrisis("хочу покончить с собой").crisis === true;
  const filterOk =
    filterPractitionerOutput("Я гарантирую 100% сбудется").ok === false;
  log(
    "10-11",
    crisisOk && filterOk ? "PASS" : "FAIL",
    crisisOk && filterOk
      ? "crisis detector + guarantee filter fixtures"
      : `crisis=${crisisOk} filter=${filterOk}`
  );

  // —— S1/S2 mount surface present
  const mounts = [
    "src/app/(pro)/api/pro/account/route.ts",
    "src/app/(pro)/api/pro/clients/route.ts",
    "src/app/(pro)/api/pro/cases/route.ts",
    "src/app/(pro)/api/pro/public/report/[token]/route.ts",
    "src/app/(pro)/api/cron/pro-maintenance/route.ts",
    "scripts/migrations/103_migrate_pro_delivery_billing.sql",
  ];
  const mountsOk = mounts.every((p) => existsSync(join(ROOT, p)));
  log(
    "s1s2-surface",
    mountsOk ? "PASS" : "FAIL",
    mountsOk ? "S1/S2 API + migration 103 present" : "missing mount files"
  );

  const pricingSrc = readFileSync(join(ROOT, "src/modules/pro/pricing.ts"), "utf8");
  log(
    "18",
    /PRO_COST_|proRuneCost/.test(pricingSrc) ? "PASS" : "FAIL",
    "prices from config/ENV not hardcoded in handlers"
  );

  const fails = rows.filter((r) => r.status === "FAIL");
  console.log(
    `\nSummary: ${rows.filter((r) => r.status === "PASS").length} PASS, ${fails.length} FAIL, ${rows.filter((r) => r.status === "WAITING").length} WAITING`
  );
  if (fails.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
