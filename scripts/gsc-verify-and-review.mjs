#!/usr/bin/env node
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

const OUT = join(process.cwd(), ".cursor", "gsc-security-review");
mkdirSync(OUT, { recursive: true });

const REVIEW =
  "Удалили тестовые и дублирующие APK с публичных путей сайта: /zovus.apk, /test-root.apk, /releases/test.apk, /releases/zovus-latest.zip. Оставили только официальный релиз /releases/zovus-latest.apk. Проверили сервер: вредоносного кода и фишинговых страниц нет. Сайт — легитимный сервис Zovus (zovus.ru). Просим перепроверить пометку Safe Browsing (social engineering).";

async function snap(page, name) {
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true }).catch(() => {});
}
function log(...a) {
  console.log(...a);
}

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const context = browser.contexts()[0];
const page =
  context.pages().find((p) => p.url().includes("search.google.com")) || (await context.newPage());

async function body() {
  return (await page.locator("body").innerText()).replace(/\s+/g, " ");
}

// Open not-verified page with verify CTA for URL prefix
await page.goto(
  "https://search.google.com/search-console/welcome?resource_id=https%3A%2F%2Fzovus.ru%2F",
  { waitUntil: "domcontentloaded", timeout: 90000 }
);
await page.waitForTimeout(3000);
log("url", page.url());
log(await body());
await snap(page, "v01");

// Fill URL prefix resource
const urlInputs = page.locator('input[type="url"], input[type="text"], input');
const count = await urlInputs.count();
log("inputs", count);
for (let i = 0; i < count; i++) {
  const ph = (await urlInputs.nth(i).getAttribute("placeholder").catch(() => "")) || "";
  const aria = (await urlInputs.nth(i).getAttribute("aria-label").catch(() => "")) || "";
  log(`input[${i}] ph=${ph} aria=${aria}`);
}

// Prefer URL-prefix field (usually second or the https:// one)
const prefixInput = page.locator('input').filter({ has: page.locator("xpath=..") });
// Fill all empty-looking URL fields with https://zovus.ru/
for (let i = 0; i < count; i++) {
  const ph = ((await urlInputs.nth(i).getAttribute("placeholder")) || "").toLowerCase();
  const aria = ((await urlInputs.nth(i).getAttribute("aria-label")) || "").toLowerCase();
  if (/https|url|префикс|пример|example/.test(ph + aria) || i === 1) {
    await urlInputs.nth(i).fill("https://zovus.ru/");
    log("filled input", i);
  }
}

// Click ПРОДОЛЖИТЬ near URL prefix - click last Continue that is enabled
const continues = page.locator('button:has-text("ПРОДОЛЖИТЬ"), button:has-text("Continue"), span:has-text("ПРОДОЛЖИТЬ")');
const cCount = await continues.count();
log("continue buttons", cCount);
if (cCount >= 2) {
  await continues.nth(1).click({ force: true });
} else if (cCount === 1) {
  await continues.first().click({ force: true });
} else {
  // click via text near URL prefix section
  await page.getByRole("button", { name: /ПРОДОЛЖИТЬ|Continue/i }).last().click({ force: true });
}
await page.waitForTimeout(5000);
log("after continue", page.url());
log(await body());
await snap(page, "v02");

// If verify ownership page - choose HTML file method
const htmlMethod = page.locator("text=HTML-файл").or(page.locator("text=HTML file")).or(page.locator('[aria-label*="HTML"]')).first();
if (await htmlMethod.count()) {
  await htmlMethod.click({ force: true });
  await page.waitForTimeout(1500);
}

// Also try clicking "ПОДТВЕРДИТЬ ПРАВО СОБСТВЕННОСТИ" if on not-verified
const verifyCta = page.locator('a,button').filter({ hasText: /ПОДТВЕРДИТЬ ПРАВО|Verify ownership|Confirm ownership/i }).first();
if (await verifyCta.count()) {
  await verifyCta.click({ force: true });
  await page.waitForTimeout(4000);
  log("clicked verify cta", page.url());
  log(await body());
  await snap(page, "v03");
}

// Look for download link google*.html
const downloadLink = page.locator('a[href*="google"], a:has-text("скачать"), a:has-text("Download"), a:has-text(".html")').first();
const pageHtml = await page.content();
const fileMatch = pageHtml.match(/google[a-z0-9]+\.html/i);
const tokenMatch = pageHtml.match(/google-site-verification[=:\s]+([A-Za-z0-9_-]+)/i);
log("fileMatch", fileMatch?.[0], "token", tokenMatch?.[1]);

// Extract recommended HTML filename from visible text
const t = await body();
const fileFromText = t.match(/google[a-z0-9]+\.html/i)?.[0];
log("fileFromText", fileFromText);

if (fileFromText || fileMatch) {
  const fname = fileFromText || fileMatch[0];
  // Try download via link
  const dl = page.locator(`a[href*="${fname}"], a:has-text("${fname}")`).first();
  if (await dl.count()) {
    const href = await dl.getAttribute("href");
    log("download href", href);
    // content often in same page instructions - create file with google content
  }
}

// HTML tag method meta content
const metaToken = t.match(/content=["']?([A-Za-z0-9_-]{10,})["']?/) || tokenMatch;

// Prefer: if existing verification file matches instructions, just click Verify
// Otherwise create googleXXXX.html with standard content
if (fileFromText || fileMatch) {
  const fname = fileFromText || fileMatch[0];
  // Standard Google HTML verification file content is just: google-site-verification: TOKEN
  // Token is usually the middle of filename without google and .html
  const token = fname.replace(/^google/i, "").replace(/\.html$/i, "");
  const content = `google-site-verification: ${token}\n`;
  const localPath = join(process.cwd(), "public", fname);
  writeFileSync(localPath, content);
  log("wrote local", localPath, content.trim());

  // Upload to server
  try {
    execSync(
      `scp -i "$env:USERPROFILE\\.ssh\\aura_deploy_ed25519" -o UserKnownHostsFile="$env:USERPROFILE\\.ssh\\known_hosts_aura_beget" -o StrictHostKeyChecking=yes "${localPath}" root@217.12.37.32:/opt/aura-ai/public/${fname}`,
      { shell: "powershell.exe", stdio: "inherit" }
    );
    log("uploaded via scp");
  } catch (e) {
    log("scp failed, trying ssh echo", e.message);
    execSync(
      `ssh -i "$env:USERPROFILE\\.ssh\\aura_deploy_ed25519" -o UserKnownHostsFile="$env:USERPROFILE\\.ssh\\known_hosts_aura_beget" -o StrictHostKeyChecking=yes root@217.12.37.32 "printf '%s\\n' 'google-site-verification: ${token}' > /opt/aura-ai/public/${fname} && chmod 644 /opt/aura-ai/public/${fname}"`,
      { stdio: "inherit" }
    );
  }
}

// Click verify button
const verifyBtn = page
  .locator('button:has-text("Подтвердить"), button:has-text("VERIFY"), button:has-text("Verify"), button:has-text("ПОДТВЕРДИТЬ")')
  .first();
if (await verifyBtn.count()) {
  await verifyBtn.click({ force: true });
  await page.waitForTimeout(6000);
  log("after verify", page.url());
  log(await body());
  await snap(page, "v04");
}

// Navigate to security issues
for (const rid of ["https%3A%2F%2Fzovus.ru%2F", "sc-domain%3Azovus.ru"]) {
  await page.goto(`https://search.google.com/search-console/security-issues?resource_id=${rid}`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await page.waitForTimeout(4000);
  const bt = await body();
  log("security", page.url(), bt.slice(0, 500));
  await snap(page, `sec-${rid.slice(0, 12)}`);
  if (/not-verified|нет доступа/i.test(bt)) continue;

  // open issue / request review
  const issue = page.locator("a,button,[role='row']").filter({ hasText: /Social|Социальн|Unsafe|Небезопас|обман/i }).first();
  if (await issue.count()) {
    await issue.click({ force: true });
    await page.waitForTimeout(2500);
  }
  const reviewBtn = page
    .locator('button,a,[role=button]')
    .filter({ hasText: /Request a review|Запросить проверку|Request review/i })
    .first();
  if (await reviewBtn.count()) {
    await reviewBtn.click({ force: true });
    await page.waitForTimeout(2000);
    const ta = page.locator("textarea").first();
    if (await ta.count()) await ta.fill(REVIEW);
    const cbs = page.locator('input[type="checkbox"]');
    for (let i = 0; i < (await cbs.count()); i++) await cbs.nth(i).check({ force: true }).catch(() => {});
    const submit = page.locator('button').filter({ hasText: /Submit|Отправить|Request|Запросить/i }).last();
    if (await submit.count()) {
      await submit.click({ force: true });
      await page.waitForTimeout(4000);
      log("REVIEW_SUBMITTED");
    }
  }
  log("final", await body());
  await snap(page, "final");
  break;
}

writeFileSync(join(OUT, "verify-result.json"), JSON.stringify({ url: page.url(), text: await body() }, null, 2));
log("DONE");
