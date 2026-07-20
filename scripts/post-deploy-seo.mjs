#!/usr/bin/env node
/**
 * Post-deploy SEO sync: verify Metrika/Webmaster prerequisites, ping sitemap, IndexNow.
 * Usage: node scripts/post-deploy-seo.mjs [baseUrl]
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const base = (process.argv[2] || "https://zovus.ru").replace(/\/$/, "");
const INDEXNOW_KEY = "107274032904532db6ae0e4b2f39c4b3";
const METRIKA_ID = 110138367;

const __dir = dirname(fileURLToPath(import.meta.url));

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

loadEnvFile(join(__dir, "..", ".env.local"));

const goalsDoc = JSON.parse(readFileSync(join(__dir, "metrika-goals.json"), "utf8"));

const PRIORITY_URLS = [
  `${base}/`,
  `${base}/sitemap.xml`,
  `${base}/robots.txt`,
  `${base}/taro`,
  `${base}/gadanie`,
  `${base}/gadanie/da-net`,
  `${base}/runy`,
  `${base}/lenormand`,
  `${base}/sovmestimost-znakov-zodiaka`,
  `${base}/photo-rasklad`,
  `${base}/numerology`,
  `${base}/numerology/destiny-matrix`,
  `${base}/natalnaya-karta`,
  `${base}/rasklady`,
  `${base}/prognoz`,
  `${base}/statyi`,
  `${base}/statyi/natalnaya-karta-po-date-rozhdeniya`,
  `${base}/statyi/chto-takoe-matrica-sudby`,
  `${base}/statyi/matrica-sudby-po-date-rozhdeniya`,
  `${base}/statyi/natal-ili-matrica-chto-vybrat`,
  `${base}/terms`,
  `${base}/privacy`,
];

let failed = 0;

function ok(label, pass, detail = "") {
  const mark = pass ? "OK" : "FAIL";
  console.log(`${mark} ${label}${detail ? `: ${detail}` : ""}`);
  if (!pass) failed++;
}

async function checkUrl(path, expectStatus = 200, includes) {
  const url = path.startsWith("http") ? path : `${base}${path}`;
  const res = await fetch(url, { redirect: "follow" });
  const text = await res.text();
  const bodyOk = includes ? text.includes(includes) : true;
  ok(url, res.status === expectStatus && bodyOk, `status=${res.status}`);
  return text;
}

async function pingYandexSitemap() {
  const sitemap = `${base}/sitemap.xml`;
  const pingUrl = `https://webmaster.yandex.ru/ping?sitemap=${encodeURIComponent(sitemap)}`;
  const res = await fetch(pingUrl);
  ok("Yandex Webmaster sitemap ping", res.ok, `status=${res.status}`);
}

async function submitIndexNow() {
  const payload = {
    host: new URL(base).host,
    key: INDEXNOW_KEY,
    keyLocation: `${base}/${INDEXNOW_KEY}.txt`,
    urlList: PRIORITY_URLS.filter((u) => !u.endsWith(".xml") && !u.endsWith(".txt")),
  };
  const res = await fetch("https://yandex.com/indexnow", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload),
  });
  ok("Yandex IndexNow submit", res.ok || res.status === 202, `status=${res.status}`);
}

console.log(`=== Post-deploy SEO: ${base} ===\n`);

await checkUrl(`/${INDEXNOW_KEY}.txt`, 200, INDEXNOW_KEY);
const homeHtml = await checkUrl("/", 200);
// Consent-gated: tag.js must NOT be in SSR HTML; loads only after «Принять аналитику».
ok(
  "Metrika not in SSR HTML (consent-gated)",
  !homeHtml.includes(`mc.yandex.ru/metrika/tag.js`),
  `id=${METRIKA_ID} loads client-side after consent`
);
ok(
  "Yandex Webmaster verification meta",
  homeHtml.includes("yandex-verification") || homeHtml.includes("7902ba7dfdb76ac3")
);
await checkUrl("/robots.txt", 200, "Sitemap:");
await checkUrl("/sitemap.xml", 200, "<urlset");

await pingYandexSitemap();
await submitIndexNow();

async function verifyMetrikaGoals() {
  const token = process.env.YANDEX_METRIKA_OAUTH_TOKEN;
  if (!token) {
    ok("Metrika API goals", false, "YANDEX_METRIKA_OAUTH_TOKEN not set");
    return;
  }
  const res = await fetch(
    `https://api-metrika.yandex.net/management/v1/counter/${METRIKA_ID}/goals`,
    { headers: { Authorization: `OAuth ${token}` } }
  );
  if (!res.ok) {
    ok("Metrika API goals", false, `status=${res.status}`);
    return;
  }
  const data = await res.json();
  const byUrl = new Map();
  for (const g of data.goals ?? []) {
    const url = g.conditions?.[0]?.url;
    if (url) byUrl.set(url, g.id);
  }
  const missing = goalsDoc.goals.filter((g) => !byUrl.has(g.id));
  ok(
    "Metrika API goals",
    missing.length === 0,
    `${goalsDoc.goals.length - missing.length}/${goalsDoc.goals.length} in counter`
  );
  if (missing.length > 0) {
    console.log("  missing:", missing.map((g) => g.id).join(", "));
  }
  const regGoals = goalsDoc.goals.filter((g) => g.group === "registration");
  const regMissing = regGoals.filter((g) => !byUrl.has(g.id));
  ok(
    "Metrika registration funnel goals",
    regMissing.length === 0,
    `${regGoals.length - regMissing.length}/${regGoals.length}`
  );
}

console.log("\n=== Metrika API ===");
await verifyMetrikaGoals();
console.log(`Счётчик: ${goalsDoc.counterId}, целей в манифесте: ${goalsDoc.goals.length}`);

process.exit(failed > 0 ? 1 : 0);
