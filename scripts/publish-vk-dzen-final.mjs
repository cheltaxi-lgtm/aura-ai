#!/usr/bin/env node
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", ".cursor", "organic-finish");
mkdirSync(OUT, { recursive: true });

const VK_TEXT = `Zovus теперь и в Telegram.

Официальный бот @zovus_card_bot — бесплатный расклад из трёх карт, матрица судьбы и продолжение сеанса в мессенджере.

Открыть бота: https://t.me/zovus_card_bot
Страница на сайте: https://zovus.ru/telegram

Сайт: https://zovus.ru`;

const DZEN_TITLE = "Telegram-бот Zovus — расклады Таро в мессенджере";
const DZEN_BODY = `Официальный Telegram-бот Zovus (@zovus_card_bot) — быстрый вход в те же практики, что и на сайте: три карты бесплатно, матрица судьбы, диалог с наставником.

Ссылка на бота: https://t.me/zovus_card_bot
Подробнее: https://zovus.ru/telegram

Сайт: https://zovus.ru`;

const report = { at: new Date().toISOString(), vk: null, dzen: null };

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

// ========== VK ==========
await page.goto("https://vk.ru/zovus", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(2500);

// Close leftover modal if any
const closeX = page.locator('[aria-label="Закрыть"], [aria-label="Close"]').first();
if (await closeX.isVisible().catch(() => false)) {
  await closeX.click().catch(() => {});
  await page.waitForTimeout(500);
}

const create = page
  .locator('[data-testid="group_publish_block"]')
  .getByRole("button", { name: /Создать/i })
  .first();
if (!(await create.isVisible().catch(() => false))) {
  // fallback
  const alt = page.getByRole("button", { name: /Создать/i }).first();
  await alt.click();
} else {
  await create.click();
}
await page.waitForTimeout(1000);

const postType = page.getByText(/^Пост$/).first();
if (await postType.isVisible().catch(() => false)) {
  await postType.click();
  await page.waitForTimeout(1500);
}

const editable = page.locator('[contenteditable="true"]').first();
await editable.waitFor({ state: "visible", timeout: 15000 });
await editable.click();
await editable.fill(VK_TEXT);
await page.waitForTimeout(500);
await shot(page, "vk-final-filled");

await page.getByRole("button", { name: /^Далее$/ }).first().click();
await page.waitForTimeout(2000);
await shot(page, "vk-final-next");

// May need another Далее or Опубликовать
for (let i = 0; i < 4; i++) {
  const pub = page.getByRole("button", { name: /^Опубликовать$/ }).first();
  if (await pub.isVisible().catch(() => false)) {
    await pub.click();
    console.log("VK clicked Опубликовать");
    await page.waitForTimeout(5000);
    break;
  }
  const next = page.getByRole("button", { name: /^Далее$/ }).first();
  if (await next.isVisible().catch(() => false)) {
    await next.click();
    console.log("VK clicked Далее again");
    await page.waitForTimeout(2000);
    continue;
  }
  break;
}
await shot(page, "vk-final-after-pub");

// Find newest wall posts mentioning bot
await page.goto("https://vk.ru/wall-240408086", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000);
const vkInfo = await page.evaluate(() => {
  const text = document.body?.innerText || "";
  const links = [...document.querySelectorAll("a[href*='wall-240408086_']")].map((a) => a.href);
  const unique = [...new Set(links)].slice(0, 10);
  return {
    hasBot: /zovus_card_bot/i.test(text),
    hasTelegram: /t\.me\/zovus_card_bot/i.test(text),
    links: unique,
    snippet: text.includes("zovus_card_bot")
      ? text.slice(Math.max(0, text.indexOf("zovus_card_bot") - 120), text.indexOf("zovus_card_bot") + 200)
      : null,
  };
});
report.vk = { ...vkInfo, shot: await shot(page, "vk-final-wall") };
console.log("VK result", report.vk);

// Open each recent post to find the bot one
if (!vkInfo.hasBot) {
  for (const href of vkInfo.links.slice(0, 5)) {
    await page.goto(href, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    const t = await page.locator("body").innerText();
    if (/zovus_card_bot/i.test(t)) {
      report.vk = {
        ok: true,
        postLink: href,
        hasBot: true,
        shot: await shot(page, "vk-found-post"),
      };
      console.log("VK found post", href);
      break;
    }
  }
} else {
  report.vk.ok = true;
  report.vk.postLink = vkInfo.links[0] || null;
}

// ========== DZEN ==========
await page.goto("https://dzen.ru/profile/editor/id/6a50b97e363bf24ef269684e/publications", {
  waitUntil: "domcontentloaded",
  timeout: 60000,
});
await page.waitForTimeout(3000);

// Click the studio "+" add button by class
const addBtn = page.locator('button[class*="author-studio-header__addButton"]').first();
console.log("addBtn visible", await addBtn.isVisible().catch(() => false));
if (await addBtn.isVisible().catch(() => false)) {
  await addBtn.click();
} else {
  // coordinate fallback
  await page.mouse.click(1522, 32);
}
await page.waitForTimeout(1500);
await shot(page, "dzen-add-menu");

// Menu items after +
const menuDump = await page.evaluate(() =>
  [...document.querySelectorAll('[role="menuitem"], [class*="menu"] button, [class*="Menu"] div, li, a')]
    .map((e) => (e.textContent || "").trim().replace(/\s+/g, " "))
    .filter((t) => t && t.length < 40)
    .slice(0, 40),
);
console.log("add menu", menuDump);
writeFileSync(join(OUT, "dzen-add-menu.json"), JSON.stringify(menuDump, null, 2));

for (const label of ["Статья", "Статью", "Текст", "Публикация", "Пост"]) {
  const item = page.getByRole("menuitem", { name: new RegExp(label, "i") }).first();
  const text = page.getByText(new RegExp(`^${label}$`, "i")).first();
  if (await item.isVisible().catch(() => false)) {
    await item.click();
    console.log("menu item", label);
    await page.waitForTimeout(2500);
    break;
  }
  if (await text.isVisible().catch(() => false)) {
    await text.click();
    console.log("menu text", label);
    await page.waitForTimeout(2500);
    break;
  }
}
await shot(page, "dzen-after-type");
console.log("url after type", page.url());

let editors = page.locator('[contenteditable="true"]');
let count = await editors.count();
if (count === 0) {
  for (const frame of page.frames()) {
    const fe = frame.locator('[contenteditable="true"]');
    if ((await fe.count()) > 0) {
      editors = fe;
      count = await fe.count();
      console.log("editors in frame", frame.url(), count);
      break;
    }
  }
}
console.log("editors", count, page.url());

if (count > 0) {
  await editors.first().click();
  await editors.first().fill(DZEN_TITLE);
  if (count > 1) {
    await editors.nth(1).click();
    await editors.nth(1).fill(DZEN_BODY);
  } else {
    await page.keyboard.press("Enter");
    await page.keyboard.type(DZEN_BODY, { delay: 5 });
  }
  await shot(page, "dzen-final-filled");

  for (let i = 0; i < 4; i++) {
    const pub = page.getByRole("button", { name: /Опубликовать/i }).first();
    if (await pub.isVisible().catch(() => false)) {
      await pub.click();
      console.log("Dzen Опубликовать", i);
      await page.waitForTimeout(3000);
      await shot(page, `dzen-pub-${i}`);
      // confirm
      const conf = page.getByRole("button", { name: /Опубликовать/i }).first();
      if (await conf.isVisible().catch(() => false)) {
        await conf.click();
        await page.waitForTimeout(3000);
      }
      break;
    }
    const next = page.getByRole("button", { name: /Далее|Продолжить/i }).first();
    if (await next.isVisible().catch(() => false)) {
      await next.click();
      await page.waitForTimeout(2000);
      continue;
    }
    break;
  }

  report.dzen = {
    ok: true,
    url: page.url(),
    shot: await shot(page, "dzen-final-done"),
  };
} else {
  report.dzen = {
    ok: false,
    reason: "no_editor_after_add",
    menuDump,
    url: page.url(),
    shot: await shot(page, "dzen-final-fail"),
  };
}

writeFileSync(join(OUT, "post-result7.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(report.vk?.ok || report.dzen?.ok ? 0 : 1);
