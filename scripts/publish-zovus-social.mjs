#!/usr/bin/env node
/**
 * Attempt VK wall post for Zovus Telegram discovery.
 * Uses Playwright persistent Chrome profile (interactive login if needed).
 * Usage: node scripts/publish-zovus-social.mjs [--headed]
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dir, "..", ".cursor", "social-publish");
const headed = process.argv.includes("--headed") || process.env.HEADED === "1";
mkdirSync(OUT, { recursive: true });

const VK_TEXT = `Zovus теперь и в Telegram.

Официальный бот @zovus_card_bot — бесплатный расклад из трёх карт, матрица судьбы и продолжение сеанса в мессенджере.

Открыть бота: https://t.me/zovus_card_bot
Страница на сайте: https://zovus.ru/telegram

Сайт: https://zovus.ru`;

const DZEN_TITLE = "Telegram-бот Zovus — расклады Таро в мессенджере";
const DZEN_TEXT = `Официальный Telegram-бот Zovus (@zovus_card_bot) — быстрый вход в те же практики, что и на сайте: три карты бесплатно, матрица судьбы, диалог с наставником.

Ссылка на бота: https://t.me/zovus_card_bot
Подробнее: https://zovus.ru/telegram`;

const result = { at: new Date().toISOString(), vk: null, dzen: null };

async function shot(page, name) {
  const p = join(OUT, `${name}.png`);
  await page.screenshot({ path: p, fullPage: true }).catch(() => {});
  return p;
}

async function tryVk(context) {
  const page = await context.newPage();
  await page.goto("https://vk.ru/zovus", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2500);
  await shot(page, "vk-01");

  const signedOut = await page.getByRole("button", { name: /Sign in|Войти/i }).first().isVisible().catch(() => false);
  if (signedOut) {
    result.vk = { ok: false, reason: "login_required" };
    console.log("VK: login required — open headed and sign in, then re-run");
    if (headed) {
      console.log("Waiting 90s for manual login…");
      await page.waitForTimeout(90000);
      await page.goto("https://vk.ru/zovus", { waitUntil: "domcontentloaded" });
    } else {
      await page.close();
      return;
    }
  }

  // Try open post composer
  const postBox = page.locator('[data-testid="post_field"], [contenteditable="true"], textarea').first();
  const hasComposer = await postBox.isVisible({ timeout: 5000 }).catch(() => false);
  if (!hasComposer) {
    // click "What's new" / create post
    const create = page.getByText(/Что у вас нового|What's new|Создать запись|Write/i).first();
    if (await create.isVisible().catch(() => false)) await create.click();
    await page.waitForTimeout(1500);
  }

  const editable = page.locator('[contenteditable="true"]').first();
  if (!(await editable.isVisible({ timeout: 8000 }).catch(() => false))) {
    result.vk = { ok: false, reason: "composer_not_found", shot: await shot(page, "vk-no-composer") };
    await page.close();
    return;
  }

  await editable.click();
  await editable.fill(VK_TEXT);
  await shot(page, "vk-filled");

  const publish = page.getByRole("button", { name: /Опубликовать|Publish|Post/i }).first();
  if (!(await publish.isVisible().catch(() => false))) {
    result.vk = { ok: false, reason: "publish_btn_missing", shot: await shot(page, "vk-no-publish") };
    await page.close();
    return;
  }
  await publish.click();
  await page.waitForTimeout(4000);
  result.vk = { ok: true, shot: await shot(page, "vk-done") };
  console.log("VK: published (or submit clicked)");
  await page.close();
}

async function tryDzen(context) {
  const page = await context.newPage();
  await page.goto("https://dzen.ru/id/6a50b97e363bf24ef269684e", {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForTimeout(2500);
  await shot(page, "dzen-01");

  // Publisher entry
  await page.goto("https://dzen.ru/media/zen/login", { waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForTimeout(2000);
  await shot(page, "dzen-login");

  const editorUrl = "https://dzen.ru/media/zen/publications";
  await page.goto(editorUrl, { waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForTimeout(2500);
  await shot(page, "dzen-pubs");

  const createBtn = page.getByRole("link", { name: /Написать|Создать|Новая/i }).first();
  if (!(await createBtn.isVisible().catch(() => false))) {
    result.dzen = {
      ok: false,
      reason: "login_or_editor_unavailable",
      note: "Paste manually from docs/yandex-audit/social-posts.md",
      shot: await shot(page, "dzen-blocked"),
    };
    await page.close();
    return;
  }
  await createBtn.click();
  await page.waitForTimeout(2000);
  const title = page.locator('input[placeholder*="Заголовок"], [data-testid*="title"]').first();
  if (await title.isVisible().catch(() => false)) await title.fill(DZEN_TITLE);
  const body = page.locator('[contenteditable="true"]').first();
  if (await body.isVisible().catch(() => false)) await body.fill(DZEN_TEXT);
  await shot(page, "dzen-draft");
  result.dzen = {
    ok: false,
    reason: "draft_filled_manual_publish",
    note: "Review draft in browser and publish (Dzen UI varies)",
  };
  await page.close();
}

const userData = join(OUT, "chrome-profile");
mkdirSync(userData, { recursive: true });

const context = await chromium.launchPersistentContext(userData, {
  headless: !headed,
  channel: "chrome",
  args: ["--disable-blink-features=AutomationControlled"],
  viewport: { width: 1280, height: 900 },
});

try {
  await tryVk(context);
  await tryDzen(context);
} finally {
  writeFileSync(join(OUT, "result.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  await context.close();
}
