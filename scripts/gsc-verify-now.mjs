#!/usr/bin/env node
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const OUT = join(process.cwd(), ".cursor", "gsc-security-review");
mkdirSync(OUT, { recursive: true });
const REVIEW =
  "Удалили тестовые и дублирующие APK с публичных путей: /zovus.apk, /test-root.apk, /releases/test.apk, /releases/zovus-latest.zip. Оставили только официальный /releases/zovus-latest.apk. Вредоносного кода и фишинга нет. Сайт легитимный (Zovus, zovus.ru). Просим снять пометку Safe Browsing / social engineering.";

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page =
  browser.contexts()[0].pages().find((p) => p.url().includes("search.google")) ||
  (await browser.contexts()[0].newPage());

async function snap(n) {
  await page.screenshot({ path: join(OUT, `${n}.png`), fullPage: true });
}
async function body() {
  return page.locator("body").innerText();
}

// Re-open welcome ownership dialog for the property
await page.goto("https://search.google.com/search-console/welcome", {
  waitUntil: "domcontentloaded",
  timeout: 90000,
});
await page.waitForTimeout(2500);

// If dialog not open, re-add URL prefix quickly
if (!(await body()).includes("Подтверждение права собственности")) {
  const urlInput = page.locator('input[aria-label="https://www.example.com"], input[aria-label*="https://"]').first();
  if (await urlInput.count()) {
    await urlInput.fill("https://zovus.ru/", { force: true });
    await page.evaluate(() => {
      const input = document.querySelector('input[aria-label="https://www.example.com"], input[aria-label*="https://"]');
      let root = input;
      for (let i = 0; i < 12 && root; i++) {
        const btn = [...root.querySelectorAll("button")].find((b) => /Продолжить|Continue/i.test(b.textContent || ""));
        if (btn) {
          btn.click();
          return;
        }
        root = root.parentElement;
      }
    });
    await page.waitForTimeout(4000);
  }
}

console.log("pre-verify", page.url());
console.log((await body()).slice(0, 1200));
await snap("vn-01");

// Expand HTML file method if collapsed
await page.evaluate(() => {
  const nodes = [...document.querySelectorAll("div,span,button")];
  const hit = nodes.find((n) => /HTML-файл|HTML file/i.test((n.textContent || "").trim()) && (n.textContent || "").trim().length < 40);
  if (hit) hit.click();
});
await page.waitForTimeout(1000);

// Click ПОДТВЕРДИТЬ
const verifyClicked = await page.evaluate(() => {
  const buttons = [...document.querySelectorAll("button")];
  const b = buttons.find((x) => /^(ПОДТВЕРДИТЬ|Подтвердить|VERIFY|Verify)$/i.test((x.textContent || "").trim()));
  if (b) {
    b.click();
    return (b.textContent || "").trim();
  }
  const soft = buttons.find((x) => /ПОДТВЕРДИТЬ|Verify/i.test(x.textContent || ""));
  if (soft) {
    soft.click();
    return "soft:" + (soft.textContent || "").trim();
  }
  return null;
});
console.log("verifyClicked", verifyClicked);
await page.waitForTimeout(8000);
console.log("after", page.url());
console.log((await body()).slice(0, 2000));
await snap("vn-02");

// Click ГОТОВО if present
await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((x) => /^(ГОТОВО|Done)$/i.test((x.textContent || "").trim()));
  if (b) b.click();
});
await page.waitForTimeout(3000);

// Security issues
await page.goto(
  "https://search.google.com/search-console/security-issues?resource_id=https%3A%2F%2Fzovus.ru%2F",
  { waitUntil: "domcontentloaded", timeout: 90000 }
);
await page.waitForTimeout(5000);
let t = await body();
console.log("sec", page.url());
console.log(t.slice(0, 2000));
await snap("vn-03");

if (/нет доступа|not-verified/i.test(t + page.url())) {
  // try overview
  await page.goto("https://search.google.com/search-console?resource_id=https%3A%2F%2Fzovus.ru%2F", {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await page.waitForTimeout(4000);
  console.log("overview", page.url(), (await body()).slice(0, 1500));
  await snap("vn-04");
} else {
  const issue = page.locator("a,button,[role=row],div").filter({ hasText: /Social engineering|Социальн|Unsafe|Небезопас|обман/i }).first();
  if (await issue.count()) {
    await issue.click({ force: true });
    await page.waitForTimeout(2500);
  }
  const review = page.locator("button,a,[role=button]").filter({ hasText: /Request a review|Запросить проверку/i }).first();
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
  } else {
    console.log("NO_REVIEW_BUTTON");
  }
  console.log("final", (await body()).slice(0, 2000));
  await snap("vn-05");
}

writeFileSync(join(OUT, "vn-result.json"), JSON.stringify({ url: page.url(), text: await body() }, null, 2));
console.log("DONE");
