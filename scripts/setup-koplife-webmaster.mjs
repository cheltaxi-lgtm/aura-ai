#!/usr/bin/env node
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const OUT = join(process.cwd(), ".cursor", "yandex-koplife-setup");
const PROFILE = join(process.cwd(), ".cursor", "yandex360-setup", "pw-profile");
mkdirSync(OUT, { recursive: true });
const push = (m) => console.log(m);
const snap = (page, n) => page.screenshot({ path: join(OUT, `${n}.png`), fullPage: true }).catch(() => {});

async function main() {
  const context = await chromium.launchPersistentContext(PROFILE, {
    headless: false,
    viewport: { width: 1440, height: 960 },
    locale: "ru-RU",
  });
  const page = context.pages()[0] || (await context.newPage());

  await page.goto("https://webmaster.yandex.ru/sites/", { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(4000);
  await snap(page, "60-sites");

  // If already present
  if ((await page.locator("body").innerText()).match(/koplife\.ru/i)) {
    push("already_listed");
    await page.getByText(/koplife\.ru/i).first().click({ force: true });
    await page.waitForTimeout(4000);
  } else {
    // Click orange + Добавить in main area
    const add = page.locator("button", { hasText: /Добавить/ }).first();
    await add.click({ force: true });
    await page.waitForTimeout(2500);
    await snap(page, "61-dialog");

    // Find the largest visible text input in dialog/page
    const inputs = page.locator("input[type='text']:visible, input[type='url']:visible, input:not([type]):visible");
    const n = await inputs.count();
    push(`visible_inputs=${n}`);
    let filled = false;
    for (let i = 0; i < n; i++) {
      const el = inputs.nth(i);
      const box = await el.boundingBox();
      if (!box || box.width < 180) continue;
      await el.fill("");
      await el.fill("https://koplife.ru");
      filled = true;
      push(`filled_input_${i}`);
      break;
    }
    if (!filled) {
      // sidebar plus path
      const side = page.locator("input").nth(0);
      await side.fill("https://koplife.ru");
      await page.locator("button").filter({ hasText: "+" }).first().click({ force: true });
    } else {
      await page.locator("button").filter({ hasText: /Добавить|Продолжить/ }).last().click({ force: true });
    }
    await page.waitForTimeout(7000);
  }

  await snap(page, "62-after");
  push(`url=${page.url()}`);
  const text = await page.locator("body").innerText();
  writeFileSync(join(OUT, "wm62.txt"), text);
  writeFileSync(join(OUT, "wm62.html"), await page.content());

  // If we see verification methods
  for (const name of ["Метатег", "HTML-файл", "DNS-запись", "Мета-тег"]) {
    const t = page.getByText(name, { exact: false }).first();
    if (await t.count()) {
      try {
        await t.click({ timeout: 3000, force: true });
        await page.waitForTimeout(1000);
        push(`clicked_${name}`);
      } catch {}
    }
  }
  await snap(page, "63-verify");
  const html = await page.content();
  const body = await page.locator("body").innerText();
  writeFileSync(join(OUT, "wm63.txt"), body);
  writeFileSync(join(OUT, "wm63.html"), html);

  const m =
    html.match(/yandex-verification["'\s]+content=["']([a-f0-9]+)["']/i) ||
    body.match(/content=["']([a-f0-9]+)["']/i) ||
    body.match(/yandex-verification:\s*([a-f0-9]+)/i);
  const hexes = [...new Set((html + body).match(/\b[a-f0-9]{16}\b/gi) || [])];
  const result = { url: page.url(), code: m?.[1] || null, hexes: hexes.slice(0, 15) };
  writeFileSync(join(OUT, "webmaster-result.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));

  await context.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
