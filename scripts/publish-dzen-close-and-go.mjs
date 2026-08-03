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
const ctx = browser.contexts()[0];
let page = ctx.pages().find((p) => /dzen\.ru.*edit/i.test(p.url())) || ctx.pages()[0];

// If editor not open, reopen via + → Написать статью
if (!/edit/i.test(page.url())) {
  await page.goto("https://dzen.ru/profile/editor/id/6a50b97e363bf24ef269684e/publications", {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForTimeout(2000);
  await page.locator('button[class*="author-studio-header__addButton"]').first().click();
  await page.waitForTimeout(800);
  await page.getByText("Написать статью", { exact: true }).click();
  await page.waitForTimeout(3000);
  page = ctx.pages().find((p) => /edit/i.test(p.url())) || page;
}

console.log("editor page", page.url());

// Close help popup / overlays
for (let i = 0; i < 5; i++) {
  const overlay = page.locator(".ReactModal__Overlay, [class*='help-popup__overlay']").first();
  if (!(await overlay.isVisible().catch(() => false))) break;

  // Try close buttons
  const closed =
    (await page
      .getByRole("button", { name: /Закрыть|Понятно|Хорошо|Пропустить|OK|Ок/i })
      .first()
      .click()
      .then(() => true)
      .catch(() => false)) ||
    (await page
      .locator('[aria-label="Закрыть"], button[class*="close"], [class*="help-popup"] button')
      .first()
      .click()
      .then(() => true)
      .catch(() => false));

  if (!closed) {
    await page.keyboard.press("Escape");
  }
  await page.waitForTimeout(600);
  console.log("closed overlay attempt", i, closed);
}
await shot(page, "dzen-overlay-cleared");

// Force-remove overlays if still blocking
await page.evaluate(() => {
  document.querySelectorAll(".ReactModal__Overlay, .ReactModalPortal").forEach((el) => {
    if (/help-popup/i.test(el.className) || el.querySelector("[class*='help-popup']")) {
      el.remove();
    }
  });
});

const editors = page.locator('[contenteditable="true"]');
await editors.first().click({ force: true, timeout: 10000 });
await editors.first().fill(DZEN_TITLE);
await page.waitForTimeout(400);

if ((await editors.count()) > 1) {
  await editors.nth(1).click({ force: true });
  await editors.nth(1).fill(DZEN_BODY);
} else {
  await page.keyboard.press("Enter");
  await page.keyboard.type(DZEN_BODY, { delay: 4 });
}
await shot(page, "dzen-filled-ok");
console.log("filled ok");

// Publish
let published = false;
for (let i = 0; i < 6; i++) {
  // remove overlays again
  await page.evaluate(() => {
    document.querySelectorAll(".ReactModal__Overlay").forEach((el) => {
      if (/help-popup/i.test(el.innerHTML + el.className)) el.remove();
    });
  });

  const pub = page.getByRole("button", { name: /Опубликовать/i }).first();
  if (await pub.isVisible().catch(() => false)) {
    await pub.click({ force: true });
    console.log("clicked publish", i);
    await page.waitForTimeout(2500);
    await shot(page, `dzen-pubstep-${i}`);

    // Possible confirm / cover / settings modal
    const conf = page.getByRole("button", { name: /Опубликовать/i }).first();
    if (await conf.isVisible().catch(() => false)) {
      await conf.click({ force: true }).catch(() => {});
      await page.waitForTimeout(3000);
    }
    published = true;
    break;
  }

  const next = page.getByRole("button", { name: /Далее|Продолжить/i }).first();
  if (await next.isVisible().catch(() => false)) {
    await next.click({ force: true });
    await page.waitForTimeout(1500);
    continue;
  }
  break;
}

report.dzen = {
  ok: published,
  url: page.url(),
  shot: await shot(page, "dzen-publish-end"),
};

// VK: scroll wall and extract post with bot mention
const vk = ctx.pages().find((p) => /vk\./i.test(p.url())) || (await ctx.newPage());
await vk.goto("https://vk.ru/wall-240408086", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(500);
await vk.waitForTimeout(2500);
for (let i = 0; i < 4; i++) {
  await vk.mouse.wheel(0, 900);
  await vk.waitForTimeout(800);
}
await shot(vk, "vk-scrolled");

const vkInfo = await vk.evaluate(() => {
  const posts = [...document.querySelectorAll("[data-post-id], .wall_item, [class*='Post']")];
  const hits = [];
  for (const p of posts) {
    const t = p.innerText || "";
    if (/zovus_card_bot/i.test(t)) {
      const a = p.querySelector("a[href*='wall-240408086_']");
      hits.push({
        id: p.getAttribute("data-post-id"),
        href: a?.href || null,
        text: t.slice(0, 300),
      });
    }
  }
  // fallback: any link near mention
  if (!hits.length && /zovus_card_bot/i.test(document.body.innerText)) {
    const idx = document.body.innerText.indexOf("zovus_card_bot");
    return {
      hasBot: true,
      context: document.body.innerText.slice(Math.max(0, idx - 200), idx + 250),
      links: [...document.querySelectorAll("a[href*='wall-240408086_']")].slice(0, 8).map((a) => a.href),
    };
  }
  return { hasBot: hits.length > 0, hits };
});
report.vk = { ...vkInfo, shot: await shot(vk, "vk-bot-post") };

// If Dzen published, check channel for new article title
if (published) {
  await page.goto("https://dzen.ru/id/6a50b97e363bf24ef269684e", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  const ch = await page.locator("body").innerText();
  report.dzen.channelHasTitle = /Telegram-бот Zovus|zovus_card_bot/i.test(ch);
  report.dzen.channelShot = await shot(page, "dzen-channel-after");
}

writeFileSync(join(OUT, "post-result9.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(report.dzen?.ok || report.vk?.hasBot ? 0 : 1);
