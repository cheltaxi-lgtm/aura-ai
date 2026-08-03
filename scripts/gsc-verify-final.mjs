#!/usr/bin/env node
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const OUT = join(process.cwd(), ".cursor", "gsc-security-review");
mkdirSync(OUT, { recursive: true });
const REVIEW =
  "Удалили тестовые APK (/zovus.apk, /test-root.apk, /releases/test.apk, /releases/zovus-latest.zip). Оставили только официальный /releases/zovus-latest.apk. Фишинга и вредоносного кода нет. Zovus (zovus.ru) — легитимный сервис. Просим снять пометку Safe Browsing / social engineering.";

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
console.log("step1", (await text()).slice(0, 400));

// Open unfinished verifications picker
await page.getByText(/Завершить процедуру подтверждения/i).first().click({ force: true });
await page.waitForTimeout(2500);
console.log("step2", (await text()).slice(0, 600));
await snap("vf-01");

// Pick URL prefix property
await page.getByText("https://zovus.ru/", { exact: true }).first().click({ force: true });
await page.waitForTimeout(5000);
console.log("step3", (await text()).slice(0, 1200));
await snap("vf-02");

// Dismiss errors
for (const name of ["ОК", "OK"]) {
  const b = page.getByRole("button", { name }).first();
  if (await b.isVisible().catch(() => false)) {
    await b.click({ force: true });
    await page.waitForTimeout(1000);
  }
}

// Click via id if present, else role
const clicked = await page.evaluate(() => {
  const byId = document.querySelector("#TZk80d");
  if (byId) {
    byId.click();
    return "id:TZk80d";
  }
  const btns = [...document.querySelectorAll('[role="button"]')].filter((el) =>
    /^Подтвердить$/i.test((el.textContent || "").trim())
  );
  if (btns[0]) {
    btns[0].click();
    return "role:" + btns.length;
  }
  return null;
});
console.log("clicked", clicked);
await page.waitForTimeout(12000);
const after = await text();
console.log("after:\n", after.slice(0, 2500));
await snap("vf-03");
writeFileSync(join(OUT, "vf-after.txt"), after);

if (/Владелец|подтверждено|успешн|You're verified|Ownership verified|ГОТОВО/i.test(after) && !/Не удалось|Неверное/i.test(after)) {
  console.log("VERIFY_OK");
} else if (/Не удалось|Неверное|ошибк/i.test(after)) {
  console.log("VERIFY_FAILED");
} else {
  console.log("VERIFY_UNKNOWN");
}

const done = page.getByRole("button", { name: /^(ГОТОВО|Done|ОК|OK)$/i }).first();
if (await done.count()) {
  await done.click({ force: true }).catch(() => {});
  await page.waitForTimeout(3000);
}

await page.goto(
  "https://search.google.com/search-console/security-issues?resource_id=https%3A%2F%2Fzovus.ru%2F",
  { waitUntil: "domcontentloaded", timeout: 90000 }
);
await page.waitForTimeout(5000);
let t = await text();
console.log("SEC", page.url());
console.log(t.slice(0, 3000));
await snap("vf-04");

if (!/нет доступа|not-verified/i.test(t + page.url())) {
  const issue = page.locator("a,button,[role=row]").filter({ hasText: /Social|Социальн|Unsafe|Небезопас|обман/i }).first();
  if (await issue.count()) {
    await issue.click({ force: true });
    await page.waitForTimeout(2500);
  }
  const review = page.locator("a,button,[role=button]").filter({ hasText: /Request a review|Запросить проверку/i }).first();
  if (await review.count()) {
    await review.click({ force: true });
    await page.waitForTimeout(2000);
    const ta = page.locator("textarea").first();
    if (await ta.count()) await ta.fill(REVIEW);
    const cbs = page.locator('input[type=checkbox]');
    for (let i = 0; i < (await cbs.count()); i++) await cbs.nth(i).check({ force: true }).catch(() => {});
    const submit = page.getByRole("button", { name: /Submit|Отправить|Request|Запросить/i }).last();
    if (await submit.count()) {
      await submit.click({ force: true });
      await page.waitForTimeout(5000);
      console.log("REVIEW_SUBMITTED");
    }
  } else {
    console.log("NO_REVIEW_BUTTON");
  }
  console.log("FINAL", (await text()).slice(0, 2000));
  await snap("vf-05");
}

writeFileSync(join(OUT, "final-result.json"), JSON.stringify({ url: page.url(), text: await text() }, null, 2));
console.log("DONE");
