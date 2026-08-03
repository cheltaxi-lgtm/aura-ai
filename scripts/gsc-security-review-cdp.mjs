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

function log(m) {
  console.log(m);
}

async function main() {
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
  const context = browser.contexts()[0] || (await browser.newContext());
  let page = context.pages().find((p) => p.url().includes("search.google.com") || p.url().includes("accounts.google.com"));
  if (!page) {
    page = context.pages().find((p) => p.url().startsWith("http")) || context.pages()[0] || (await context.newPage());
  }

  const targets = [
    "https://search.google.com/search-console/security-issues?resource_id=sc-domain%3Azovus.ru",
    "https://search.google.com/search-console/security-issues?resource_id=https%3A%2F%2Fzovus.ru%2F",
    "https://search.google.com/search-console?resource_id=sc-domain%3Azovus.ru",
  ];

  for (const url of targets) {
    log(`goto ${url}`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForTimeout(5000);
    await snap(page, `cdp-${targets.indexOf(url)}`);
    log(`url=${page.url()}`);
    const text = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
    log(`snip=${text.slice(0, 500)}`);
    if (/security|безопас|manual action|проблемы безопасности|Search Console/i.test(text) && !/Sign in|Войдите|Too many failed/i.test(text.slice(0, 300))) {
      break;
    }
  }

  // Property picker
  const body1 = await page.locator("body").innerText();
  if (!/zovus\.ru/i.test(body1)) {
    const picker = page.locator('[data-open-resource-selector], [aria-label*="property"], [aria-label*="ресурс"], button').filter({ hasText: /Search property|Выберите|zovus|sc-domain/i }).first();
    if (await picker.count()) {
      await picker.click({ force: true }).catch(() => {});
      await page.waitForTimeout(1500);
      const item = page.getByText(/zovus\.ru|sc-domain:zovus\.ru/i).first();
      if (await item.count()) await item.click({ force: true });
      await page.waitForTimeout(3000);
    }
  }
  await snap(page, "cdp-property");

  // Open security issues via nav if needed
  if (!/security-issues/i.test(page.url())) {
    const nav = page.locator('a[href*="security-issues"], text=Security issues, text=Проблемы безопасности').first();
    if (await nav.count()) {
      await nav.click({ force: true });
      await page.waitForTimeout(4000);
    }
  }
  await snap(page, "cdp-security");

  const reviewSelectors = [
    'button:has-text("Request a review")',
    'button:has-text("Request review")',
    'button:has-text("Запросить проверку")',
    'a:has-text("Request a review")',
    'a:has-text("Запросить проверку")',
    '[role="button"]:has-text("Request")',
    '[role="button"]:has-text("Запросить")',
  ];

  let clicked = false;
  for (const sel of reviewSelectors) {
    const btn = page.locator(sel).first();
    if (await btn.count()) {
      log(`click ${sel}`);
      await btn.click({ force: true });
      clicked = true;
      await page.waitForTimeout(2000);
      break;
    }
  }

  if (!clicked) {
    // Maybe need to open the specific issue first
    const issue = page.locator('a,button,[role="row"],[role="link"]').filter({ hasText: /Social engineering|Социальн|Deceptive|Обман|hacked|взлом/i }).first();
    if (await issue.count()) {
      log("open issue row");
      await issue.click({ force: true });
      await page.waitForTimeout(2500);
      await snap(page, "cdp-issue");
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
    await snap(page, "cdp-review-dialog");
    const ta = page.locator("textarea").first();
    if (await ta.count()) {
      await ta.fill(REVIEW);
      log("filled review text");
    }
    const submit = page
      .locator('button:has-text("Submit"), button:has-text("Отправить"), button:has-text("Request a review"), button:has-text("Запросить проверку")')
      .last();
    if (await submit.count()) {
      await submit.click({ force: true });
      await page.waitForTimeout(4000);
      log("SUBMIT_CLICKED");
    }
  } else {
    log("NO_REVIEW_BUTTON");
  }

  const finalText = await page.locator("body").innerText();
  writeFileSync(
    join(OUT, "cdp-result.json"),
    JSON.stringify({ url: page.url(), clicked, text: finalText.slice(0, 5000) }, null, 2)
  );
  await snap(page, "cdp-final");
  log("DONE " + page.url());
  // keep browser open
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
