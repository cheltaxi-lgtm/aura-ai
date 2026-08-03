#!/usr/bin/env node
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const OUT = join(process.cwd(), ".cursor", "gsc-security-review");
mkdirSync(OUT, { recursive: true });

const REVIEW =
  "Удалили тестовые и дублирующие APK с публичных путей сайта: /zovus.apk, /test-root.apk, /releases/test.apk, /releases/zovus-latest.zip. Оставили только официальный релиз /releases/zovus-latest.apk. Проверили сервер: вредоносного кода и фишинговых страниц нет. Сайт — легитимный сервис Zovus (zovus.ru). Просим перепроверить пометку Safe Browsing (social engineering).";

async function snap(page, name) {
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true }).catch(() => {});
}

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const context = browser.contexts()[0];
let page =
  context.pages().find((p) => p.url().includes("search.google.com/search-console")) ||
  (await context.newPage());

async function dump(label) {
  const text = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
  console.log(`[${label}] ${page.url()}`);
  console.log(text.slice(0, 800));
  await snap(page, label);
  return text;
}

// 1) Open welcome / property list
await page.goto("https://search.google.com/search-console", { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForTimeout(4000);
let text = await dump("01-home");

// Try open property selector
const selectors = [
  '[aria-label*="Search property"]',
  '[aria-label*="ресурс"]',
  '[data-open-resource-selector]',
  'button:has-text("Search property")',
  'button:has-text("Выберите")',
  'div[role="button"]:has-text("zovus")',
  'header button',
];
for (const sel of selectors) {
  const el = page.locator(sel).first();
  if (await el.count()) {
    console.log("click picker", sel);
    await el.click({ force: true }).catch(() => {});
    await page.waitForTimeout(1500);
    break;
  }
}
await dump("02-picker");

// Collect visible property names
const allText = await page.locator("body").innerText();
const props = [...allText.matchAll(/(?:sc-domain:)?[\w.-]+\.[a-z]{2,}|https?:\/\/[\w./-]+/gi)].map((m) => m[0]);
console.log("props_guess=", [...new Set(props)].slice(0, 40).join(" | "));

// Click zovus if listed
const zovus = page.getByText(/zovus\.ru/i).first();
if (await zovus.count()) {
  console.log("click zovus text");
  await zovus.click({ force: true });
  await page.waitForTimeout(4000);
}
await dump("03-after-zovus");

// Try candidate resource URLs
const candidates = [
  "https://search.google.com/search-console/security-issues?resource_id=https%3A%2F%2Fzovus.ru%2F",
  "https://search.google.com/search-console/security-issues?resource_id=sc-domain%3Azovus.ru",
  "https://search.google.com/search-console/security-issues?resource_id=https%3A%2F%2Fwww.zovus.ru%2F",
  "https://search.google.com/search-console?resource_id=https%3A%2F%2Fzovus.ru%2F",
  "https://search.google.com/search-console/welcome",
];

for (const url of candidates) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(3500);
  text = await dump(`04-${candidates.indexOf(url)}`);
  if (/security|безопас|Request a review|Запросить проверку|Social engineering|Социальн/i.test(text) && !/not-verified|нет доступа|don't have access|не подтвержд/i.test(text)) {
    console.log("LANDED_OK", url);
    break;
  }
}

// If on welcome - add property
if (/welcome|добавить ресурс|Add property|Start now|Попробовать/i.test(text) || /not-verified/i.test(page.url())) {
  console.log("NEED_ADD_OR_VERIFY");
  // try settings / user properties list
  await page.goto("https://search.google.com/search-console/welcome", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  await dump("05-welcome");

  // Click URL prefix / domain options if present
  const addBtn = page.locator('button:has-text("Add property"), button:has-text("Добавить ресурс"), [aria-label*="Add property"]').first();
  if (await addBtn.count()) {
    await addBtn.click({ force: true });
    await page.waitForTimeout(2000);
  }
  // Fill domain
  const domainInput = page.locator('input[type="text"], input[aria-label*="domain"], input[aria-label*="URL"]').first();
  if (await domainInput.count()) {
    await domainInput.fill("zovus.ru");
    console.log("filled domain");
  }
  await dump("06-add");
}

// Try review buttons
const reviewSelectors = [
  'button:has-text("Request a review")',
  'button:has-text("Request review")',
  'button:has-text("Запросить проверку")',
  'a:has-text("Request a review")',
  'a:has-text("Запросить проверку")',
  '[role="button"]:has-text("Запросить")',
  '[role="button"]:has-text("Request")',
];

let clicked = false;
for (const sel of reviewSelectors) {
  const btn = page.locator(sel).first();
  if (await btn.count()) {
    console.log("click", sel);
    await btn.click({ force: true });
    clicked = true;
    await page.waitForTimeout(2000);
    break;
  }
}

if (!clicked) {
  const issue = page.locator("a,button,[role='row'],[role='link']").filter({ hasText: /Social engineering|Социальн|Deceptive|Обман|Unsafe|Небезопас/i }).first();
  if (await issue.count()) {
    await issue.click({ force: true });
    await page.waitForTimeout(2500);
    await dump("07-issue");
    for (const sel of reviewSelectors) {
      const btn = page.locator(sel).first();
      if (await btn.count()) {
        await btn.click({ force: true });
        clicked = true;
        await page.waitForTimeout(2000);
        break;
      }
    }
  }
}

if (clicked) {
  await dump("08-dialog");
  const ta = page.locator("textarea").first();
  if (await ta.count()) {
    await ta.fill(REVIEW);
    console.log("filled review");
  }
  // checkboxes
  const cbs = page.locator('input[type="checkbox"]');
  const n = await cbs.count();
  for (let i = 0; i < n; i++) {
    await cbs.nth(i).check({ force: true }).catch(() => {});
  }
  const submit = page
    .locator('button:has-text("Submit"), button:has-text("Отправить"), button:has-text("Request a review"), button:has-text("Запросить проверку")')
    .last();
  if (await submit.count()) {
    await submit.click({ force: true });
    await page.waitForTimeout(4000);
    console.log("SUBMIT_CLICKED");
  }
}

const finalText = await page.locator("body").innerText();
writeFileSync(
  join(OUT, "continue-result.json"),
  JSON.stringify({ url: page.url(), clicked, text: finalText.slice(0, 6000) }, null, 2)
);
await dump("09-final");
console.log("DONE");
