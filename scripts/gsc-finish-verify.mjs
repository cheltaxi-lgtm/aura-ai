#!/usr/bin/env node
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const OUT = join(process.cwd(), ".cursor", "gsc-security-review");
mkdirSync(OUT, { recursive: true });
const REVIEW =
  "Удалили тестовые APK (/zovus.apk, /test-root.apk, /releases/test.apk, /releases/zovus-latest.zip). Оставили /releases/zovus-latest.apk. Фишинга/вредоносов нет. Zovus — легитимный сервис. Просим снять Safe Browsing social engineering.";

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
await page.waitForTimeout(2500);

const finish = await page.evaluate(() => {
  const el = [...document.querySelectorAll("a,button,div,span")].find(
    (e) =>
      /Завершить процедуру подтверждения/i.test((e.textContent || "").trim()) &&
      (e.textContent || "").trim().length < 80
  );
  if (el) {
    el.click();
    return el.textContent.trim();
  }
  return null;
});
console.log("finish", finish);
await page.waitForTimeout(4000);
console.log("url", page.url());
console.log((await page.locator("body").innerText()).slice(0, 1500));
await snap("finish-01");

if (!(await page.locator("body").innerText()).includes("Подтверждение права собственности")) {
  const urlInput = page
    .locator('input[aria-label="https://www.example.com"], input[aria-label*="https://"]')
    .first();
  await urlInput.fill("https://zovus.ru/", { force: true });
  await page.evaluate(() => {
    const input = document.querySelector(
      'input[aria-label="https://www.example.com"], input[aria-label*="https://"]'
    );
    let root = input;
    for (let i = 0; i < 12 && root; i++) {
      const btn = [...root.querySelectorAll("button")].find((b) =>
        /Продолжить|Continue/i.test(b.textContent || "")
      );
      if (btn) {
        btn.click();
        return;
      }
      root = root.parentElement;
    }
  });
  await page.waitForTimeout(4500);
}

console.log("dialog", (await page.locator("body").innerText()).slice(0, 2000));
await snap("finish-02");
writeFileSync(join(OUT, "finish-02.html"), await page.content());

// Expand HTML method
await page.evaluate(() => {
  const n = [...document.querySelectorAll("div,span,button")].find((e) => {
    const t = (e.textContent || "").trim();
    return /^HTML-файл$/i.test(t) || /^HTML file$/i.test(t);
  });
  if (n) n.click();
});
await page.waitForTimeout(1500);

const buttons = await page.evaluate(() =>
  [...document.querySelectorAll("button")].map((x) => (x.textContent || "").trim()).filter(Boolean)
);
console.log("buttons", buttons.slice(0, 50));

const verify = await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((x) =>
    /^(ПОДТВЕРДИТЬ|Подтвердить|VERIFY|Verify)$/i.test((x.textContent || "").trim())
  );
  if (!b) return null;
  b.click();
  return b.textContent.trim();
});
console.log("verify", verify);
await page.waitForTimeout(10000);
console.log("afterV", page.url());
console.log((await page.locator("body").innerText()).slice(0, 2500));
await snap("finish-03");

await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((x) =>
    /^(ГОТОВО|Done)$/i.test((x.textContent || "").trim())
  );
  if (b) b.click();
});
await page.waitForTimeout(3000);

await page.goto(
  "https://search.google.com/search-console/security-issues?resource_id=https%3A%2F%2Fzovus.ru%2F",
  { waitUntil: "domcontentloaded", timeout: 90000 }
);
await page.waitForTimeout(5000);
let t = await page.locator("body").innerText();
console.log("SEC", page.url());
console.log(t.slice(0, 2500));
await snap("finish-04");

if (!/нет доступа|not-verified/i.test(t + page.url())) {
  const issue = page
    .locator("a,button,[role=row],div")
    .filter({ hasText: /Social engineering|Социальн|Unsafe|Небезопас|обман/i })
    .first();
  if (await issue.count()) {
    await issue.click({ force: true });
    await page.waitForTimeout(2500);
  }
  const review = page
    .locator("button,a,[role=button]")
    .filter({ hasText: /Request a review|Запросить проверку/i })
    .first();
  if (await review.count()) {
    await review.click({ force: true });
    await page.waitForTimeout(2000);
    const ta = page.locator("textarea").first();
    if (await ta.count()) await ta.fill(REVIEW);
    const cbs = page.locator('input[type=checkbox]');
    for (let i = 0; i < (await cbs.count()); i++) await cbs.nth(i).check({ force: true }).catch(() => {});
    const submit = page.locator("button").filter({ hasText: /Submit|Отправить|Request|Запросить/i }).last();
    if (await submit.count()) {
      await submit.click({ force: true });
      await page.waitForTimeout(4000);
      console.log("REVIEW_SUBMITTED");
    }
  }
  console.log("FINAL", (await page.locator("body").innerText()).slice(0, 2000));
  await snap("finish-05");
}

writeFileSync(
  join(OUT, "finish-result.json"),
  JSON.stringify({ url: page.url(), text: await page.locator("body").innerText() }, null, 2)
);
console.log("DONE");
