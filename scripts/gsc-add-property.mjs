#!/usr/bin/env node
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { execFileSync } from "child_process";

const OUT = join(process.cwd(), ".cursor", "gsc-security-review");
mkdirSync(OUT, { recursive: true });
const REVIEW =
  "Удалили тестовые и дублирующие APK с публичных путей: /zovus.apk, /test-root.apk, /releases/test.apk, /releases/zovus-latest.zip. Оставили только /releases/zovus-latest.apk. Вредоносного кода и фишинга нет. Сайт легитимный (Zovus). Просим снять пометку Safe Browsing / social engineering.";

const sshKey = process.env.USERPROFILE + "\\.ssh\\aura_deploy_ed25519";
const known = process.env.USERPROFILE + "\\.ssh\\known_hosts_aura_beget";

function ssh(cmd) {
  return execFileSync(
    "ssh",
    ["-i", sshKey, "-o", `UserKnownHostsFile=${known}`, "-o", "StrictHostKeyChecking=yes", "root@217.12.37.32", cmd],
    { encoding: "utf8" }
  );
}

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page =
  browser.contexts()[0].pages().find((p) => p.url().includes("search.google")) ||
  (await browser.contexts()[0].newPage());

async function snap(n) {
  await page.screenshot({ path: join(OUT, `${n}.png`), fullPage: true });
}
async function text() {
  return page.locator("body").innerText();
}

await page.goto("https://search.google.com/search-console/welcome", {
  waitUntil: "domcontentloaded",
  timeout: 90000,
});
await page.waitForTimeout(2500);
console.log("home", page.url());

// Fill URL-prefix input (aria-label shows example URL)
const urlInput = page.locator('input[aria-label="https://www.example.com"], input[aria-label*="https://"]').first();
await urlInput.waitFor({ state: "attached", timeout: 15000 });
await urlInput.evaluate((el) => {
  el.scrollIntoView({ block: "center" });
  el.focus();
});
await page.waitForTimeout(300);
await urlInput.fill("https://zovus.ru/", { force: true });
console.log("filled url prefix", await urlInput.inputValue());
await snap("add-01");

// Click ПРОДОЛЖИТЬ in the URL-prefix card (second continue)
const clicked = await page.evaluate(() => {
  const inputs = [...document.querySelectorAll('input[aria-label*="https://"], input[aria-label="https://www.example.com"]')];
  const input = inputs[0];
  if (!input) return { ok: false, reason: "no input" };
  let root = input;
  for (let i = 0; i < 12 && root; i++) {
    const btn = [...root.querySelectorAll("button,div[role=button],span")].find((b) =>
      /ПРОДОЛЖИТЬ|Continue/i.test((b.textContent || "").trim())
    );
    if (btn) {
      btn.click();
      return { ok: true, text: (btn.textContent || "").trim() };
    }
    root = root.parentElement;
  }
  // fallback: last continue-like button
  const all = [...document.querySelectorAll("button")].filter((b) => /ПРОДОЛЖИТЬ|Continue/i.test(b.textContent || ""));
  if (all.length) {
    all[all.length - 1].click();
    return { ok: true, fallback: true, count: all.length };
  }
  return { ok: false, reason: "no button" };
});
console.log("continue", clicked);
await page.waitForTimeout(5000);
console.log("after", page.url());
console.log((await text()).slice(0, 1500));
await snap("add-02");
writeFileSync(join(OUT, "add-02.html"), await page.content());

const html = await page.content();
const files = [...html.matchAll(/google[a-z0-9]+\.html/gi)].map((m) => m[0]);
const uniqFiles = [...new Set(files)];
console.log("files", uniqFiles);

// Select HTML file method if accordion
for (const label of ["HTML-файл", "HTML file", "Файл HTML"]) {
  const el = page.getByText(label, { exact: false }).first();
  if (await el.count()) {
    await el.click({ force: true }).catch(() => {});
    await page.waitForTimeout(1000);
  }
}

const html2 = await page.content();
const files2 = [...new Set([...html2.matchAll(/google[a-z0-9]+\.html/gi)].map((m) => m[0]))];
console.log("files2", files2);
const bodyTxt = await text();
const fileFromText = bodyTxt.match(/google[a-z0-9]+\.html/i)?.[0];
console.log("fileFromText", fileFromText);

const fname = fileFromText || files2[0];
if (fname) {
  const token = fname.replace(/^google/i, "").replace(/\.html$/i, "");
  const content = `google-site-verification: ${token}`;
  console.log("deploying", fname, content);
  ssh(`printf '%s\\n' '${content}' > /opt/aura-ai/public/${fname} && chmod 644 /opt/aura-ai/public/${fname} && curl -sI https://zovus.ru/${fname} | head -5 && curl -s https://zovus.ru/${fname}`);
}

// DNS method token
const dnsTok = bodyTxt.match(/google-site-verification[=:\s]+([A-Za-z0-9_-]+)/i)?.[1];
console.log("dnsTok", dnsTok);

// Click verify
for (const name of [/^Подтвердить$/i, /^Verify$/i, /ПОДТВЕРДИТЬ/i]) {
  const b = page.getByRole("button", { name }).first();
  if (await b.count()) {
    console.log("click verify", name);
    await b.click({ force: true });
    await page.waitForTimeout(7000);
    break;
  }
}
console.log("after verify", page.url());
console.log((await text()).slice(0, 1500));
await snap("add-03");

// security review
await page.goto(
  "https://search.google.com/search-console/security-issues?resource_id=https%3A%2F%2Fzovus.ru%2F",
  { waitUntil: "domcontentloaded", timeout: 90000 }
);
await page.waitForTimeout(4000);
console.log("sec", page.url());
console.log((await text()).slice(0, 1500));
await snap("add-04-sec");

const issue = page.locator("a,button,[role=row],div").filter({ hasText: /Social engineering|Социальн|Unsafe|Небезопас/i }).first();
if (await issue.count()) {
  await issue.click({ force: true });
  await page.waitForTimeout(2500);
}
const review = page.locator("button,a,[role=button]").filter({ hasText: /Request a review|Запросить проверку/i }).first();
if (await review.count()) {
  await review.click({ force: true });
  await page.waitForTimeout(2000);
  const ta = page.locator("textarea").first();
  if (await ta.count()) await ta.fill(REVIEW);
  const cbs = page.locator('input[type=checkbox]');
  for (let i = 0; i < (await cbs.count()); i++) await cbs.nth(i).check({ force: true }).catch(() => {});
  const submit = page.locator("button").filter({ hasText: /Submit|Отправить|Request|Запросить/i }).last();
  if (await submit.count()) {
    await submit.click({ force: true });
    await page.waitForTimeout(4000);
    console.log("REVIEW_SUBMITTED");
  }
}
console.log("FINAL", page.url());
console.log((await text()).slice(0, 2000));
await snap("add-05-final");
writeFileSync(join(OUT, "add-result.json"), JSON.stringify({ url: page.url(), text: await text() }, null, 2));
console.log("DONE");
