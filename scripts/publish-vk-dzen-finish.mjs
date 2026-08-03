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

const report = { at: new Date().toISOString(), vk: null, dzen: null, dzenProbe: [] };

async function shot(page, name) {
  const p = join(OUT, `${name}.png`);
  try {
    await page.screenshot({ path: p, timeout: 12000, fullPage: false });
  } catch {
    /* ignore */
  }
  return p;
}

async function clickVisible(page, patterns, { role = "button", timeout = 2000 } = {}) {
  for (const label of patterns) {
    const re = new RegExp(label, "i");
    const candidates = [
      page.getByRole(role, { name: re }).first(),
      page.getByRole("link", { name: re }).first(),
      page.getByText(re).first(),
    ];
    for (const el of candidates) {
      try {
        if (await el.isVisible({ timeout: 400 })) {
          await el.click({ timeout });
          await page.waitForTimeout(1200);
          return label;
        }
      } catch {
        /* next */
      }
    }
  }
  return null;
}

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const ctx = browser.contexts()[0];
const page = ctx.pages()[0] || (await ctx.newPage());

// ——— VK finish: modal may already be open ———
let modalOpen = await page.getByText(/Новый пост/i).first().isVisible().catch(() => false);
if (!modalOpen) {
  await page.goto("https://vk.ru/zovus", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2500);
  const create = page.locator('[data-testid="group_publish_block"]').getByRole("button", { name: /Создать/i }).first();
  if (await create.isVisible().catch(() => false)) {
    await create.click();
    await page.waitForTimeout(1000);
    await clickVisible(page, ["^Пост$", "^Запись$"]);
    await page.waitForTimeout(1500);
  }
  modalOpen = await page.getByText(/Новый пост/i).first().isVisible().catch(() => false);
}

const editable = page.locator('[contenteditable="true"]').first();
const hasText = await editable.innerText().catch(() => "");
console.log("VK modal", modalOpen, "textLen", hasText.length);

if (await editable.isVisible().catch(() => false)) {
  if (!/zovus_card_bot/i.test(hasText)) {
    await editable.click();
    await editable.fill(VK_TEXT);
    await page.waitForTimeout(600);
  }
  await shot(page, "vk-ready-next");

  // Step 1: Далее
  let clicked = await clickVisible(page, ["^Далее$"]);
  console.log("VK Далее", clicked);
  await shot(page, "vk-after-next");

  // Step 2: Опубликовать (may need second Далее)
  for (let i = 0; i < 3; i++) {
    const pub = await clickVisible(page, ["^Опубликовать$", "^Опубликовать сейчас$"]);
    console.log("VK publish attempt", i, pub);
    if (pub) break;
    const next = await clickVisible(page, ["^Далее$", "^Продолжить$"]);
    console.log("VK next again", next);
    await shot(page, `vk-step-${i}`);
  }
  await page.waitForTimeout(4000);
  await shot(page, "vk-after-publish");

  // Verify on wall
  await page.goto("https://vk.ru/wall-240408086", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(3000);
  const wall = await page.locator("body").innerText();
  const hasBot = /zovus_card_bot|t\.me\/zovus_card_bot/i.test(wall);
  const postLink = await page.evaluate(() => {
    const posts = [...document.querySelectorAll("a[href*='wall-240408086_']")];
    return posts[0]?.href || null;
  });
  report.vk = {
    ok: hasBot,
    wallHasBotMention: hasBot,
    postLink,
    url: page.url(),
    shot: await shot(page, "vk-wall-verify"),
  };
  console.log("VK verify", report.vk);
} else {
  report.vk = { ok: false, reason: "no_modal", url: page.url(), shot: await shot(page, "vk-nomodal") };
}

// ——— DZEN: probe create entry points ———
const dzenUrls = [
  "https://dzen.ru/media/zen/login",
  "https://dzen.ru/profile/editor/id/6a50b97e363bf24ef269684e",
  "https://zen.yandex.ru/media/zen/login",
  "https://dzen.ru/id/6a50b97e363bf24ef269684e",
  "https://dzen.ru/",
];

for (const url of dzenUrls) {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(2000);
    const info = await page.evaluate(() => ({
      url: location.href,
      title: document.title,
      text: (document.body?.innerText || "").slice(0, 500),
      buttons: [...document.querySelectorAll("button, a, [role='button']")]
        .map((e) => (e.textContent || "").trim().replace(/\s+/g, " "))
        .filter((t) => t && t.length < 60)
        .filter((t) => /создать|написать|статья|публикац|студи|редакт|\+|plus|editor|write/i.test(t))
        .slice(0, 25),
      plusAria: [...document.querySelectorAll("[aria-label], [title]")]
        .map((e) => ({
          tag: e.tagName,
          label: e.getAttribute("aria-label") || e.getAttribute("title"),
          text: (e.textContent || "").trim().slice(0, 40),
        }))
        .filter((x) => /создать|написать|статья|публикац|студи|\+|plus|editor|write|добавить/i.test(`${x.label} ${x.text}`))
        .slice(0, 20),
    }));
    report.dzenProbe.push(info);
    console.log("dzen probe", url, "->", info.url, info.buttons, info.plusAria);
    await shot(page, `dzen-probe-${report.dzenProbe.length}`);
  } catch (e) {
    report.dzenProbe.push({ url, error: String(e) });
  }
}

// Try clicking create from channel / home
await page.goto("https://dzen.ru/id/6a50b97e363bf24ef269684e", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);

// Avatar / profile menu often has Studio
const avatar = page.locator('header button, header a, [class*="avatar"], img[alt*="аватар"], [data-testid*="avatar"]').first();
if (await avatar.isVisible().catch(() => false)) {
  await avatar.click().catch(() => {});
  await page.waitForTimeout(1000);
  await shot(page, "dzen-avatar-menu");
}

let clickedCreate = await clickVisible(page, [
  "Студия",
  "Написать",
  "Создать публикацию",
  "Создать",
  "Редактор",
  "Статья",
]);
console.log("dzen menu click", clickedCreate, page.url());
await shot(page, "dzen-after-menu");

// Also try floating + button
if (!(await page.locator('[contenteditable="true"]').first().isVisible().catch(() => false))) {
  const plus = page.locator('[aria-label*="Создать"], [aria-label*="Написать"], [title*="Создать"], button:has-text("+")').first();
  if (await plus.isVisible().catch(() => false)) {
    await plus.click();
    await page.waitForTimeout(1500);
    clickedCreate = await clickVisible(page, ["Статья", "Публикация", "Пост", "Написать"]);
    console.log("dzen plus", clickedCreate, page.url());
  }
}

// Studio host variants
for (const studio of [
  "https://dzen.ru/profile/editor/",
  "https://dzen.ru/media-editor/",
  "https://editor.dzen.ru/",
  "https://dzen.ru/a/new",
]) {
  if (await page.locator('[contenteditable="true"]').first().isVisible().catch(() => false)) break;
  try {
    await page.goto(studio, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(2000);
    console.log("studio try", studio, "->", page.url());
    await shot(page, `dzen-studio-${studio.replace(/[^\w]+/g, "_").slice(0, 40)}`);
  } catch {
    /* next */
  }
}

let editors = page.locator('[contenteditable="true"]');
let count = await editors.count();
console.log("final editors", count, page.url());

if (count === 0) {
  // Click any discovered create-like control from last probe dump
  const any = await clickVisible(page, ["Статья", "Написать статью", "Новая статья", "Создать статью", "Публикация"]);
  console.log("any create", any);
  await page.waitForTimeout(2000);
  editors = page.locator('[contenteditable="true"]');
  count = await editors.count();
}

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
  await shot(page, "dzen-filled-final");
  const pub = await clickVisible(page, ["^Опубликовать$", "Опубликовать"]);
  if (pub) {
    await page.waitForTimeout(2000);
    await clickVisible(page, ["^Опубликовать$", "Далее", "Продолжить"]);
    await page.waitForTimeout(3000);
  }
  report.dzen = { ok: Boolean(pub), url: page.url(), shot: await shot(page, "dzen-done") };
} else {
  // Last resort: dump clickable texts for manual handoff
  const dump = await page.evaluate(() => ({
    url: location.href,
    links: [...document.querySelectorAll("a[href]")]
      .map((a) => ({ href: a.href, text: (a.textContent || "").trim().slice(0, 80) }))
      .filter((x) => /editor|studio|create|media|write|публика|стать|канал/i.test(`${x.href} ${x.text}`))
      .slice(0, 40),
  }));
  report.dzen = { ok: false, reason: "no_editor", dump, url: page.url(), shot: await shot(page, "dzen-fail-final") };
}

writeFileSync(join(OUT, "post-result5.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(report.vk?.ok ? 0 : 1);
