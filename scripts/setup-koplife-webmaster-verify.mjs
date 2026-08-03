#!/usr/bin/env node
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const OUT = join(process.cwd(), ".cursor", "yandex-koplife-setup");
const PROFILE = join(process.cwd(), ".cursor", "yandex360-setup", "pw-profile");
mkdirSync(OUT, { recursive: true });
const snap = (p, n) => p.screenshot({ path: join(OUT, `${n}.png`), fullPage: true }).catch(() => {});

async function main() {
  const context = await chromium.launchPersistentContext(PROFILE, {
    headless: false,
    viewport: { width: 1440, height: 960 },
    locale: "ru-RU",
    slowMo: 60,
  });
  const page = context.pages()[0] || (await context.newPage());

  const url = "https://webmaster.yandex.ru/site/https:koplife.ru:443/settings/access/";
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(4000);
  await snap(page, "90-access");

  // Click Метатег tab
  await page.getByRole("tab", { name: /Метатег/i }).click({ force: true }).catch(async () => {
    await page.getByText("Метатег", { exact: true }).click({ force: true });
  });
  await page.waitForTimeout(2500);
  await snap(page, "91-meta");

  let html = await page.content();
  let text = await page.locator("body").innerText();
  writeFileSync(join(OUT, "meta-tab.txt"), text);
  writeFileSync(join(OUT, "meta-tab.html"), html);

  let code =
    html.match(/yandex-verification["'\s]+content=["']([a-f0-9]+)["']/i)?.[1] ||
    text.match(/content=["']([a-f0-9]+)["']/i)?.[1] ||
    text.match(/yandex-verification["'\s:]+([a-f0-9]+)/i)?.[1] ||
    null;

  // Also try HTML file tab for filename
  await page.getByText("HTML-файл", { exact: false }).first().click({ force: true });
  await page.waitForTimeout(2000);
  await snap(page, "92-htmlfile");
  const htmlTab = await page.locator("body").innerText();
  writeFileSync(join(OUT, "htmlfile-tab.txt"), htmlTab);
  const fileMatch = htmlTab.match(/yandex_[a-z0-9]+\.html/i);
  const fileCode = htmlTab.match(/yandex_([a-f0-9]+)\.html/i)?.[1];

  // back to meta if needed
  if (!code) {
    await page.getByText("Метатег", { exact: true }).click({ force: true });
    await page.waitForTimeout(1500);
    text = await page.locator("body").innerText();
    html = await page.content();
    code =
      html.match(/content=["']([a-f0-9]{8,})["']/i)?.[1] ||
      text.match(/content=["']([a-f0-9]{8,})["']/i)?.[1] ||
      [...text.matchAll(/\b([a-f0-9]{16})\b/g)].map((x) => x[1]).find(Boolean) ||
      null;
  }

  // clipboard buttons
  const clips = page.locator("[data-clipboard-text], button:has-text('Копировать')");
  const cc = await clips.count();
  for (let i = 0; i < cc; i++) {
    const v = await clips.nth(i).getAttribute("data-clipboard-text");
    if (v && /[a-f0-9]{8,}/i.test(v)) {
      code = code || v.match(/[a-f0-9]{8,}/i)[0];
      console.log("clipboard", v.slice(0, 120));
    }
  }

  const result = {
    metaCode: code,
    htmlFile: fileMatch?.[0] || null,
    fileCode: fileCode || null,
    url: page.url(),
  };
  writeFileSync(join(OUT, "verify-codes.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));

  // leave browser open codes for next step after deploy — don't click confirm yet
  await context.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
