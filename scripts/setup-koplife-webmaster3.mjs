#!/usr/bin/env node
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const OUT = join(process.cwd(), ".cursor", "yandex-koplife-setup");
const PROFILE = join(process.cwd(), ".cursor", "yandex360-setup", "pw-profile");
mkdirSync(OUT, { recursive: true });
const snap = (p, n) => p.screenshot({ path: join(OUT, `${n}.png`), fullPage: true }).catch(() => {});

async function main() {
  const context = await chromium.launchPersistentContext(PROFILE, {
    headless: false,
    viewport: { width: 1440, height: 960 },
    locale: "ru-RU",
    slowMo: 50,
  });
  const page = context.pages()[0] || (await context.newPage());

  await page.goto("https://webmaster.yandex.ru/sites/", { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(4000);

  // Use "Найдите или добавьте сайт" field
  const searchAdd = page.getByPlaceholder("Найдите или добавьте сайт");
  await searchAdd.click({ force: true });
  await searchAdd.fill("https://koplife.ru");
  await page.waitForTimeout(1500);
  await snap(page, "80-search-filled");

  // Suggestions dropdown?
  const suggestion = page.getByText(/koplife\.ru/i).first();
  if (await suggestion.count()) {
    await suggestion.click({ force: true });
    await page.waitForTimeout(2000);
  }

  await page.getByRole("button", { name: /^Добавить$/i }).click({ force: true });
  await page.waitForTimeout(5000);
  await snap(page, "81-after-add-btn");
  console.log("url", page.url());

  // Try sidebar select + adjacent button (often SVG plus)
  if (page.url().includes("/sites")) {
    const side = page.getByPlaceholder("Выбрать сайт");
    await side.click({ force: true });
    await side.fill("https://koplife.ru");
    await page.waitForTimeout(1000);
    // click element to the right of sidebar input
    const box = await side.boundingBox();
    if (box) {
      await page.mouse.click(box.x + box.width + 28, box.y + box.height / 2);
      console.log("clicked right of sidebar input");
      await page.waitForTimeout(5000);
    }
    await snap(page, "82-sidebar-plus");
    console.log("url2", page.url());
  }

  // Enumerate clickable near sidebar input
  const near = await page.evaluate(() => {
    const inp = [...document.querySelectorAll("input")].find((el) => el.placeholder === "Выбрать сайт");
    if (!inp) return [];
    const ir = inp.getBoundingClientRect();
    return [...document.querySelectorAll("button, a, div, span")]
      .map((el) => {
        const r = el.getBoundingClientRect();
        return {
          text: (el.innerText || "").trim().slice(0, 40),
          tag: el.tagName,
          cls: (el.className || "").toString().slice(0, 60),
          x: Math.round(r.x),
          y: Math.round(r.y),
          w: Math.round(r.width),
          h: Math.round(r.height),
        };
      })
      .filter((b) => b.w > 10 && b.h > 10 && b.x > ir.x && b.x < ir.x + ir.width + 80 && Math.abs(b.y - ir.y) < 40);
  });
  writeFileSync(join(OUT, "near-sidebar.json"), JSON.stringify(near, null, 2));
  console.log("near", near);

  for (const el of near) {
    if (el.w < 50 && el.h < 50) {
      await page.mouse.click(el.x + el.w / 2, el.y + el.h / 2);
      console.log("clicked near", el);
      await page.waitForTimeout(4000);
      await snap(page, "83-near-click");
      console.log("url3", page.url());
      if (!page.url().includes("/sites/?page")) break;
    }
  }

  const html = await page.content();
  const text = await page.locator("body").innerText();
  writeFileSync(join(OUT, "wm83.txt"), text);
  writeFileSync(join(OUT, "wm83.html"), html);
  const m =
    html.match(/yandex-verification["'\s]+content=["']([a-f0-9]+)["']/i) ||
    text.match(/content=["']([a-f0-9]+)["']/i);
  const out = {
    url: page.url(),
    code: m?.[1] || null,
    hasKoplife: /koplife/i.test(text),
    hasConfirm: /подтверд/i.test(text),
  };
  writeFileSync(join(OUT, "webmaster-result3.json"), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  await context.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
