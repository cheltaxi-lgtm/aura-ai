#!/usr/bin/env node
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dir, "..", ".cursor", "organic-finish");
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

async function body(page, n = 800) {
  return (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, n);
}

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const context = browser.contexts()[0];
const page = context.pages()[0] || (await context.newPage());

// ——— VK ———
await page.goto("https://vk.ru/zovus", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(3000);
await shot(page, "vk-now-1");
console.log("VK url", page.url());
console.log("VK snippet", await body(page, 400));

const vkLogin = await page
  .getByRole("button", { name: /Sign in|Войти/i })
  .first()
  .isVisible()
  .catch(() => false);
const phoneLogin = /Вход ВКонтакте|Телефон|Почта/i.test(await body(page, 300));

if (vkLogin || phoneLogin) {
  report.vk = { ok: false, reason: "still_login_wall", shot: await shot(page, "vk-login-wall") };
  console.log("VK still needs login");
} else {
  // Open composer
  const candidates = [
    page.getByText(/Что у вас нового/i).first(),
    page.getByPlaceholder(/Что у вас нового/i).first(),
    page.locator('[data-testid="post_field"]').first(),
    page.locator('[contenteditable="true"]').first(),
  ];
  for (const c of candidates) {
    if (await c.isVisible().catch(() => false)) {
      await c.click().catch(() => {});
      await page.waitForTimeout(800);
      break;
    }
  }
  // Sometimes need "Create post" / wall create
  const createBtn = page.getByRole("button", { name: /Создать запись|Написать|Create/i }).first();
  if (await createBtn.isVisible().catch(() => false)) {
    await createBtn.click();
    await page.waitForTimeout(1200);
  }

  let editable = page.locator('[contenteditable="true"]').first();
  if (!(await editable.isVisible({ timeout: 5000 }).catch(() => false))) {
    // try click wall post area
    const wall = page.locator("#post_field, .post_field, [data-testid='status-input']").first();
    if (await wall.isVisible().catch(() => false)) await wall.click();
    editable = page.locator('[contenteditable="true"]').first();
  }

  if (await editable.isVisible({ timeout: 8000 }).catch(() => false)) {
    await editable.click();
    await page.keyboard.press("Control+A").catch(() => {});
    await editable.fill(VK_TEXT);
    await shot(page, "vk-now-filled");
    const publish = page
      .getByRole("button", { name: /Опубликовать|Publish|Отправить|Post/i })
      .first();
    if (await publish.isVisible().catch(() => false)) {
      await publish.click();
      await page.waitForTimeout(4500);
      report.vk = { ok: true, shot: await shot(page, "vk-now-done"), url: page.url() };
      console.log("VK published");
    } else {
      // Enter sometimes submits
      await page.keyboard.press("Control+Enter").catch(() => {});
      await page.waitForTimeout(3000);
      report.vk = {
        ok: false,
        reason: "no_publish_btn_tried_ctrl_enter",
        shot: await shot(page, "vk-now-no-pub"),
      };
    }
  } else {
    report.vk = { ok: false, reason: "no_composer", shot: await shot(page, "vk-now-no-composer") };
    console.log("VK no composer");
  }
}

// ——— DZEN ———
const dzenUrls = [
  "https://dzen.ru/create",
  "https://dzen.ru/media",
  "https://dzen.ru/id/6a50b97e363bf24ef269684e",
  "https://dzen.ru/profile/editor/publications",
];

let dzenDone = false;
for (const u of dzenUrls) {
  await page.goto(u, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => null);
  await page.waitForTimeout(2500);
  const snip = await body(page, 350);
  console.log("DZEN try", page.url(), snip.slice(0, 160));
  await shot(page, `dzen-try-${dzenUrls.indexOf(u)}`);

  if (/не существует|загадка вселенной/i.test(snip)) continue;

  // Look for create / write
  const write = page
    .getByRole("link", { name: /Написать|Создать|Новая публикация|Статья/i })
    .or(page.getByRole("button", { name: /Написать|Создать|Новая/i }))
    .or(page.getByText(/Написать статью|Создать публикацию|Новая публикация/i))
    .first();

  if (await write.isVisible().catch(() => false)) {
    await write.click();
    await page.waitForTimeout(2500);
  }

  // Title + body
  const titleInput = page
    .locator('input[placeholder*="Заголовок"], textarea[placeholder*="Заголовок"], [data-placeholder*="Заголовок"]')
    .first();
  const anyInput = page.locator("input:visible").first();
  if (await titleInput.isVisible().catch(() => false)) {
    await titleInput.fill(DZEN_TITLE);
  } else if (await anyInput.isVisible().catch(() => false)) {
    const ph = (await anyInput.getAttribute("placeholder")) || "";
    if (!/поиск|search|найти/i.test(ph)) await anyInput.fill(DZEN_TITLE).catch(() => {});
  }

  const editors = page.locator('[contenteditable="true"]');
  const ec = await editors.count();
  if (ec > 0) {
    // last contenteditable often body
    const ed = editors.nth(Math.max(0, ec - 1));
    await ed.click();
    await ed.fill(DZEN_BODY);
    await shot(page, "dzen-filled");
    const pub = page.getByRole("button", { name: /Опубликовать|Publish|Продолжить/i }).first();
    if (await pub.isVisible().catch(() => false)) {
      await pub.click();
      await page.waitForTimeout(4000);
      // confirm dialogs
      const confirm = page.getByRole("button", { name: /Опубликовать|Да|Confirm/i }).first();
      if (await confirm.isVisible().catch(() => false)) {
        await confirm.click();
        await page.waitForTimeout(3000);
      }
      report.dzen = { ok: true, url: page.url(), shot: await shot(page, "dzen-done") };
      dzenDone = true;
      console.log("Dzen published");
      break;
    }
    report.dzen = {
      ok: false,
      reason: "draft_filled",
      url: page.url(),
      shot: await shot(page, "dzen-draft"),
    };
    dzenDone = true;
    break;
  }

  // Channel page: try "Написать" in header
  if (page.url().includes("/id/")) {
    const channelWrite = page.getByText(/Написать|Создать/i).first();
    if (await channelWrite.isVisible().catch(() => false)) {
      await channelWrite.click();
      await page.waitForTimeout(2000);
    }
  }
}

if (!dzenDone) {
  report.dzen = { ok: false, reason: "editor_not_found", shot: await shot(page, "dzen-fail") };
}

writeFileSync(join(OUT, "vk-dzen-result.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(report.vk?.ok || report.dzen?.ok ? 0 : 1);
