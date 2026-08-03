#!/usr/bin/env node
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const OUT = join(process.cwd(), ".cursor", "gsc-security-review");
mkdirSync(OUT, { recursive: true });
const REVIEW =
  "Удалили тестовые APK (/zovus.apk, /test-root.apk, /releases/test.apk, /releases/zovus-latest.zip). Оставили /releases/zovus-latest.apk. Фишинга нет. Zovus легитимный. Просим снять Safe Browsing social engineering.";

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page =
  browser.contexts()[0].pages().find((p) => p.url().includes("search.google")) ||
  (await browser.contexts()[0].newPage());

async function snap(n) {
  await page.screenshot({ path: join(OUT, `${n}.png`), fullPage: true });
}

await page.goto("https://search.google.com/search-console/welcome", {
  waitUntil: "domcontentloaded",
  timeout: 90000,
});
await page.waitForTimeout(2000);

await page.evaluate(() => {
  const el = [...document.querySelectorAll("a,button,div,span")].find(
    (e) =>
      /Завершить процедуру подтверждения/i.test((e.textContent || "").trim()) &&
      (e.textContent || "").trim().length < 80
  );
  if (el) el.click();
});
await page.waitForTimeout(2000);

await page.evaluate(() => {
  const el = [...document.querySelectorAll("div,span,li,a,button")].find(
    (e) => (e.textContent || "").trim() === "https://zovus.ru/"
  );
  if (el) el.click();
});
await page.waitForTimeout(4000);
await snap("cv-01");

// Prefer first visible "Подтвердить" role=button in HTML-file section
const verifyBtn = page.getByRole("button", { name: /^Подтвердить$/i }).first();
await verifyBtn.waitFor({ state: "visible", timeout: 15000 });
console.log("verify visible");
await verifyBtn.click({ force: true });
await page.waitForTimeout(10000);
console.log("after", page.url());
console.log((await page.locator("body").innerText()).slice(0, 2500));
await snap("cv-02");

// Success dialog?
const done = page.getByRole("button", { name: /^(ГОТОВО|Done)$/i }).first();
if (await done.count()) {
  await done.click({ force: true });
  await page.waitForTimeout(3000);
}

await page.goto(
  "https://search.google.com/search-console/security-issues?resource_id=https%3A%2F%2Fzovus.ru%2F",
  { waitUntil: "domcontentloaded", timeout: 90000 }
);
await page.waitForTimeout(5000);
let t = await page.locator("body").innerText();
console.log("SEC", page.url());
console.log(t.slice(0, 2500));
await snap("cv-03");

if (!/нет доступа|not-verified/i.test(t + page.url())) {
  const issue = page
    .locator("a,button,[role=row]")
    .filter({ hasText: /Social|Социальн|Unsafe|Небезопас/i })
    .first();
  if (await issue.count()) {
    await issue.click({ force: true });
    await page.waitForTimeout(2000);
  }
  const review = page
    .getByRole("button", { name: /Request a review|Запросить проверку/i })
    .first();
  if (!(await review.count())) {
    const reviewLink = page.locator("a,button,[role=button]").filter({ hasText: /Request a review|Запросить проверку/i }).first();
    if (await reviewLink.count()) await reviewLink.click({ force: true });
  } else {
    await review.click({ force: true });
  }
  await page.waitForTimeout(1500);
  const ta = page.locator("textarea").first();
  if (await ta.count()) await ta.fill(REVIEW);
  const cbs = page.locator('input[type=checkbox]');
  for (let i = 0; i < (await cbs.count()); i++) await cbs.nth(i).check({ force: true }).catch(() => {});
  const submit = page.getByRole("button", { name: /Submit|Отправить|Request|Запросить/i }).last();
  if (await submit.count()) {
    await submit.click({ force: true });
    await page.waitForTimeout(4000);
    console.log("REVIEW_SUBMITTED");
  }
  console.log("FINAL", (await page.locator("body").innerText()).slice(0, 2000));
  await snap("cv-04");
}

writeFileSync(
  join(OUT, "cv-result.json"),
  JSON.stringify({ url: page.url(), text: await page.locator("body").innerText() }, null, 2)
);
console.log("DONE");
