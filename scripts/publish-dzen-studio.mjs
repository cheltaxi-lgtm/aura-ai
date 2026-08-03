#!/usr/bin/env node
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", ".cursor", "organic-finish");
mkdirSync(OUT, { recursive: true });

const DZEN_TITLE = "Telegram-бот Zovus — расклады Таро в мессенджере";
const DZEN_BODY = `Официальный Telegram-бот Zovus (@zovus_card_bot) — быстрый вход в те же практики, что и на сайте: три карты бесплатно, матрица судьбы, диалог с наставником.

Ссылка на бота: https://t.me/zovus_card_bot
Подробнее: https://zovus.ru/telegram

Сайт: https://zovus.ru`;

const report = { at: new Date().toISOString(), vkCheck: null, dzen: null };

async function shot(page, name) {
  const p = join(OUT, `${name}.png`);
  try {
    await page.screenshot({ path: p, timeout: 12000 });
  } catch {
    /* ignore */
  }
  return p;
}

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page = browser.contexts()[0].pages()[0] || (await browser.contexts()[0].newPage());

// ——— Verify VK post ———
await page.goto("https://vk.ru/wall-240408086_2", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(2500);
const vkBody = await page.locator("body").innerText();
report.vkCheck = {
  url: page.url(),
  hasBot: /zovus_card_bot/i.test(vkBody),
  hasTelegram: /t\.me\/zovus_card_bot/i.test(vkBody),
  snippet: vkBody.slice(0, 800),
  shot: await shot(page, "vk-post-2"),
};
console.log("VK check", report.vkCheck.hasBot, report.vkCheck.hasTelegram, page.url());

// ——— Dzen studio create ———
await page.goto("https://dzen.ru/profile/editor/id/6a50b97e363bf24ef269684e/publications", {
  waitUntil: "domcontentloaded",
  timeout: 60000,
});
await page.waitForTimeout(3000);
await shot(page, "dzen-pubs");

const dump = await page.evaluate(() => {
  const all = [...document.querySelectorAll("button, a, [role='button'], [class*='button'], svg")]
    .map((el) => {
      const r = el.getBoundingClientRect();
      return {
        tag: el.tagName,
        text: (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 80),
        aria: el.getAttribute("aria-label"),
        title: el.getAttribute("title"),
        href: el.href || el.closest("a")?.href || null,
        x: Math.round(r.x),
        y: Math.round(r.y),
        w: Math.round(r.width),
        h: Math.round(r.height),
        cls: (el.className || "").toString().slice(0, 80),
      };
    })
    .filter((x) => x.w > 10 && x.h > 10 && x.y >= 0 && x.y < 900);
  return {
    url: location.href,
    createish: all.filter((x) =>
      /создать|написать|стать|публикац|\+|new|add|editor|написа/i.test(`${x.text} ${x.aria} ${x.title} ${x.href}`),
    ),
    topRight: all.filter((x) => x.x > 900 && x.y < 120).slice(0, 30),
    allButtons: all
      .filter((x) => x.tag === "BUTTON" || x.tag === "A")
      .map((x) => ({ text: x.text, aria: x.aria, href: x.href, x: x.x, y: x.y }))
      .slice(0, 60),
  };
});
writeFileSync(join(OUT, "dzen-ui-dump.json"), JSON.stringify(dump, null, 2));
console.log("createish", dump.createish);
console.log("topRight", dump.topRight);
console.log("buttons sample", dump.allButtons.slice(0, 25));

// Click Публикации then look for create
const pubs = page.getByRole("link", { name: /Публикации/i }).first();
if (await pubs.isVisible().catch(() => false)) {
  await pubs.click();
  await page.waitForTimeout(2000);
  await shot(page, "dzen-pubs2");
}

// Try common create patterns
const tryClick = async (locator, label) => {
  try {
    if (await locator.isVisible({ timeout: 800 })) {
      await locator.click();
      await page.waitForTimeout(2000);
      console.log("clicked", label, page.url());
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
};

let opened = false;
opened =
  (await tryClick(page.getByRole("button", { name: /Создать/i }).first(), "btn Создать")) ||
  (await tryClick(page.getByRole("link", { name: /Создать/i }).first(), "a Создать")) ||
  (await tryClick(page.getByText(/^Создать$/).first(), "text Создать")) ||
  (await tryClick(page.getByText(/Новая публикация|Написать статью|Создать публикацию/i).first(), "new pub")) ||
  (await tryClick(page.locator('[aria-label*="Создать"]').first(), "aria Создать")) ||
  (await tryClick(page.locator('a[href*="editor"]').first(), "href editor")) ||
  (await tryClick(page.locator('a[href*="/edit"]').first(), "href edit")) ||
  (await tryClick(page.locator('a[href*="publication"]').first(), "href publication"));

// Click "Сделайте 5 публикаций" onboarding card — often opens create
if (!opened) {
  opened = await tryClick(page.getByText(/Сделайте\s*5\s*публикаций/i).first(), "onboarding 5 pubs");
}

// Coordinate click on yellow + if present in top-right from dump
if (!opened && dump.topRight?.length) {
  for (const el of dump.topRight) {
    if (/создать|\+/i.test(`${el.text} ${el.aria} ${el.title}`) || (el.w < 60 && el.h < 60 && el.x > 1100)) {
      await page.mouse.click(el.x + el.w / 2, el.y + el.h / 2);
      await page.waitForTimeout(1500);
      console.log("mouse click topRight", el);
      opened = true;
      break;
    }
  }
}

await shot(page, "dzen-after-create-click");

// Type chooser: Статья
await tryClick(page.getByText(/^Статья$/).first(), "Статья");
await tryClick(page.getByRole("button", { name: /^Статья$/i }).first(), "btn Статья");
await page.waitForTimeout(2000);
await shot(page, "dzen-type");

let editors = page.locator('[contenteditable="true"]');
let count = await editors.count();
console.log("editors", count, page.url());

if (count === 0) {
  // Try iframe
  for (const frame of page.frames()) {
    const fe = frame.locator('[contenteditable="true"]');
    if ((await fe.count()) > 0) {
      console.log("found editors in frame", frame.url());
      editors = fe;
      count = await fe.count();
      break;
    }
  }
}

if (count > 0) {
  await editors.first().click();
  await editors.first().fill(DZEN_TITLE);
  if (count > 1) {
    await editors.nth(1).click();
    await editors.nth(1).fill(DZEN_BODY);
  } else {
    await page.keyboard.press("Enter");
    await page.keyboard.type(DZEN_BODY, { delay: 8 });
  }
  await shot(page, "dzen-filled3");

  // Publish flow
  let published = false;
  for (const label of [/^Опубликовать$/, /Опубликовать/i, /^Далее$/, /^Продолжить$/]) {
    const btn = page.getByRole("button", { name: label }).first();
    if (await btn.isVisible().catch(() => false)) {
      await btn.click();
      await page.waitForTimeout(2500);
      published = /опублик/i.test(String(label));
      console.log("pub click", label, page.url());
      await shot(page, "dzen-pub-step");
      if (published) break;
    }
  }
  // Confirm dialog
  const conf = page.getByRole("button", { name: /Опубликовать/i }).first();
  if (await conf.isVisible().catch(() => false)) {
    await conf.click();
    await page.waitForTimeout(3500);
    published = true;
  }

  report.dzen = {
    ok: published,
    url: page.url(),
    shot: await shot(page, "dzen-final"),
  };
} else {
  // Save full HTML snippet of header for debugging
  const headerHtml = await page.evaluate(() => document.body?.innerText?.slice(0, 2500));
  report.dzen = {
    ok: false,
    reason: "no_editor",
    url: page.url(),
    headerText: headerHtml,
    dump,
    shot: await shot(page, "dzen-still-no"),
  };
}

writeFileSync(join(OUT, "post-result6.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ vkCheck: report.vkCheck, dzen: report.dzen }, null, 2));
process.exit(report.vkCheck?.hasBot || report.dzen?.ok ? 0 : 1);
