#!/usr/bin/env node
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const OUT = join(process.cwd(), ".cursor", "gsc-security-review");
mkdirSync(OUT, { recursive: true });

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const context = browser.contexts()[0];
const page =
  context.pages().find((p) => p.url().includes("search.google.com")) ||
  (await context.newPage());

async function snap(name) {
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true }).catch(() => {});
}

// 1) Security issues
await page.goto(
  "https://search.google.com/search-console/security-issues?resource_id=https%3A%2F%2Fzovus.ru%2F",
  { waitUntil: "domcontentloaded", timeout: 90000 }
);
await page.waitForTimeout(4500);
let secText = await page.locator("body").innerText();
console.log("=== SECURITY ISSUES ===");
console.log("url", page.url());
console.log(secText.slice(0, 3500));
await snap("check-sec");

// Expand deceptive pages
const deceptive = page.getByText(/Обманные страницы|Social engineering|Deceptive/i).first();
if (await deceptive.count()) {
  await deceptive.click({ force: true }).catch(() => {});
  await page.waitForTimeout(2000);
  secText = await page.locator("body").innerText();
  console.log("=== AFTER EXPAND ===");
  console.log(secText.slice(0, 3500));
  await snap("check-sec-expanded");
}

const flags = {
  issueDetected: /Обнаружена проблема|Issue detected/i.test(secText),
  requestReviewBtn: /ЗАПРОСИТЬ ПРОВЕРКУ|Request a review/i.test(secText),
  reviewSubmitted: /Запрос отправлен|Request submitted|на проверке|Under review|Проверка запрошена/i.test(secText),
  noProblemUrls: /URL страниц с проблемами\s*Отсутствует|No sample URLs|Отсутствует/i.test(secText),
  deceptive: /Обманные страницы|Social engineering|Deceptive/i.test(secText),
  noAccess: /нет доступа|not-verified/i.test(secText + page.url()),
};
console.log("=== FLAGS ===", JSON.stringify(flags, null, 2));

// 2) Transparency report
const tpage = await context.newPage();
await tpage.goto("https://transparencyreport.google.com/safe-browsing/search?url=zovus.ru&hl=ru", {
  waitUntil: "domcontentloaded",
  timeout: 90000,
});
await tpage.waitForTimeout(5000);
const trText = await tpage.locator("body").innerText();
console.log("=== TRANSPARENCY ===");
console.log(trText.slice(0, 2000));
await tpage.screenshot({ path: join(OUT, "check-transparency.png"), fullPage: true }).catch(() => {});

// 3) Live site checks for old APKs / verification meta
const checks = [
  "https://zovus.ru/",
  "https://zovus.ru/zovus.apk",
  "https://zovus.ru/test-root.apk",
  "https://zovus.ru/releases/test.apk",
  "https://zovus.ru/releases/zovus-latest.zip",
  "https://zovus.ru/releases/zovus-latest.apk",
  "https://zovus.ru/googlea07e95e8199f7e09.html",
];
console.log("=== LIVE URLS ===");
for (const url of checks) {
  try {
    const res = await fetch(url, { method: "GET", redirect: "manual" });
    const ct = res.headers.get("content-type") || "";
    let snip = "";
    if (url.endsWith("/") || url.includes("google")) {
      const txt = await res.text();
      snip = /google-site-verification[^>]{0,120}/i.exec(txt)?.[0] || txt.slice(0, 80).replace(/\s+/g, " ");
    }
    console.log(res.status, url, ct.slice(0, 40), snip.slice(0, 100));
  } catch (e) {
    console.log("ERR", url, e.message);
  }
}

writeFileSync(
  join(OUT, "check-status.json"),
  JSON.stringify({ flags, secUrl: page.url(), secText: secText.slice(0, 5000), trText: trText.slice(0, 3000) }, null, 2)
);
console.log("DONE");
