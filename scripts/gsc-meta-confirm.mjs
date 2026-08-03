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
  browser.contexts()[0].pages().find((p) => p.url().includes("search-console/welcome")) ||
  browser.contexts()[0].pages().find((p) => p.url().includes("search.google")) ||
  (await browser.contexts()[0].newPage());

async function body() {
  return page.locator("body").innerText();
}
async function snap(n) {
  await page.screenshot({ path: join(OUT, `${n}.png`), fullPage: true });
}

await page.goto("https://search.google.com/search-console/welcome", {
  waitUntil: "domcontentloaded",
  timeout: 90000,
});
await page.waitForTimeout(2500);

const opened = await page.evaluate(() => {
  const finish = [...document.querySelectorAll("a,button,div,span")].find(
    (e) =>
      /Завершить процедуру подтверждения/i.test((e.textContent || "").trim()) &&
      (e.textContent || "").trim().length < 90
  );
  if (finish) {
    finish.click();
    return "finish";
  }
  return null;
});
console.log("opened", opened);
await page.waitForTimeout(2500);
let t = await body();
console.log("after finish", t.slice(0, 500));

if (!/https:\/\/zovus\.ru\/|Выберите ресурс/i.test(t)) {
  // fresh add URL prefix
  const urlInput = page.locator('input[aria-label="https://www.example.com"], input[aria-label*="https://"]').first();
  if (await urlInput.count()) {
    await urlInput.fill("https://zovus.ru/", { force: true });
    await page.evaluate(() => {
      const input = document.querySelector(
        'input[aria-label="https://www.example.com"], input[aria-label*="https://"]'
      );
      let root = input;
      for (let i = 0; i < 12 && root; i++) {
        const btn = [...root.querySelectorAll("button,[role=button]")].find((b) =>
          /Продолжить|Continue|ПРОДОЛЖИТЬ/i.test(b.textContent || "")
        );
        if (btn) {
          btn.click();
          return;
        }
        root = root.parentElement;
      }
    });
    await page.waitForTimeout(4500);
  }
} else {
  await page.evaluate(() => {
    const el = [...document.querySelectorAll("div,span,li,a,button")].find(
      (e) => (e.textContent || "").trim() === "https://zovus.ru/"
    );
    if (el) el.click();
  });
  await page.waitForTimeout(4500);
}

t = await body();
console.log("ownership?", t.slice(0, 1200));
await snap("mc-01");

await page.evaluate(() => {
  const ok = [...document.querySelectorAll('[role="button"],button')].find((el) =>
    /^(ОК|OK)$/i.test((el.textContent || "").trim())
  );
  if (ok) ok.click();
});
await page.waitForTimeout(500);

await page.evaluate(() => {
  const el = [...document.querySelectorAll('[role="button"],div,span')].find((e) => {
    const tx = (e.textContent || "").trim();
    return tx === "Тег HTML";
  });
  if (el) el.click();
});
await page.waitForTimeout(1500);
t = await body();
console.log("meta section", t.slice(0, 1800));
await snap("mc-02");

const clickResult = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('[role="button"]')].filter((el) =>
    /^Подтвердить$/i.test((el.textContent || "").trim())
  );
  const preferred =
    btns.find((b) => b.id === "C06PK") ||
    btns.filter((b) => b.getClientRects().length)[1] ||
    btns[0];
  if (preferred) preferred.click();
  return {
    count: btns.length,
    ids: btns.map((b) => b.id),
    clicked: preferred?.id || null,
  };
});
console.log("clickResult", clickResult);
await page.waitForTimeout(12000);
t = await body();
console.log("after verify", t.slice(0, 2500));
await snap("mc-03");

if (/Не удалось|не удалось найти/i.test(t)) console.log("META_VERIFY_FAILED");
else if (/Владелец|подтверждено|успешн|verified|ГОТОВО/i.test(t)) console.log("META_VERIFY_OK");

await page.evaluate(() => {
  const b = [...document.querySelectorAll('[role="button"],button')].find((el) =>
    /^(ГОТОВО|Done|ОК|OK)$/i.test((el.textContent || "").trim())
  );
  if (b) b.click();
});
await page.waitForTimeout(3000);

await page.goto(
  "https://search.google.com/search-console/security-issues?resource_id=https%3A%2F%2Fzovus.ru%2F",
  { waitUntil: "domcontentloaded", timeout: 90000 }
);
await page.waitForTimeout(5000);
t = await body();
console.log("SEC", page.url());
console.log(t.slice(0, 3000));
await snap("mc-04");

if (!/нет доступа|not-verified/i.test(t + page.url())) {
  await page.evaluate(() => {
    const el = [...document.querySelectorAll("a,button,[role=row],div")].find((e) =>
      /Social engineering|Социальн|Unsafe|Небезопас|обман/i.test(e.textContent || "")
    );
    if (el) el.click();
  });
  await page.waitForTimeout(2500);
  const openedReview = await page.evaluate(() => {
    const el = [...document.querySelectorAll("a,button,[role=button]")].find((e) =>
      /Request a review|Запросить проверку/i.test((e.textContent || "").trim())
    );
    if (el) {
      el.click();
      return true;
    }
    return false;
  });
  console.log("openedReview", openedReview);
  await page.waitForTimeout(2000);
  const ta = page.locator("textarea").first();
  if (await ta.count()) await ta.fill(REVIEW);
  const cbs = page.locator('input[type=checkbox]');
  for (let i = 0; i < (await cbs.count()); i++) await cbs.nth(i).check({ force: true }).catch(() => {});
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('[role="button"],button')].find((el) =>
      /Отправить|Submit|Запросить проверку|Request a review/i.test((el.textContent || "").trim())
    );
    if (b) b.click();
  });
  await page.waitForTimeout(5000);
  console.log("REVIEW_STEP_DONE");
  console.log("FINAL", (await body()).slice(0, 2500));
  await snap("mc-05");
} else {
  console.log("STILL_NO_ACCESS");
}

writeFileSync(join(OUT, "meta-confirm.json"), JSON.stringify({ url: page.url(), text: await body() }, null, 2));
console.log("DONE");
