import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const OUT = path.resolve("test-artifacts/matrix-qa");
mkdirSync(OUT, { recursive: true });
const BASE = process.env.MATRIX_QA_BASE || "http://127.0.0.1:3001";

async function run(page, name, viewport) {
  page.setDefaultTimeout(25000);
  await page.setViewportSize(viewport);
  await page.goto(`${BASE}/numerology/destiny-matrix`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(OUT, `${name}-step1.png`), fullPage: true });

  const ageBtn = page.getByRole("button", { name: /мне есть 18/i });
  if (await ageBtn.count()) {
    await ageBtn.first().click();
    await page.waitForTimeout(1500);
  }
  await page.screenshot({ path: path.join(OUT, `${name}-step2.png`), fullPage: true });

  const date = page.locator('input[type="date"]').first();
  if (!(await date.count())) {
    console.log(`${name}: no date input`, await page.locator("body").innerText());
    return;
  }
  await date.fill("1979-09-18");
  const submit = page.getByRole("button", { name: /Рассчитать/i }).first();
  await submit.click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(OUT, `${name}-result.png`), fullPage: true });
  const hasSvg = await page.locator(".destiny-matrix-frame svg, svg.destiny-matrix-svg").count();
  console.log(`${name}: svg count=${hasSvg}`);
}

const browser = await chromium.launch();
const page = await browser.newPage();
await run(page, "live-desktop", { width: 1280, height: 1600 });
const mobile = await browser.newPage();
await run(mobile, "live-390", { width: 390, height: 1400 });
await browser.close();
console.log("OK live matrix QA");
