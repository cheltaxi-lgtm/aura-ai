#!/usr/bin/env node
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { execFileSync } from "child_process";

const OUT = join(process.cwd(), ".cursor", "gsc-security-review");
mkdirSync(OUT, { recursive: true });
const REVIEW =
  "Удалили тестовые APK (/zovus.apk, /test-root.apk, /releases/test.apk, /releases/zovus-latest.zip). Оставили /releases/zovus-latest.apk. Фишинга нет. Zovus легитимный. Просим снять Safe Browsing social engineering.";

const sshKey = process.env.USERPROFILE + "\\.ssh\\aura_deploy_ed25519";
const known = process.env.USERPROFILE + "\\.ssh\\known_hosts_aura_beget";

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page =
  browser.contexts()[0].pages().find((p) => p.url().includes("search.google")) ||
  (await browser.contexts()[0].newPage());

async function openOwnership() {
  await page.goto("https://search.google.com/search-console/welcome", {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await page.waitForTimeout(2000);
  await page.evaluate(() => {
    const el = [...document.querySelectorAll("a,button,div,span")].find(
      (e) =>
        /Завершить процедуру подтверждения/i.test((e.textContent || "").trim()) &&
        (e.textContent || "").trim().length < 80
    );
    if (el) el.click();
  });
  await page.waitForTimeout(2000);
  await page.evaluate(() => {
    const el = [...document.querySelectorAll("div,span,li,a,button")].find(
      (e) => (e.textContent || "").trim() === "https://zovus.ru/"
    );
    if (el) el.click();
  });
  await page.waitForTimeout(4000);
  // dismiss OK error if present
  const ok = page.getByRole("button", { name: /^ОК$|^OK$/i }).first();
  if (await ok.count()) {
    await ok.click({ force: true });
    await page.waitForTimeout(1000);
  }
}

await openOwnership();

// Download official verification file
const [download] = await Promise.all([
  page.waitForEvent("download", { timeout: 20000 }),
  page.evaluate(() => {
    const el = [...document.querySelectorAll("div,span,a,button")].find((e) =>
      /googlea07e95e8199f7e09\.html/i.test((e.textContent || "").trim())
    );
    if (el) el.click();
  }),
]);
const dlPath = join(OUT, "googlea07e95e8199f7e09.html");
await download.saveAs(dlPath);
const content = readFileSync(dlPath, "utf8");
console.log("downloaded bytes", content.length);
console.log("content:", JSON.stringify(content));
writeFileSync(join(process.cwd(), "public", "googlea07e95e8199f7e09.html"), content);

// Upload exact bytes to server
execFileSync(
  "scp",
  [
    "-i",
    sshKey,
    "-o",
    `UserKnownHostsFile=${known}`,
    "-o",
    "StrictHostKeyChecking=yes",
    dlPath,
    "root@217.12.37.32:/opt/aura-ai/public/googlea07e95e8199f7e09.html",
  ],
  { stdio: "inherit" }
);

const check = execFileSync(
  "ssh",
  [
    "-i",
    sshKey,
    "-o",
    `UserKnownHostsFile=${known}`,
    "-o",
    "StrictHostKeyChecking=yes",
    "root@217.12.37.32",
    "curl -s https://zovus.ru/googlea07e95e8199f7e09.html | od -c | head -5; echo; curl -s https://zovus.ru/googlea07e95e8199f7e09.html",
  ],
  { encoding: "utf8" }
);
console.log("live:", check);

await page.waitForTimeout(1500);
const verifyBtn = page.getByRole("button", { name: /^Подтвердить$/i }).first();
await verifyBtn.click({ force: true });
await page.waitForTimeout(10000);
console.log("after verify", page.url());
console.log((await page.locator("body").innerText()).slice(0, 2500));
await page.screenshot({ path: join(OUT, "dl-verify.png"), fullPage: true });

const done = page.getByRole("button", { name: /^(ГОТОВО|Done|ОК|OK)$/i }).first();
if (await done.count()) {
  await done.click({ force: true });
  await page.waitForTimeout(2500);
}

await page.goto(
  "https://search.google.com/search-console/security-issues?resource_id=https%3A%2F%2Fzovus.ru%2F",
  { waitUntil: "domcontentloaded", timeout: 90000 }
);
await page.waitForTimeout(5000);
let t = await page.locator("body").innerText();
console.log("SEC", page.url());
console.log(t.slice(0, 2500));
await page.screenshot({ path: join(OUT, "dl-sec.png"), fullPage: true });

if (!/нет доступа|not-verified/i.test(t + page.url())) {
  const issue = page.locator("a,button,[role=row]").filter({ hasText: /Social|Социальн|Unsafe|Небезопас/i }).first();
  if (await issue.count()) {
    await issue.click({ force: true });
    await page.waitForTimeout(2000);
  }
  const review = page.locator("a,button,[role=button]").filter({ hasText: /Request a review|Запросить проверку/i }).first();
  if (await review.count()) {
    await review.click({ force: true });
    await page.waitForTimeout(1500);
    const ta = page.locator("textarea").first();
    if (await ta.count()) await ta.fill(REVIEW);
    const cbs = page.locator('input[type=checkbox]');
    for (let i = 0; i < (await cbs.count()); i++) await cbs.nth(i).check({ force: true }).catch(() => {});
    const submit = page.getByRole("button", { name: /Submit|Отправить|Request|Запросить/i }).last();
    if (await submit.count()) {
      await submit.click({ force: true });
      await page.waitForTimeout(4000);
      console.log("REVIEW_SUBMITTED");
    }
  }
  console.log("FINAL", (await page.locator("body").innerText()).slice(0, 2000));
}

writeFileSync(
  join(OUT, "dl-result.json"),
  JSON.stringify({ url: page.url(), text: await page.locator("body").innerText() }, null, 2)
);
console.log("DONE");
