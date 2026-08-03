#!/usr/bin/env node
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const OUT = join(process.cwd(), ".cursor", "gsc-security-review");
mkdirSync(OUT, { recursive: true });
const REVIEW =
  "Удалили тестовые и дублирующие APK с публичных путей: /zovus.apk, /test-root.apk, /releases/test.apk, /releases/zovus-latest.zip. Оставили только официальный релиз /releases/zovus-latest.apk. Вредоносного кода и фишинга нет. Zovus (zovus.ru) — легитимный сервис. Просим снять пометку Safe Browsing / обманные страницы.";

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page =
  browser.contexts()[0].pages().find((p) => p.url().includes("search.google")) ||
  (await browser.contexts()[0].newPage());

await page.goto(
  "https://search.google.com/search-console/security-issues?resource_id=https%3A%2F%2Fzovus.ru%2F",
  { waitUntil: "domcontentloaded", timeout: 90000 }
);
await page.waitForTimeout(3500);

// Open dialog if not open
if (!(await page.locator("body").innerText()).includes("Отправить запрос")) {
  await page.getByRole("button", { name: /Запросить проверку/i }).first().click({ force: true });
  await page.waitForTimeout(2500);
}

// Check "Все проблемы устранены"
await page.getByText("Все проблемы устранены", { exact: true }).first().click({ force: true });
await page.waitForTimeout(500);
await page.evaluate(() => {
  for (const cb of document.querySelectorAll('[role="checkbox"]')) {
    if (cb.getAttribute("aria-checked") !== "true") cb.click();
  }
});
await page.waitForTimeout(500);

// Fill explanation
const ta = page.locator("textarea").first();
await ta.waitFor({ state: "visible", timeout: 10000 });
await ta.click({ force: true });
await ta.fill(REVIEW);
await page.waitForTimeout(500);

await page.screenshot({ path: join(OUT, "submit-01.png"), fullPage: true });
console.log("form ready", (await page.locator("body").innerText()).includes(REVIEW.slice(0, 40)));

// Submit
const submit = page.getByRole("button", { name: /Отправить запрос/i }).first();
console.log("submit visible", await submit.isVisible().catch(() => false), "enabled", await submit.isEnabled().catch(() => false));
await submit.click({ force: true });
await page.waitForTimeout(6000);

const finalText = await page.locator("body").innerText();
console.log("FINAL", finalText.slice(0, 3500));
await page.screenshot({ path: join(OUT, "submit-02.png"), fullPage: true });
writeFileSync(join(OUT, "submit-result.json"), JSON.stringify({ url: page.url(), text: finalText }, null, 2));

if (/отправлен|на проверке|requested|review/i.test(finalText) || !/Отправить запрос/i.test(finalText)) {
  console.log("LIKELY_SUBMITTED");
} else {
  console.log("MAYBE_NOT_SUBMITTED");
}
console.log("DONE");
