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

const report = { at: new Date().toISOString(), vkVerify: null, dzen: null };

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

// Quick VK verify on wall list + post_2
await page.goto("https://vk.ru/wall-240408086", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
const wallText = await page.locator("body").innerText();
report.vkVerify = {
  hasBot: /zovus_card_bot/i.test(wallText),
  shot: await shot(page, "vk-verify2"),
};
console.log("VK wall has bot", report.vkVerify.hasBot);

// Dzen: open + menu and click exact "Написать статью"
await page.goto("https://dzen.ru/profile/editor/id/6a50b97e363bf24ef269684e/publications", {
  waitUntil: "domcontentloaded",
  timeout: 60000,
});
await page.waitForTimeout(2500);

const addBtn = page.locator('button[class*="author-studio-header__addButton"]').first();
await addBtn.click();
await page.waitForTimeout(1000);
await shot(page, "dzen-plus-open");

// Prefer article; fallback to post (brief)
const article = page.getByText("Написать статью", { exact: true }).first();
const post = page.getByText("Написать пост", { exact: true }).first();

let mode = null;
if (await article.isVisible().catch(() => false)) {
  // May open in new tab
  const [popup] = await Promise.all([
    page.context().waitForEvent("page", { timeout: 8000 }).catch(() => null),
    article.click(),
  ]);
  mode = "article";
  if (popup) {
    await popup.waitForLoadState("domcontentloaded").catch(() => {});
    await popup.waitForTimeout(2500);
    var editorPage = popup;
  } else {
    await page.waitForTimeout(3000);
    var editorPage = page;
  }
} else if (await post.isVisible().catch(() => false)) {
  const [popup] = await Promise.all([
    page.context().waitForEvent("page", { timeout: 8000 }).catch(() => null),
    post.click(),
  ]);
  mode = "post";
  if (popup) {
    await popup.waitForLoadState("domcontentloaded").catch(() => {});
    await popup.waitForTimeout(2500);
    var editorPage = popup;
  } else {
    await page.waitForTimeout(3000);
    var editorPage = page;
  }
} else {
  report.dzen = { ok: false, reason: "no_menu_items", shot: await shot(page, "dzen-no-items") };
  writeFileSync(join(OUT, "post-result8.json"), JSON.stringify(report, null, 2));
  process.exit(1);
}

console.log("mode", mode, "url", editorPage.url(), "pages", editorPage.context().pages().map((p) => p.url()));
await shot(editorPage, "dzen-editor-open");

// Wait for editor
let editors = editorPage.locator('[contenteditable="true"]');
for (let i = 0; i < 10 && (await editors.count()) === 0; i++) {
  await editorPage.waitForTimeout(1000);
  // also try placeholders
  const ph = editorPage.getByPlaceholder(/заголовок|напишите|текст/i).first();
  if (await ph.isVisible().catch(() => false)) break;
  editors = editorPage.locator('[contenteditable="true"]');
}

let count = await editors.count();
console.log("editors", count, editorPage.url());

// textarea / input fallbacks
const titleInput = editorPage
  .locator('[contenteditable="true"], textarea, input[placeholder*="аголовок" i], [data-placeholder*="аголовок" i]')
  .first();

if (count > 0 || (await titleInput.isVisible().catch(() => false))) {
  if (count > 0) {
    await editors.first().click();
    await editors.first().fill(DZEN_TITLE);
    if (count > 1) {
      await editors.nth(1).click();
      await editors.nth(1).fill(DZEN_BODY);
    } else {
      await editorPage.keyboard.press("Enter");
      await editorPage.keyboard.type(DZEN_BODY, { delay: 5 });
    }
  } else {
    await titleInput.click();
    await titleInput.fill(DZEN_TITLE);
    await editorPage.keyboard.press("Tab");
    await editorPage.keyboard.type(DZEN_BODY, { delay: 5 });
  }
  await shot(editorPage, "dzen-article-filled");

  let published = false;
  for (let i = 0; i < 5; i++) {
    const pub = editorPage.getByRole("button", { name: /Опубликовать/i }).first();
    if (await pub.isVisible().catch(() => false)) {
      await pub.click();
      await editorPage.waitForTimeout(2500);
      await shot(editorPage, `dzen-art-pub-${i}`);
      const conf = editorPage.getByRole("button", { name: /Опубликовать/i }).first();
      if (await conf.isVisible().catch(() => false)) {
        await conf.click();
        await editorPage.waitForTimeout(3000);
      }
      published = true;
      break;
    }
    const next = editorPage.getByRole("button", { name: /Далее|Продолжить/i }).first();
    if (await next.isVisible().catch(() => false)) {
      await next.click();
      await editorPage.waitForTimeout(2000);
      continue;
    }
    break;
  }

  report.dzen = {
    ok: published,
    mode,
    url: editorPage.url(),
    shot: await shot(editorPage, "dzen-article-done"),
  };
} else {
  const text = await editorPage.locator("body").innerText().catch(() => "");
  report.dzen = {
    ok: false,
    mode,
    reason: "no_editor",
    url: editorPage.url(),
    text: text.slice(0, 1500),
    shot: await shot(editorPage, "dzen-article-noed"),
  };
}

writeFileSync(join(OUT, "post-result8.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(report.dzen?.ok ? 0 : 1);
