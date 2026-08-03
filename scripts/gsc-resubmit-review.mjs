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
await page.waitForTimeout(4000);

await page.getByText("Обманные страницы").first().click({ force: true }).catch(() => {});
await page.waitForTimeout(1500);

const req = page.getByRole("button", { name: /Запросить проверку/i }).first();
if (!(await req.count())) {
  await page.getByText(/ЗАПРОСИТЬ ПРОВЕРКУ/i).first().click({ force: true });
} else {
  await req.click({ force: true });
}
await page.waitForTimeout(3000);
await page.screenshot({ path: join(OUT, "resubmit-01.png"), timeout: 10000 }).catch(() => {});

// checkbox
await page.getByText("Все проблемы устранены", { exact: true }).first().click({ force: true }).catch(() => {});
await page.evaluate(() => {
  for (const cb of document.querySelectorAll('[role="checkbox"]')) {
    if (cb.getAttribute("aria-checked") !== "true") cb.click();
  }
});
await page.waitForTimeout(800);

const ta = page.locator("textarea").first();
await ta.waitFor({ state: "visible", timeout: 15000 });
await ta.click({ force: true });
await ta.fill(REVIEW);
await page.waitForTimeout(500);

const submit = page.getByRole("button", { name: /Отправить запрос/i }).first();
console.log("submit", {
  count: await submit.count(),
  visible: await submit.isVisible().catch(() => false),
  enabled: await submit.isEnabled().catch(() => false),
});
await submit.click({ force: true });
await page.waitForTimeout(6000);

const text = await page.locator("body").innerText();
console.log(text.slice(0, 3000));
await page.screenshot({ path: join(OUT, "resubmit-02.png"), timeout: 10000 }).catch(() => {});
writeFileSync(join(OUT, "resubmit-result.json"), JSON.stringify({ url: page.url(), text }, null, 2));

if (/Запрос отправлен/i.test(text)) console.log("SUBMITTED_OK");
else if (/Отправить запрос/i.test(text)) console.log("STILL_OPEN");
else console.log("UNKNOWN");
console.log("DONE");
