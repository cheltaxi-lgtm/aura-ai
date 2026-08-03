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

// ——— VK: click Создать ———
await page.goto("https://vk.ru/zovus", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(3000);

const create = page.locator('[data-testid="group_publish_block"]').getByRole("button", { name: /Создать/i }).first();
console.log("create visible", await create.isVisible().catch(() => false));
if (await create.isVisible().catch(() => false)) {
  await create.click();
  await page.waitForTimeout(1500);
}

// Pick "Запись" from dropdown if present
for (const label of ["Запись", "Пост", "Опубликовать запись"]) {
  const item = page.getByRole("menuitem", { name: new RegExp(label, "i") }).first();
  const textItem = page.getByText(new RegExp(`^${label}$`, "i")).first();
  if (await item.isVisible().catch(() => false)) {
    await item.click();
    await page.waitForTimeout(2000);
    console.log("clicked menuitem", label);
    break;
  }
  if (await textItem.isVisible().catch(() => false)) {
    await textItem.click();
    await page.waitForTimeout(2000);
    console.log("clicked text", label);
    break;
  }
}
await shot(page, "vk-after-create");

let editable = page.locator('[contenteditable="true"]').first();
if (!(await editable.isVisible().catch(() => false))) {
  await page.goto("https://vk.ru/wall-240408086?owner=1", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  const create2 = page.getByRole("button", { name: /Создать/i }).first();
  if (await create2.isVisible().catch(() => false)) {
    await create2.click();
    await page.waitForTimeout(1200);
    const zapis = page.getByText(/^Запись$/i).first();
    if (await zapis.isVisible().catch(() => false)) await zapis.click();
    await page.waitForTimeout(2000);
  }
  editable = page.locator('[contenteditable="true"]').first();
}

console.log("editable", await editable.isVisible().catch(() => false), page.url());
await shot(page, "vk-composer-try");

if (await editable.isVisible().catch(() => false)) {
  await editable.click();
  await editable.fill(VK_TEXT);
  await page.waitForTimeout(800);
  await shot(page, "vk-filled2");
  const pub = page.getByRole("button", { name: /Опубликовать/i }).first();
  if (await pub.isVisible().catch(() => false)) {
    await pub.click();
    await page.waitForTimeout(5000);
    report.vk = { ok: true, url: page.url(), shot: await shot(page, "vk-published") };
    console.log("VK OK publish click");
  } else {
    await page.keyboard.press("Control+Enter");
    await page.waitForTimeout(4000);
    report.vk = { ok: true, reason: "ctrl_enter", url: page.url(), shot: await shot(page, "vk-ctrl-enter") };
    console.log("VK OK ctrl+enter");
  }
} else {
  // Inspect dropdown HTML
  const dump = await page.evaluate(() => {
    const block = document.querySelector('[data-testid="group_publish_block"]');
    return {
      blockText: block?.textContent?.slice(0, 300),
      menus: [...document.querySelectorAll('[role="menu"] [role="menuitem"], [class*="menu"] a, [class*="Menu"] div')]
        .map((e) => (e.textContent || "").trim())
        .filter(Boolean)
        .slice(0, 30),
    };
  });
  console.log("dump", dump);
  report.vk = { ok: false, reason: "no_composer", dump, shot: await shot(page, "vk-fail2") };
}

// Verify new post on wall
await page.goto("https://vk.ru/zovus", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
const wallText = await page.locator("body").innerText();
const hasBot = /zovus_card_bot|t\.me\/zovus_card_bot/i.test(wallText);
report.vk = { ...(report.vk || {}), wallHasBotMention: hasBot };
console.log("wallHasBotMention", hasBot);

// ——— DZEN ———
await page.goto("https://dzen.ru/create", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(3000);
await shot(page, "dzen-create");

// Click create entry points
for (const label of ["Статья", "Написать", "Создать", "Публикация", "Лонгрид"]) {
  const el = page.getByRole("button", { name: new RegExp(label, "i") }).or(page.getByText(new RegExp(`^${label}$`, "i"))).first();
  if (await el.isVisible().catch(() => false)) {
    await el.click();
    await page.waitForTimeout(2500);
    console.log("dzen clicked", label, page.url());
    break;
  }
}

let editors = page.locator('[contenteditable="true"]');
let count = await editors.count();
console.log("dzen editors", count, page.url());

if (count === 0) {
  // Profile menu → studio
  await page.goto("https://dzen.ru/id/6a50b97e363bf24ef269684e", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  const write = page.getByText(/Написать|Создать публикацию|Студия/i).first();
  if (await write.isVisible().catch(() => false)) {
    await write.click();
    await page.waitForTimeout(2500);
  }
  editors = page.locator('[contenteditable="true"]');
  count = await editors.count();
  console.log("dzen editors2", count, page.url());
}

if (count > 0) {
  await editors.first().click();
  await editors.first().fill(DZEN_TITLE);
  if (count > 1) {
    await editors.nth(1).click();
    await editors.nth(1).fill(DZEN_BODY);
  } else {
    await page.keyboard.press("Enter");
    await page.keyboard.type(DZEN_BODY);
  }
  await shot(page, "dzen-filled2");
  const pub = page.getByRole("button", { name: /Опубликовать/i }).first();
  if (await pub.isVisible().catch(() => false)) {
    await pub.click();
    await page.waitForTimeout(3000);
    const conf = page.getByRole("button", { name: /Опубликовать|Далее|Продолжить/i }).first();
    if (await conf.isVisible().catch(() => false)) {
      await conf.click();
      await page.waitForTimeout(3000);
    }
    report.dzen = { ok: true, url: page.url(), shot: await shot(page, "dzen-published") };
  } else {
    report.dzen = { ok: false, reason: "draft_only", url: page.url(), shot: await shot(page, "dzen-draft2") };
  }
} else {
  report.dzen = { ok: false, reason: "no_editor", url: page.url(), shot: await shot(page, "dzen-noed") };
}

writeFileSync(join(OUT, "post-result4.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(report.vk?.ok || report.dzen?.ok ? 0 : 1);
