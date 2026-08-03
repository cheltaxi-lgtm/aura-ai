#!/usr/bin/env node
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", ".cursor", "organic-finish");
mkdirSync(OUT, { recursive: true });

async function shot(page, name) {
  const p = join(OUT, `${name}.png`);
  await page.screenshot({ path: p, timeout: 15000 }).catch(() => {});
  return p;
}

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const ctx = browser.contexts()[0];
const page =
  ctx.pages().find((p) => /6a6f13aeaed80159d0ebc649\/edit/i.test(p.url())) ||
  ctx.pages().find((p) => /dzen\.ru/i.test(p.url())) ||
  ctx.pages()[0];

const EDIT =
  "https://dzen.ru/profile/editor/id/6a50b97e363bf24ef269684e/6a6f13aeaed80159d0ebc649/edit";

if (!/6a6f13aeaed80159d0ebc649\/edit/i.test(page.url())) {
  await page.goto(EDIT, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2500);
}

console.log("start", page.url());
await shot(page, "dzen-m1");

// Dismiss help / NEW popups
await page.keyboard.press("Escape");
await page.waitForTimeout(400);
await page.evaluate(() => {
  document.querySelectorAll("[class*='help-popup'], [class*='onboarding']").forEach((el) => {
    const root = el.closest(".ReactModalPortal") || el;
    root.remove?.();
  });
});

// Open publish modal from header orange button
const headerPub = page.locator("header").getByRole("button", { name: /Опубликовать/i }).first();
if (await headerPub.isVisible().catch(() => false)) {
  await headerPub.click({ force: true });
  console.log("header publish clicked");
  await page.waitForTimeout(1500);
} else {
  const any = page.getByRole("button", { name: /Опубликовать/i }).first();
  if (await any.isVisible().catch(() => false)) {
    await any.click({ force: true });
    console.log("any publish clicked");
    await page.waitForTimeout(1500);
  }
}
await shot(page, "dzen-m2");

// Inspect modal buttons
const modalInfo = await page.evaluate(() => {
  const modal = document.querySelector(".ReactModal__Content");
  if (!modal) return { hasModal: false };
  const buttons = [...modal.querySelectorAll("button")].map((b) => ({
    text: (b.textContent || "").trim(),
    disabled: b.disabled,
    cls: (b.className || "").toString().slice(0, 80),
  }));
  return {
    hasModal: true,
    title: (modal.querySelector("h1,h2,[class*='title']")?.textContent || "").trim().slice(0, 80),
    buttons,
    text: (modal.innerText || "").slice(0, 600),
  };
});
console.log("modal", modalInfo);
writeFileSync(join(OUT, "dzen-modal-info.json"), JSON.stringify(modalInfo, null, 2));

if (modalInfo.hasModal) {
  // Click black Опубликовать inside modal via evaluate for reliability
  const clicked = await page.evaluate(() => {
    const modal = document.querySelector(".ReactModal__Content");
    if (!modal) return false;
    const btns = [...modal.querySelectorAll("button")].filter((b) =>
      /^Опубликовать$/i.test((b.textContent || "").trim()),
    );
    const btn = btns[btns.length - 1];
    if (!btn) return false;
    btn.click();
    return true;
  });
  console.log("evaluate click", clicked);
  await page.waitForTimeout(5000);
} else {
  console.log("no modal — try draft list / recreate");
}

await shot(page, "dzen-m3");

// Wait for navigation or success toast
for (let i = 0; i < 8; i++) {
  const url = page.url();
  const body = await page.locator("body").innerText().catch(() => "");
  const done =
    !/\/edit$/i.test(url) ||
    /опубликован|успешно|публикаци[яи].*готов/i.test(body) ||
    !(await page.locator(".ReactModal__Content").isVisible().catch(() => false));
  console.log("poll", i, url, "modalOpen", await page.locator(".ReactModal__Content").isVisible().catch(() => false));
  if (done && i > 0) break;
  // if modal still open, click again
  if (await page.locator(".ReactModal__Content").getByRole("button", { name: /^Опубликовать$/ }).isVisible().catch(() => false)) {
    await page.locator(".ReactModal__Content").getByRole("button", { name: /^Опубликовать$/ }).click({ force: true });
    console.log("re-click modal");
  }
  await page.waitForTimeout(1500);
}

await shot(page, "dzen-m4");

await page.goto("https://dzen.ru/profile/editor/id/6a50b97e363bf24ef269684e/publications", {
  waitUntil: "domcontentloaded",
});
await page.waitForTimeout(3000);
const pubs = await page.locator("body").innerText();
const has = /Telegram-бот Zovus/i.test(pubs);
await shot(page, "dzen-m5-pubs");

// Also drafts tab
const draftsTab = page.getByText(/Черновики/i).first();
if (await draftsTab.isVisible().catch(() => false)) {
  await draftsTab.click();
  await page.waitForTimeout(2000);
}
await shot(page, "dzen-m6-drafts");
const draftsText = await page.locator("body").innerText();

const result = {
  hasInPubs: has,
  hasInDrafts: /Telegram-бот Zovus/i.test(draftsText),
  finalUrl: page.url(),
  pubsSnippet: pubs.slice(0, 500),
};
writeFileSync(join(OUT, "post-result11.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
process.exit(has ? 0 : 2);
