#!/usr/bin/env node
import { chromium } from "playwright";
import { join } from "path";
import { mkdirSync } from "fs";

const OUT = join(process.cwd(), ".cursor", "yandex360-setup");
const profileDir = join(OUT, "pw-profile");
mkdirSync(OUT, { recursive: true });

async function main() {
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    viewport: { width: 1400, height: 900 },
    locale: "ru-RU",
  });
  const page = context.pages()[0] || (await context.newPage());
  await page.goto("https://admin.yandex.ru/select-organization?uid=112696101", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  await page.getByText("kopinfo.ru").first().click({ force: true });
  await page.waitForTimeout(3000);
  await page.goto("https://admin.yandex.ru/mail/settings", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: join(OUT, "mail-settings.png"), fullPage: true });
  const body = await page.locator("body").innerText();
  console.log(body.slice(0, 2500));
  await context.close();
}

main();
