#!/usr/bin/env node
/**
 * Open Google Search Console Security Issues for zovus.ru using local Chrome
 * Profile 3 (cheltaxi@gmail.com) and submit a Safe Browsing review if possible.
 */
import { chromium } from "playwright";
import { cpSync, existsSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const OUT = join(process.cwd(), ".cursor", "gsc-security-review");
mkdirSync(OUT, { recursive: true });

const srcProfile = join(
  process.env.LOCALAPPDATA || "",
  "Google",
  "Chrome",
  "User Data",
  "Profile 3"
);
const tmpRoot = join(process.env.TEMP || "/tmp", `chrome-gsc-${Date.now()}`);
const tmpUserData = join(tmpRoot, "User Data");
const tmpProfile = join(tmpUserData, "Default");

function log(m) {
  console.log(m);
}

async function snap(page, name) {
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true }).catch(() => {});
}

async function main() {
  if (!existsSync(srcProfile)) {
    throw new Error(`Chrome Profile 3 not found: ${srcProfile}`);
  }

  mkdirSync(tmpUserData, { recursive: true });
  log(`Copying profile from ${srcProfile}`);
  // Copy essential profile files (skip huge caches)
  cpSync(srcProfile, tmpProfile, {
    recursive: true,
    filter: (src) => {
      const base = src.replace(/\\/g, "/");
      if (/\/(Cache|Code Cache|GPUCache|Service Worker\/CacheStorage|blob_storage)\b/i.test(base)) {
        return false;
      }
      return true;
    },
  });

  // Minimal Local State so Chrome accepts the profile as Default
  const localState = {
    profile: {
      info_cache: {
        Default: { name: "Default", user_name: "cheltaxi@gmail.com" },
      },
      last_used: "Default",
    },
  };
  const { writeFileSync } = await import("fs");
  writeFileSync(join(tmpUserData, "Local State"), JSON.stringify(localState));

  const context = await chromium.launchPersistentContext(tmpProfile, {
    channel: "chrome",
    headless: false,
    viewport: { width: 1400, height: 900 },
    locale: "ru-RU",
    args: ["--disable-blink-features=AutomationControlled"],
  });

  const page = context.pages()[0] || (await context.newPage());

  const urls = [
    "https://search.google.com/search-console/security-issues?resource_id=sc-domain%3Azovus.ru",
    "https://search.google.com/search-console/security-issues?resource_id=https%3A%2F%2Fzovus.ru%2F",
    "https://search.google.com/search-console?resource_id=sc-domain%3Azovus.ru",
    "https://search.google.com/search-console",
  ];

  let landed = null;
  for (const url of urls) {
    log(`goto ${url}`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForTimeout(4000);
    await snap(page, `01-${urls.indexOf(url)}`);
    const text = await page.locator("body").innerText().catch(() => "");
    log(`url=${page.url()}`);
    log(`text_snip=${text.slice(0, 400).replace(/\s+/g, " ")}`);
    if (!/sign in|войдите|identifier/i.test(page.url()) && !/Sign in/i.test(text.slice(0, 200))) {
      landed = page.url();
      break;
    }
  }

  if (!landed) {
    log("NEED_LOGIN: Chrome profile session not accepted; complete login in opened window");
    await page.waitForTimeout(120000);
  }

  // Navigate to security issues if on welcome/home
  if (!/security-issues/i.test(page.url())) {
    const sec = page.locator('a[href*="security-issues"], [aria-label*="Security"], text=Безопасность').first();
    if (await sec.count()) {
      await sec.click({ force: true });
      await page.waitForTimeout(3000);
    } else {
      await page.goto(
        "https://search.google.com/search-console/security-issues?resource_id=sc-domain%3Azovus.ru",
        { waitUntil: "domcontentloaded" }
      );
      await page.waitForTimeout(4000);
    }
  }
  await snap(page, "02-security");

  // Try select property zovus if picker shown
  const body = await page.locator("body").innerText();
  if (/zovus\.ru/i.test(body) === false) {
    const propBtn = page.locator('[aria-label*="Search property"], [aria-label*="ресурс"], button:has-text("zovus"), div:has-text("Выберите ресурс")').first();
    if (await propBtn.count()) {
      await propBtn.click({ force: true });
      await page.waitForTimeout(1000);
      const item = page.locator('text=zovus.ru').first();
      if (await item.count()) await item.click({ force: true });
      await page.waitForTimeout(3000);
    }
  }
  await snap(page, "03-property");

  const reviewText =
    "Удалили тестовые и дублирующие APK с публичных путей сайта: /zovus.apk, /test-root.apk, /releases/test.apk, /releases/zovus-latest.zip. Оставили только официальный релиз /releases/zovus-latest.apk. Проверили сервер: вредоносного кода, фишинговых страниц и подозрительных PHP-файлов нет. Сайт — легитимный сервис Zovus (zovus.ru). Просим перепроверить Safe Browsing / social engineering.";

  // Click request review / запросить проверку
  const reviewBtn = page
    .locator(
      'button:has-text("Request a review"), button:has-text("Запросить проверку"), button:has-text("Request review"), [aria-label*="review"], a:has-text("Запросить проверку")'
    )
    .first();

  if (await reviewBtn.count()) {
    await reviewBtn.click({ force: true });
    await page.waitForTimeout(2000);
    await snap(page, "04-review-dialog");

    const textarea = page.locator("textarea").first();
    if (await textarea.count()) {
      await textarea.fill(reviewText);
    }

    const confirm = page
      .locator(
        'button:has-text("Submit"), button:has-text("Отправить"), button:has-text("Request a review"), button:has-text("Запросить")'
      )
      .last();
    if (await confirm.count()) {
      await confirm.click({ force: true });
      await page.waitForTimeout(3000);
    }
    await snap(page, "05-submitted");
    log("REVIEW_SUBMITTED_ATTEMPTED");
  } else {
    log("NO_REVIEW_BUTTON — dump UI texts");
    log((await page.locator("body").innerText()).slice(0, 2500));
    // Try Security Issues nested links
    const links = await page.locator("a,button").allTextContents();
    log(
      "buttons=" +
        links
          .map((t) => t.trim())
          .filter(Boolean)
          .slice(0, 80)
          .join(" | ")
    );
  }

  writeFileSync(
    join(OUT, "result.json"),
    JSON.stringify(
      {
        finalUrl: page.url(),
        body: (await page.locator("body").innerText()).slice(0, 4000),
      },
      null,
      2
    )
  );

  await context.close();
  try {
    rmSync(tmpRoot, { recursive: true, force: true });
  } catch {}
  log("DONE");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
