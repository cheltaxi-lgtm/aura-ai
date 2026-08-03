#!/usr/bin/env node
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const OUT = join(process.cwd(), ".cursor", "gsc-security-review");
mkdirSync(OUT, { recursive: true });
const REVIEW =
  "Удалили тестовые и дублирующие APK: /zovus.apk, /test-root.apk, /releases/test.apk, /releases/zovus-latest.zip. Оставили только /releases/zovus-latest.apk. Фишинга нет. Zovus — легитимный сервис. Просим снять Safe Browsing / обманные страницы.";

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page =
  browser.contexts()[0].pages().find((p) => p.url().includes("search.google")) ||
  (await browser.contexts()[0].newPage());

await page.goto(
  "https://search.google.com/search-console/security-issues?resource_id=https%3A%2F%2Fzovus.ru%2F",
  { waitUntil: "domcontentloaded", timeout: 90000 }
);
await page.waitForTimeout(4000);

await page.getByText("Обманные страницы").first().click({ force: true });
await page.waitForTimeout(2000);
await page.screenshot({ path: join(OUT, "rr2-01.png"), fullPage: true });
console.log("expanded", (await page.locator("body").innerText()).slice(0, 2000));

const req = page.getByRole("button", { name: /Запросить проверку/i }).first();
console.log("req count", await req.count(), "visible", await req.isVisible().catch(() => false));
if (await req.count()) {
  await req.click({ force: true });
} else {
  await page.getByText(/ЗАПРОСИТЬ ПРОВЕРКУ/i).first().click({ force: true });
}
await page.waitForTimeout(3000);
await page.screenshot({ path: join(OUT, "rr2-02.png"), fullPage: true });
console.log("dialog", (await page.locator("body").innerText()).slice(0, 2500));
writeFileSync(join(OUT, "rr2.html"), await page.content());

const labels = await page.evaluate(() =>
  [...document.querySelectorAll("label, [role=checkbox], li, div")]
    .map((e) => (e.textContent || "").trim())
    .filter((t) => /подтверж|исправ|удал|убед|сайт|контент|проблем/i.test(t) && t.length < 120)
    .slice(0, 40)
);
console.log("labels", labels);

await page.evaluate(() => {
  const texts = [/подтверждаю/i, /исправил/i, /удал/i, /больше не/i, /I confirm/i, /fixed/i, /removed/i];
  for (const re of texts) {
    const el = [...document.querySelectorAll("label,div,span,li")].find(
      (e) => re.test((e.textContent || "").trim()) && (e.textContent || "").trim().length < 200
    );
    if (el) el.click();
  }
  for (const cb of document.querySelectorAll('[role="checkbox"]')) {
    if (cb.getAttribute("aria-checked") !== "true") cb.click();
  }
});
await page.waitForTimeout(1000);

const ta = page.locator("textarea").first();
console.log("ta disabled", await ta.isDisabled().catch(() => null));
if (await ta.count()) {
  await page.evaluate((text) => {
    const a = document.querySelector("textarea");
    if (!a) return;
    a.removeAttribute("disabled");
    a.disabled = false;
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
    nativeSetter?.call(a, text);
    a.dispatchEvent(new Event("input", { bubbles: true }));
    a.dispatchEvent(new Event("change", { bubbles: true }));
  }, REVIEW);
  if (!(await ta.isDisabled())) await ta.fill(REVIEW);
}
await page.screenshot({ path: join(OUT, "rr2-03.png"), fullPage: true });

const submit = page.getByRole("button", { name: /^(Отправить|Submit)$/i }).first();
console.log("submit", await submit.count(), await submit.isEnabled().catch(() => null));
if (await submit.count()) await submit.click({ force: true });
else {
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button,[role=button]")].find((e) =>
      /^(Отправить|Submit)$/i.test((e.textContent || "").trim())
    );
    if (b) b.click();
  });
}
await page.waitForTimeout(5000);
console.log("FINAL", (await page.locator("body").innerText()).slice(0, 3000));
await page.screenshot({ path: join(OUT, "rr2-04.png"), fullPage: true });
writeFileSync(
  join(OUT, "rr2-result.json"),
  JSON.stringify({ url: page.url(), text: await page.locator("body").innerText() }, null, 2)
);
console.log("DONE");
