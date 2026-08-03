#!/usr/bin/env node
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", ".cursor", "organic-finish");
mkdirSync(OUT, { recursive: true });
const report = { at: new Date().toISOString() };

async function shot(page, name) {
  const p = join(OUT, `${name}.png`);
  try {
    await page.screenshot({ path: p, timeout: 12000 });
  } catch {
    /* ignore */
  }
  return p;
}

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const ctx = browser.contexts()[0];
let page = ctx.pages().find((p) => /dzen\.ru/i.test(p.url())) || ctx.pages()[0];

// Prefer editor tab
page = ctx.pages().find((p) => /edit|publication|profile\/editor/i.test(p.url())) || page;
console.log("page", page.url());

// If modal already open, click Опубликовать inside modal
const modalPub = page.locator('.ReactModal__Content').getByRole("button", { name: /^Опубликовать$/ }).first();
const anyPub = page.getByRole("button", { name: /^Опубликовать$/ });

if (await modalPub.isVisible().catch(() => false)) {
  await modalPub.click({ force: true });
  console.log("clicked modal publish");
} else if ((await anyPub.count()) > 0) {
  // click the last/visible publish (modal one usually last)
  const n = await anyPub.count();
  for (let i = n - 1; i >= 0; i--) {
    const btn = anyPub.nth(i);
    if (await btn.isVisible().catch(() => false)) {
      await btn.click({ force: true });
      console.log("clicked publish idx", i);
      break;
    }
  }
} else {
  // reopen publish from editor
  if (!/edit/i.test(page.url())) {
    await page.goto(
      "https://dzen.ru/profile/editor/id/6a50b97e363bf24ef269684e/6a6f13aeaed80159d0ebc649/edit",
      { waitUntil: "domcontentloaded" },
    );
    await page.waitForTimeout(2000);
  }
  await page.getByRole("button", { name: /Опубликовать/i }).first().click({ force: true });
  await page.waitForTimeout(1500);
  const again = page.locator('.ReactModal__Content').getByRole("button", { name: /^Опубликовать$/ }).first();
  if (await again.isVisible().catch(() => false)) {
    await again.click({ force: true });
    console.log("clicked confirm after reopen");
  }
}

await page.waitForTimeout(5000);
report.afterUrl = page.url();
report.shot = await shot(page, "dzen-confirmed");

// Check publications list
await page.goto("https://dzen.ru/profile/editor/id/6a50b97e363bf24ef269684e/publications", {
  waitUntil: "domcontentloaded",
});
await page.waitForTimeout(3000);
const pubsText = await page.locator("body").innerText();
report.pubsHasTitle = /Telegram-бот Zovus/i.test(pubsText);
report.pubsShot = await shot(page, "dzen-pubs-after");

await page.goto("https://dzen.ru/id/6a50b97e363bf24ef269684e", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000);
const ch = await page.locator("body").innerText();
report.channelHasTitle = /Telegram-бот Zovus|zovus_card_bot/i.test(ch);
report.channelShot = await shot(page, "dzen-channel-final");

// Find article link
report.articleLink = await page.evaluate(() => {
  const a = [...document.querySelectorAll("a[href*='/a/']")].find((el) =>
    /Telegram|бот|Zovus/i.test(el.textContent || ""),
  );
  return a?.href || null;
});

// VK quick confirm
const vk = await ctx.newPage();
await vk.goto("https://vk.ru/wall-240408086_38", { waitUntil: "domcontentloaded" });
await vk.waitForTimeout(2500);
const vkText = await vk.locator("body").innerText();
report.vk38 = {
  hasBot: /zovus_card_bot/i.test(vkText),
  url: vk.url(),
  shot: await shot(vk, "vk-38"),
};
await vk.close();

writeFileSync(join(OUT, "post-result10.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(report.pubsHasTitle || report.channelHasTitle || report.vk38?.hasBot ? 0 : 1);
