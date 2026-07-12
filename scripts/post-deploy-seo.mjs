#!/usr/bin/env node
/**
 * Post-deploy SEO sync: verify Metrika/Webmaster prerequisites, ping sitemap, IndexNow.
 * Usage: node scripts/post-deploy-seo.mjs [baseUrl]
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const base = (process.argv[2] || "https://zovus.ru").replace(/\/$/, "");
const INDEXNOW_KEY = "107274032904532db6ae0e4b2f39c4b3";
const METRIKA_ID = 110138367;

const __dir = dirname(fileURLToPath(import.meta.url));
const goalsDoc = JSON.parse(readFileSync(join(__dir, "metrika-goals.json"), "utf8"));

const PRIORITY_URLS = [
  `${base}/`,
  `${base}/sitemap.xml`,
  `${base}/robots.txt`,
  `${base}/taro`,
  `${base}/gadanie`,
  `${base}/gadanie/da-net`,
  `${base}/runy`,
  `${base}/sovmestimost-znakov-zodiaka`,
  `${base}/photo-rasklad`,
  `${base}/numerology`,
  `${base}/rasklady`,
  `${base}/prognoz`,
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
ok(
  "Metrika counter in HTML",
  homeHtml.includes(`mc.yandex.ru/metrika/tag.js`) && homeHtml.includes(String(METRIKA_ID)),
  `id=${METRIKA_ID}`
);
ok(
  "Yandex Webmaster verification meta",
  homeHtml.includes("yandex-verification") || homeHtml.includes("7902ba7dfdb76ac3")
);
await checkUrl("/robots.txt", 200, "Sitemap:");
await checkUrl("/sitemap.xml", 200, "<urlset");

await pingYandexSitemap();
await submitIndexNow();

const regGoals = goalsDoc.goals.filter((g) => g.group === "registration");
console.log("\n=== Metrika: цели регистрации (создать вручную в UI) ===");
for (const g of regGoals) {
  console.log(`  - ${g.id}${g.new ? " (НОВАЯ)" : ""}`);
}
console.log(`\nВсего целей в scripts/metrika-goals.json: ${goalsDoc.goals.length}`);
console.log(`Счётчик: ${goalsDoc.counterId}`);

process.exit(failed > 0 ? 1 : 0);
