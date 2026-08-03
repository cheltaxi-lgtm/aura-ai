#!/usr/bin/env node
import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { join } from "path";

const OUT = join(process.cwd(), ".cursor", "gsc-security-review");
mkdirSync(OUT, { recursive: true });

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const context = browser.contexts()[0];
const page =
  context.pages().find((p) => p.url().includes("accounts.google") || p.url().includes("search.google")) ||
  (await context.newPage());

await page.goto(
  "https://accounts.google.com/ServiceLogin?continue=https://search.google.com/search-console/security-issues?resource_id=sc-domain%3Azovus.ru",
  { waitUntil: "domcontentloaded", timeout: 60000 }
);
await page.waitForTimeout(3000);
console.log("url", page.url());

const email = page.locator('input[type="email"], input[name="identifier"]').first();
if (await email.count()) {
  await email.fill("cheltaxi@gmail.com");
  const next = page.locator("#identifierNext button, #identifierNext, button:has-text('Далее'), button:has-text('Next')").first();
  await next.click();
  await page.waitForTimeout(4000);
}
console.log("after email", page.url());
console.log((await page.locator("body").innerText()).slice(0, 1500).replace(/\s+/g, " "));

const another = page
  .locator("button, a, span, div[role='link'], div[role='button']")
  .filter({ hasText: /Try another way|Другой способ|More ways|Другие способы/i })
  .first();
if (await another.count()) {
  await another.click();
  await page.waitForTimeout(2000);
  console.log("ALT", (await page.locator("body").innerText()).slice(0, 1500).replace(/\s+/g, " "));
}

await page.screenshot({ path: join(OUT, "login-state.png"), fullPage: true });
