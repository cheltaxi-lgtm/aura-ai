#!/usr/bin/env node
/**
 * Full Yandex surface audit: Webmaster indexing + recrawl queue + Metrika + Direct balance.
 * Usage: node scripts/yandex-indexing-audit.mjs [--recrawl] [--dry-run]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, "..");
const OUT_DIR = join(ROOT, "docs", "yandex-audit");
const base = "https://zovus.ru";
const HOST_ID = "https:zovus.ru:443";
const METRIKA_ID = 110138367;

const args = new Set(process.argv.slice(2));
const doRecrawl = args.has("--recrawl");
const dryRun = args.has("--dry-run");

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq);
    const value = trimmed.slice(eq + 1);
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile(join(ROOT, ".env.local"));
loadEnvFile(join(ROOT, ".env"));

const webmasterToken =
  process.env.WEBMASTER_TOKEN?.trim() ||
  process.env.METRIKA_TOKEN?.trim() ||
  process.env.YANDEX_METRIKA_OAUTH_TOKEN?.trim() ||
  "";
const metrikaToken =
  process.env.METRIKA_TOKEN?.trim() ||
  process.env.YANDEX_METRIKA_OAUTH_TOKEN?.trim() ||
  "";
const directToken = process.env.ADS_DIRECT_TOKEN?.trim() || "";
const directLogin = process.env.ADS_DIRECT_LOGIN?.trim() || "";

const RECRAWL_URLS = [
  `${base}/`,
  `${base}/telegram`,
  `${base}/about`,
  `${base}/taro`,
  `${base}/gadanie`,
  `${base}/rasklady`,
  `${base}/rasklady/lyubov`,
  `${base}/rasklady/zhdat-ili-zabyt`,
  `${base}/rasklady/kak-otpustit-cheloveka`,
  `${base}/rasklady/est-li-u-nego-drugaya`,
  `${base}/numerology/destiny-matrix`,
  `${base}/natalnaya-karta`,
  `${base}/runy`,
  `${base}/photo-rasklad`,
  `${base}/aura`,
  `${base}/aura/cveta`,
  `${base}/aura/kak-uznat-cvet`,
  `${base}/aura/chtenie-ili-kirlian`,
  `${base}/lenormand`,
  `${base}/lenormand/sochetaniya/lisa-i-medved`,
  `${base}/faq`,
  `${base}/cards`,
  `${base}/prognoz`,
  `${base}/statyi`,
];

const report = {
  at: new Date().toISOString(),
  base,
  webmaster: {},
  metrika: {},
  direct: {},
  site: {},
  recrawl: [],
  errors: [],
};

function log(msg) {
  console.log(msg);
}

async function wm(path, init) {
  const res = await fetch(`https://api.webmaster.yandex.net/v4${path}`, {
    ...init,
    headers: {
      Authorization: `OAuth ${webmasterToken}`,
      "Content-Type": "application/json; charset=utf-8",
      ...(init?.headers || {}),
    },
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 500) };
  }
  return { ok: res.ok, status: res.status, json };
}

async function auditSite() {
  const checks = [
    ["/", ["yandex-verification", "7902ba7dfdb76ac3"]],
    ["/telegram", ["zovus_card_bot", "t.me/"]],
    ["/robots.txt", ["Sitemap:", "Host:"]],
    ["/sitemap.xml", ["/telegram"]],
    ["/107274032904532db6ae0e4b2f39c4b3.txt", ["107274032904532db6ae0e4b2f39c4b3"]],
  ];
  const out = {};
  for (const [path, needles] of checks) {
    try {
      const res = await fetch(`${base}${path}`, { redirect: "follow" });
      const body = await res.text();
      out[path] = {
        status: res.status,
        needles: Object.fromEntries(needles.map((n) => [n, body.includes(n)])),
      };
    } catch (e) {
      out[path] = { error: String(e?.message || e) };
    }
  }
  report.site = out;
  log(`Site checks: ${JSON.stringify(out, null, 2)}`);
}

async function auditWebmaster() {
  if (!webmasterToken) {
    report.errors.push("WEBMASTER_TOKEN missing");
    log("FAIL Webmaster: no token");
    return;
  }
  const user = await wm("/user");
  if (!user.ok) {
    report.errors.push(`webmaster user ${user.status}`);
    log(`FAIL Webmaster user ${user.status}`);
    return;
  }
  const uid = user.json?.user_id;
  report.webmaster.userId = uid;
  const hostEnc = encodeURIComponent(HOST_ID);
  const summary = await wm(`/user/${uid}/hosts/${hostEnc}/summary`);
  report.webmaster.summary = { status: summary.status, body: summary.json };
  log(`Webmaster summary HTTP ${summary.status}`);
  if (summary.json) log(JSON.stringify(summary.json, null, 2));

  const sitemaps = await wm(`/user/${uid}/hosts/${hostEnc}/user-added-sitemaps`);
  report.webmaster.sitemaps = { status: sitemaps.status, body: sitemaps.json };
  log(`Sitemaps HTTP ${sitemaps.status}`);

  const quota = await wm(`/user/${uid}/hosts/${hostEnc}/recrawl/quota`);
  report.webmaster.recrawlQuota = { status: quota.status, body: quota.json };
  log(`Recrawl quota HTTP ${quota.status}: ${JSON.stringify(quota.json)}`);

  const to = new Date();
  const from = new Date(to.getTime() - 28 * 86400000);
  const dateFrom = from.toISOString().slice(0, 10);
  const dateTo = to.toISOString().slice(0, 10);
  for (const indicator of ["TOTAL_CLICKS", "TOTAL_SHOWS", "AVG_SHOW_POSITION"]) {
    const q = await wm(
      `/user/${uid}/hosts/${hostEnc}/search-queries/popular` +
        `?date_from=${dateFrom}&date_to=${dateTo}` +
        `&query_indicator=${indicator}&order_by=${indicator}&limit=15`
    );
    report.webmaster[`queries_${indicator}`] = {
      status: q.status,
      top: (q.json?.queries || []).slice(0, 10).map((row) => ({
        query: row.query_text,
        value: row.indicators?.[indicator],
      })),
    };
  }

  if (doRecrawl) {
    const remaining = Number(quota.json?.quota_remainder ?? quota.json?.daily_quota ?? 0);
    const limit = Math.max(0, Math.min(RECRAWL_URLS.length, remaining || RECRAWL_URLS.length));
    log(`Recrawl: requesting up to ${limit} URLs (dryRun=${dryRun})`);
    for (const url of RECRAWL_URLS.slice(0, limit || RECRAWL_URLS.length)) {
      if (dryRun) {
        report.recrawl.push({ url, status: "dry-run" });
        continue;
      }
      const res = await wm(`/user/${uid}/hosts/${hostEnc}/recrawl/queue`, {
        method: "POST",
        body: JSON.stringify({ url }),
      });
      report.recrawl.push({ url, status: res.status, body: res.json });
      log(`Recrawl ${url} → ${res.status}`);
      await new Promise((r) => setTimeout(r, 350));
    }
  }
}

async function auditMetrika() {
  if (!metrikaToken) {
    report.errors.push("METRIKA_TOKEN missing");
    return;
  }
  const res = await fetch(
    `https://api-metrika.yandex.net/management/v1/counter/${METRIKA_ID}`,
    { headers: { Authorization: `OAuth ${metrikaToken}` } }
  );
  const json = await res.json().catch(() => ({}));
  report.metrika = {
    status: res.status,
    id: json.counter?.id,
    name: json.counter?.name,
    site: json.counter?.site,
    code_status: json.counter?.code_status,
    permission: json.counter?.permission,
  };
  log(`Metrika counter HTTP ${res.status}: ${JSON.stringify(report.metrika)}`);
}

async function directPost(apiBase, methodPath, params) {
  const res = await fetch(`${apiBase}${methodPath}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${directToken}`,
      "Client-Login": directLogin,
      "Accept-Language": "ru",
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({ method: "get", params }),
  });
  const json = await res.json().catch(() => ({}));
  return { http: res.status, units: res.headers.get("Units"), json };
}

async function auditDirect() {
  if (!directToken) {
    report.errors.push("ADS_DIRECT_TOKEN missing");
    return;
  }
  const sandboxFlag = process.env.ADS_DIRECT_SANDBOX === "1";
  // Always inventory production Direct for launch readiness (read-only).
  const prod = await directPost("https://api.direct.yandex.com/json/v5", "/campaigns", {
    SelectionCriteria: {},
    FieldNames: ["Id", "Name", "State", "Status", "Type"],
  });
  const sand = sandboxFlag
    ? await directPost("https://api-sandbox.direct.yandex.com/json/v5", "/campaigns", {
        SelectionCriteria: {},
        FieldNames: ["Id", "Name", "State", "Status", "Type"],
      })
    : null;

  const changes = await directPost("https://api.direct.yandex.com/json/v5", "/changes", {
    FieldNames: ["CampaignIds", "Timestamp"],
  }).catch(() => null);

  // Balance: agency endpoint often empty for client logins — also try dictionaries/currency.
  const balRes = await fetch("https://api.direct.yandex.com/live/v4/json/", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      method: "AccountManagement",
      token: directToken,
      param: { Action: "Get", SelectionCriteria: { Logins: [directLogin] } },
      locale: "ru",
    }),
  });
  const balJson = await balRes.json().catch(() => ({}));

  report.direct = {
    sandboxEnvFlag: sandboxFlag,
    login: directLogin,
    production: {
      http: prod.http,
      units: prod.units,
      error: prod.json.error,
      campaigns: (prod.json.result?.Campaigns || []).map((c) => ({
        id: c.Id,
        name: c.Name,
        state: c.State,
        status: c.Status,
        type: c.Type,
      })),
    },
    sandbox: sand
      ? {
          http: sand.http,
          error: sand.json.error,
          campaigns: (sand.json.result?.Campaigns || []).length,
        }
      : null,
    balanceLiveV4: { http: balRes.status, body: balJson },
    changesProbe: changes
      ? { http: changes.http, error: changes.json.error, result: changes.json.result }
      : null,
  };
  log(
    `Direct prod campaigns HTTP ${prod.http}, count=${report.direct.production.campaigns.length}`
  );
  log(`Direct balance v4: ${JSON.stringify(balJson).slice(0, 400)}`);
}
mkdirSync(OUT_DIR, { recursive: true });
log("=== Yandex indexing audit ===\n");
await auditSite();
console.log("\n=== Webmaster ===");
await auditWebmaster();
console.log("\n=== Metrika ===");
await auditMetrika();
console.log("\n=== Direct ===");
await auditDirect();

const outPath = join(OUT_DIR, `audit-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
const latestPath = join(OUT_DIR, "latest.json");
writeFileSync(outPath, JSON.stringify(report, null, 2));
writeFileSync(latestPath, JSON.stringify(report, null, 2));
log(`\nWrote ${outPath}`);
log(`Errors: ${report.errors.length ? report.errors.join("; ") : "none"}`);
process.exit(report.errors.length ? 1 : 0);
