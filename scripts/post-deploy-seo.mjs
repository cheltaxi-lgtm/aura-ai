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

const CORE_PRIORITY = [
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
  `${base}/numerology/name-compatibility`,
  `${base}/natalnaya-karta`,
  `${base}/rasklady`,
  `${base}/rasklady/lyubov`,
  `${base}/rasklady/vernost-i-doverie`,
  `${base}/rasklady/chuvstva-i-myisli`,
  `${base}/rasklady/budushchee`,
  `${base}/rasklady/kariera`,
  `${base}/faq`,
  `${base}/telegram`,
  `${base}/about`,
  `${base}/faq`,
  `${base}/lenormand`,
  `${base}/partners`,
  `${base}/cards`,
  `${base}/prognoz`,
  `${base}/statyi`,
  `${base}/terms`,
  `${base}/privacy`,
];

/** High-value pages for Yandex recovery — pillars first, then intent pages. */
const RECRAWL_PRIORITY = [
  `${base}/`,
  `${base}/telegram`,
  `${base}/about`,
  `${base}/photo-rasklad`,
  `${base}/taro`,
  `${base}/gadanie`,
  `${base}/rasklady`,
  `${base}/rasklady/lyubov`,
  `${base}/rasklady/vernost-i-doverie`,
  `${base}/rasklady/chto-meshaet-otnosheniyam`,
  `${base}/rasklady/na-vernost`,
  `${base}/rasklady/zhdat-ili-zabyt`,
  `${base}/rasklady/nuzhna-li-ya-emu`,
  `${base}/rasklady/situatsiya-na-rabote`,
  `${base}/rasklady/lyubov-pochemu-on-molchit`,
  `${base}/rasklady/partner-po-biznesu`,
  `${base}/rasklady/kak-naladit-otnosheniya-s-papoy`,
  `${base}/rasklady/prognoz-na-nedelyu`,
  `${base}/rasklady/chto-on-delaet-nochyu`,
  `${base}/rasklady/chto-on-chuvstvuet`,
  `${base}/rasklady/vernyotsya-li-on`,
  `${base}/rasklady/lyubit-li-on-menya`,
  `${base}/rasklady/est-li-izmena`,
  `${base}/rasklady/chto-on-skryvaet`,
  `${base}/rasklady/pochemu-on-molchit`,
  `${base}/cards/6-mechey`,
  `${base}/cards/koroleva-zhezlov`,
  `${base}/cards/tuz-mechey`,
  `${base}/cards/pazh-zhezlov`,
  `${base}/cards/ierofant`,
  `${base}/cards`,
];

/** Wave-1 organic + natal/matrix pillars for IndexNow / checks. */
const ARTICLE_PRIORITY_SLUGS = [
  "rasshifrovka-taro-po-foto",
  "rasshifrovka-taro-po-foto-besplatno",
  "besplatnyy-rasklad-taro-online",
  "kak-fotografirovat-rasklad-taro",
  "foto-rasklad-ili-klassicheskoe-taro",
  "zhdat-ili-otpustit-taro",
  "svoboden-li-on-gadanie",
  "znachenie-kart-lenormand",
  "sochetaniya-lenormand",
  "ascendent-v-natalnoy-karte",
  "matrica-sudby-dengi",
  "matrica-sudby-otnosheniya",
  "numerologiya-i-natalnaya-karta",
  "natalnaya-karta-po-date-rozhdeniya",
  "chto-takoe-matrica-sudby",
  "matrica-sudby-po-date-rozhdeniya",
  "natal-ili-matrica-chto-vybrat",
];

function loadAllArticleUrls() {
  const urls = ARTICLE_PRIORITY_SLUGS.map((slug) => `${base}/statyi/${slug}`);
  try {
    const extra = JSON.parse(readFileSync(join(__dir, "seo-article-extra-slugs.json"), "utf8"));
    if (Array.isArray(extra)) {
      for (const slug of extra) urls.push(`${base}/statyi/${slug}`);
    }
  } catch {
    /* optional */
  }
  return [...new Set(urls)];
}

const PRIORITY_URLS = [...new Set([...CORE_PRIORITY, ...RECRAWL_PRIORITY, ...loadAllArticleUrls()])];

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
  const all = PRIORITY_URLS.filter((u) => !u.endsWith(".xml") && !u.endsWith(".txt"));
  const chunkSize = 100;
  let submitted = 0;
  for (let i = 0; i < all.length; i += chunkSize) {
    const urlList = all.slice(i, i + chunkSize);
    const payload = {
      host: new URL(base).host,
      key: INDEXNOW_KEY,
      keyLocation: `${base}/${INDEXNOW_KEY}.txt`,
      urlList,
    };
    const res = await fetch("https://yandex.com/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(payload),
    });
    const pass = res.ok || res.status === 202;
    ok(`Yandex IndexNow batch ${i / chunkSize + 1}`, pass, `status=${res.status} urls=${urlList.length}`);
    if (pass) submitted += urlList.length;
    await new Promise((r) => setTimeout(r, 200));
  }
  console.log(`IndexNow total submitted URLs: ${submitted}`);
}

console.log(`=== Post-deploy SEO: ${base} ===\n`);

await checkUrl(`/${INDEXNOW_KEY}.txt`, 200, INDEXNOW_KEY);
const homeHtml = await checkUrl("/", 200);
// Humans: tag.js must NOT be in SSR HTML; loads only after «Принять аналитику».
ok(
  "Metrika not in SSR HTML for humans (consent-gated)",
  !homeHtml.includes(`mc.yandex.ru/metrika/tag.js`),
  `id=${METRIKA_ID} loads client-side after consent`
);
ok(
  "Metrika noscript watch pixel in SSR (Webmaster)",
  homeHtml.includes("mc.yandex.ru/watch/110138367"),
  "JS users still consent-gated via YandexMetrika"
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
