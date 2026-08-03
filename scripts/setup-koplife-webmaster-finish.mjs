#!/usr/bin/env node
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const OUT = join(process.cwd(), ".cursor", "yandex-koplife-setup");
const PROFILE = join(process.cwd(), ".cursor", "yandex360-setup", "pw-profile");
mkdirSync(OUT, { recursive: true });
const snap = (p, n) => p.screenshot({ path: join(OUT, `${n}.png`), fullPage: true }).catch(() => {});
const BASE = "https://webmaster.yandex.ru/site/https:koplife.ru:443";

async function main() {
  const context = await chromium.launchPersistentContext(PROFILE, {
    headless: false,
    viewport: { width: 1440, height: 960 },
    locale: "ru-RU",
  });
  const page = context.pages()[0] || (await context.newPage());
  page.setDefaultTimeout(15000);
  const result = { steps: [] };

  try {
    await page.goto(`${BASE}/settings/access/`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(3000);
    await page.getByText("Метатег", { exact: true }).click({ force: true }).catch(() => {});
    await page.waitForTimeout(1000);
    await snap(page, "100-before-confirm");
    const confirm = page.getByRole("button", { name: /^Подтвердить$/i });
    if (await confirm.count()) {
      await confirm.first().click({ force: true });
      result.steps.push("clicked_confirm");
      await page.waitForTimeout(10000);
    } else {
      result.steps.push("no_confirm_button");
    }
    await snap(page, "101-after-confirm");
    result.accessText = (await page.locator("body").innerText()).slice(0, 2000);
    result.confirmed = /права подтверждены|успешно|уже подтверждены/i.test(result.accessText);

    // Sitemap page — try several URLs
    for (const path of [`${BASE}/indexing/sitemap/`, `${BASE}/indexing/files/`]) {
      const resp = await page.goto(path, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => null);
      if (!resp || resp.status() >= 400) continue;
      await page.waitForTimeout(2500);
      await snap(page, "102-sitemap");
      result.steps.push(`sitemap_page:${path}`);
      const inputs = page.locator("input:visible");
      const n = await inputs.count();
      for (let i = 0; i < n; i++) {
        const el = inputs.nth(i);
        const box = await el.boundingBox();
        if (!box || box.width < 180) continue;
        await el.fill("https://koplife.ru/sitemap-index.xml");
        break;
      }
      const add = page.getByRole("button", { name: /Добавить/i });
      if (await add.count()) {
        await add.first().click({ force: true });
        await page.waitForTimeout(2500);
        result.steps.push("sitemap_added");
      }
      break;
    }
    await snap(page, "103-sitemap-done");

    // Metrika crawl settings
    await page.goto(`${BASE}/indexing/`, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(2000);
    const link = page.getByText(/Обход по счётчику|счётчик.*Метрик|Метрик/i).first();
    if (await link.count()) {
      await link.click({ force: true });
      await page.waitForTimeout(2500);
      result.steps.push("opened_metrika_crawl");
      await snap(page, "104-metrika-crawl");
      const enable = page.getByRole("button", { name: /Включить|Сохранить|Подключить/i });
      if (await enable.count()) {
        await enable.first().click({ force: true });
        result.steps.push("enabled_crawl");
        await page.waitForTimeout(2000);
      }
    }

    await page.goto(`${BASE}/dashboard/`, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(2500);
    await snap(page, "105-dash");
    result.dash = (await page.locator("body").innerText()).slice(0, 1200);
  } finally {
    writeFileSync(join(OUT, "finish-result.json"), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
    await context.close().catch(() => {});
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
