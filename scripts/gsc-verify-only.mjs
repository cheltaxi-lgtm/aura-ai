#!/usr/bin/env node
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const OUT = join(process.cwd(), ".cursor", "gsc-security-review");
mkdirSync(OUT, { recursive: true });
const REVIEW =
  "Удалили тестовые APK (/zovus.apk, /test-root.apk, /releases/test.apk, /releases/zovus-latest.zip). Оставили только официальный /releases/zovus-latest.apk. Фишинга и вредоносного кода нет. Zovus (zovus.ru) — легитимный сервис. Просим снять пометку Safe Browsing / social engineering.";

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page =
  browser.contexts()[0].pages().find((p) => p.url().includes("search.google")) ||
  (await browser.contexts()[0].newPage());

await page.goto("https://search.google.com/search-console/welcome", {
  waitUntil: "domcontentloaded",
  timeout: 90000,
});
await page.waitForTimeout(2000);
await page.getByText(/Завершить процедуру подтверждения/i).first().click({ force: true });
await page.waitForTimeout(2000);
await page.getByText("https://zovus.ru/", { exact: true }).first().click({ force: true });
await page.waitForTimeout(4000);
const ok = page.getByRole("button", { name: /^ОК$|^OK$/i }).first();
if (await ok.count()) await ok.click({ force: true });
await page.waitForTimeout(800);

await page.evaluate(() => document.querySelector("#TZk80d")?.click());
await page.waitForTimeout(12000);
const after = await page.locator("body").innerText();
console.log(after.slice(0, 2500));
await page.screenshot({ path: join(OUT, "vo-01.png"), fullPage: true });
writeFileSync(join(OUT, "vo-after.txt"), after);

if (/Не удалось|Неверное/i.test(after)) {
  console.log("FAILED_HTML_FILE");
  // try meta tag verify button (second Подтвердить)
  await page.getByRole("button", { name: /^ОК$|^OK$/i }).first().click({ force: true }).catch(() => {});
  await page.waitForTimeout(1000);
  await page.getByText("Тег HTML", { exact: true }).first().click({ force: true });
  await page.waitForTimeout(1500);
  const btns = page.getByRole("button", { name: /^Подтвердить$/i });
  const n = await btns.count();
  console.log("confirm buttons", n);
  if (n) await btns.nth(Math.min(1, n - 1)).click({ force: true });
  await page.waitForTimeout(12000);
  console.log((await page.locator("body").innerText()).slice(0, 2000));
  await page.screenshot({ path: join(OUT, "vo-02.png"), fullPage: true });
}

const done = page.getByRole("button", { name: /^(ГОТОВО|Done|ОК|OK)$/i }).first();
if (await done.count()) await done.click({ force: true }).catch(() => {});
await page.waitForTimeout(2500);

await page.goto(
  "https://search.google.com/search-console/security-issues?resource_id=https%3A%2F%2Fzovus.ru%2F",
  { waitUntil: "domcontentloaded", timeout: 90000 }
);
await page.waitForTimeout(5000);
let t = await page.locator("body").innerText();
console.log("SEC", page.url());
console.log(t.slice(0, 3000));
await page.screenshot({ path: join(OUT, "vo-03.png"), fullPage: true });

if (!/нет доступа|not-verified/i.test(t + page.url())) {
  const issue = page.locator("a,button,[role=row]").filter({ hasText: /Social|Социальн|Unsafe|Небезопас|обман/i }).first();
  if (await issue.count()) {
    await issue.click({ force: true });
    await page.waitForTimeout(2000);
  }
  const review = page.locator("a,button,[role=button]").filter({ hasText: /Request a review|Запросить проверку/i }).first();
  if (await review.count()) {
    await review.click({ force: true });
    await page.waitForTimeout(1500);
    const ta = page.locator("textarea").first();
    if (await ta.count()) await ta.fill(REVIEW);
    const cbs = page.locator('input[type=checkbox]');
    for (let i = 0; i < (await cbs.count()); i++) await cbs.nth(i).check({ force: true }).catch(() => {});
    const submit = page.getByRole("button", { name: /Submit|Отправить|Request|Запросить/i }).last();
    if (await submit.count()) {
      await submit.click({ force: true });
      await page.waitForTimeout(5000);
      console.log("REVIEW_SUBMITTED");
    }
  }
  console.log("FINAL", (await page.locator("body").innerText()).slice(0, 2000));
}
console.log("DONE");
