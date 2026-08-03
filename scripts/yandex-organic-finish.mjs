#!/usr/bin/env node
/**
 * Full organic finish via Chrome CDP (port 9222):
 * 1) Webmaster ↔ Metrika bind + crawl-by-counters
 * 2) VK wall post
 * 3) Dzen draft/publish attempt
 *
 * Prerequisite: Chrome --remote-debugging-port=9222
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dir, "..", ".cursor", "organic-finish");
mkdirSync(OUT, { recursive: true });

const COUNTER = "110138367";
const VK_TEXT = `Zovus теперь и в Telegram.

Официальный бот @zovus_card_bot — бесплатный расклад из трёх карт, матрица судьбы и продолжение сеанса в мессенджере.

Открыть бота: https://t.me/zovus_card_bot
Страница на сайте: https://zovus.ru/telegram

Сайт: https://zovus.ru`;

const report = { at: new Date().toISOString(), steps: [] };

function log(step, data) {
  console.log(step, typeof data === "string" ? data : JSON.stringify(data));
  report.steps.push({ step, ...(typeof data === "object" ? data : { detail: data }) });
}

async function shot(page, name) {
  const p = join(OUT, `${name}.png`);
  await page.screenshot({ path: p, fullPage: true }).catch(() => {});
  return p;
}

async function bodyText(page, n = 1200) {
  return (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, n);
}

async function ensureYandexSession(page) {
  await page.goto("https://passport.yandex.ru/profile", {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForTimeout(2000);
  const url = page.url();
  const text = await bodyText(page);
  const loggedIn = /Выход|Log out|Аккаунт|account/i.test(text) && !/Войти|Sign in|Войдите/i.test(url);
  const needsLogin =
    url.includes("auth") ||
    url.includes("passport.yandex.ru/auth") ||
    /Войти|Sign in|Введите пароль|phone/i.test(text);
  await shot(page, "yandex-session");
  return { loggedIn: loggedIn && !needsLogin, url, text: text.slice(0, 400) };
}

async function webmasterBind(page) {
  // Settings → Metrika binding
  const urls = [
    "https://webmaster.yandex.ru/site/https:zovus.ru:443/settings/metrika/",
    "https://webmaster.yandex.ru/site/https:zovus.ru:443/indexing/crawl-via-counters/",
    "https://webmaster.yandex.ru/site/https:zovus.ru:443/settings/",
  ];

  await page.goto(urls[0], { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(3000);
  await shot(page, "wm-metrika-1");
  let text = await bodyText(page, 2000);
  log("wm_metrika_page", { url: page.url(), text: text.slice(0, 500) });

  if (/Войти|passport\.yandex|auth/i.test(page.url() + text)) {
    log("wm_bind", { ok: false, reason: "yandex_login_required" });
    return false;
  }

  // Already linked?
  if (new RegExp(COUNTER).test(text) && /привяз|связан|включ/i.test(text)) {
    log("wm_bind", { ok: true, reason: "counter_already_visible" });
  } else {
    // Try add counter
    const addBtn = page
      .getByRole("button", { name: /Добавить|Привязать|Add/i })
      .or(page.getByText(/Добавить счетчик|Привязать счетчик/i))
      .first();
    if (await addBtn.isVisible().catch(() => false)) {
      await addBtn.click();
      await page.waitForTimeout(1000);
    }
    const input = page.locator('input[type="text"], input[type="number"], input:not([type])').filter({
      hasNot: page.locator('[type="search"]'),
    }).first();
    const inputs = page.locator("input");
    const count = await inputs.count();
    let filled = false;
    for (let i = 0; i < count; i++) {
      const el = inputs.nth(i);
      const type = (await el.getAttribute("type")) || "text";
      if (["hidden", "checkbox", "radio", "submit", "button"].includes(type)) continue;
      const ph = ((await el.getAttribute("placeholder")) || "") + ((await el.getAttribute("name")) || "");
      if (/search|query|фильтр/i.test(ph)) continue;
      if (await el.isVisible().catch(() => false)) {
        await el.fill(COUNTER);
        filled = true;
        break;
      }
    }
    await shot(page, "wm-metrika-filled");
    const save = page.getByRole("button", { name: /Сохранить|Добавить|Привязать|Отправить/i }).first();
    if (filled && (await save.isVisible().catch(() => false))) {
      await save.click();
      await page.waitForTimeout(2500);
      log("wm_bind", { ok: true, reason: "submitted_counter" });
    } else {
      // click any confirm
      const confirm = page.getByRole("button", { name: /Подтвердить|Confirm/i }).first();
      if (await confirm.isVisible().catch(() => false)) {
        await confirm.click();
        await page.waitForTimeout(2000);
        log("wm_bind", { ok: true, reason: "confirmed_existing" });
      } else {
        log("wm_bind", { ok: false, reason: "no_input_or_save", filled, shot: "wm-metrika-filled" });
      }
    }
  }

  // Crawl via counters
  await page.goto(urls[1], { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(3000);
  await shot(page, "wm-crawl-counters");
  text = await bodyText(page, 2000);
  log("wm_crawl_page", { text: text.slice(0, 500) });

  // Toggle switch near counter
  const toggle = page.locator(`text=${COUNTER}`).locator("..").locator('input[type="checkbox"], [role="switch"]').first();
  if (await toggle.count()) {
    const checked = await toggle.isChecked().catch(() => false);
    if (!checked) {
      await toggle.click({ force: true }).catch(() => {});
      await page.waitForTimeout(1000);
    }
    log("wm_crawl_toggle", { ok: true, wasChecked: checked });
  } else {
    const anySwitch = page.locator('[role="switch"], input[type="checkbox"]').first();
    if (await anySwitch.isVisible().catch(() => false)) {
      await anySwitch.click({ force: true }).catch(() => {});
      log("wm_crawl_toggle", { ok: true, reason: "clicked_first_switch" });
    } else {
      log("wm_crawl_toggle", { ok: false, reason: "no_switch", hint: "enable manually if not on" });
    }
  }
  await shot(page, "wm-crawl-after");
  return true;
}

async function metrikaConfirm(page) {
  await page.goto(`https://metrika.yandex.ru/settings?id=${COUNTER}&tab=settings`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForTimeout(3000);
  await shot(page, "metrika-settings");
  const confirm = page.getByRole("button", { name: /Подтвердить|Привязать к Вебмастеру|Привязать/i }).first();
  if (await confirm.isVisible().catch(() => false)) {
    await confirm.click();
    await page.waitForTimeout(2000);
    log("metrika_confirm", { ok: true });
  } else {
    // alternate path
    await page.goto(`https://metrika.yandex.ru/settings?id=${COUNTER}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(2000);
    const link = page.getByText(/Привязать к Вебмастеру|Вебмастер/i).first();
    if (await link.isVisible().catch(() => false)) {
      await link.click();
      await page.waitForTimeout(1500);
      const btn = page.getByRole("button", { name: /Подтвердить|Привязать/i }).first();
      if (await btn.isVisible().catch(() => false)) await btn.click();
      log("metrika_confirm", { ok: true, reason: "alt_path" });
    } else {
      log("metrika_confirm", {
        ok: false,
        reason: "no_confirm_button",
        text: (await bodyText(page, 600)).slice(0, 400),
      });
    }
  }
  await shot(page, "metrika-after");
}

async function vkPost(page) {
  await page.goto("https://vk.ru/zovus", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(3000);
  await shot(page, "vk-1");
  if (await page.getByRole("button", { name: /Sign in|Войти/i }).first().isVisible().catch(() => false)) {
    log("vk", { ok: false, reason: "login_required" });
    return;
  }
  const create = page.getByText(/Что у вас нового|What's new|Создать запись/i).first();
  if (await create.isVisible().catch(() => false)) await create.click();
  await page.waitForTimeout(1500);
  const editable = page.locator('[contenteditable="true"]').first();
  if (!(await editable.isVisible({ timeout: 8000 }).catch(() => false))) {
    log("vk", { ok: false, reason: "no_composer", shot: await shot(page, "vk-no-composer") });
    return;
  }
  await editable.click();
  await editable.fill(VK_TEXT);
  await shot(page, "vk-filled");
  const publish = page.getByRole("button", { name: /Опубликовать|Publish|Post/i }).first();
  if (!(await publish.isVisible().catch(() => false))) {
    log("vk", { ok: false, reason: "no_publish_btn" });
    return;
  }
  await publish.click();
  await page.waitForTimeout(4000);
  log("vk", { ok: true, shot: await shot(page, "vk-done") });
}

async function dzenPost(page) {
  await page.goto("https://dzen.ru/media/zen/login", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2500);
  await shot(page, "dzen-1");
  await page.goto("https://dzen.ru/media/zen/publications", { waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForTimeout(2500);
  await shot(page, "dzen-pubs");
  const create = page.getByRole("link", { name: /Написать|Создать|Новая/i }).or(page.getByText(/Написать|Создать статью/i)).first();
  if (!(await create.isVisible().catch(() => false))) {
    log("dzen", { ok: false, reason: "editor_unavailable" });
    return;
  }
  await create.click();
  await page.waitForTimeout(2500);
  const title = page.locator("input").first();
  if (await title.isVisible().catch(() => false)) {
    await title.fill("Telegram-бот Zovus — расклады Таро в мессенджере");
  }
  const body = page.locator('[contenteditable="true"]').first();
  if (await body.isVisible().catch(() => false)) {
    await body.fill(
      `Официальный Telegram-бот Zovus (@zovus_card_bot) — быстрый вход в те же практики, что и на сайте: три карты бесплатно, матрица судьбы, диалог с наставником.\n\nСсылка на бота: https://t.me/zovus_card_bot\nПодробнее: https://zovus.ru/telegram`
    );
  }
  await shot(page, "dzen-draft");
  const pub = page.getByRole("button", { name: /Опубликовать|Publish/i }).first();
  if (await pub.isVisible().catch(() => false)) {
    await pub.click();
    await page.waitForTimeout(3000);
    log("dzen", { ok: true, reason: "publish_clicked" });
  } else {
    log("dzen", { ok: false, reason: "draft_ready_manual_publish" });
  }
  await shot(page, "dzen-after");
}

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const context = browser.contexts()[0] || (await browser.newContext());
const page = context.pages()[0] || (await context.newPage());

try {
  const session = await ensureYandexSession(page);
  log("yandex_session", session);

  if (!session.loggedIn) {
    console.log("\n>>> LOGIN REQUIRED — waiting up to 45s…\n");
    await page.waitForTimeout(45000);
    const again = await ensureYandexSession(page);
    log("yandex_session_after_wait", again);
    if (!again.loggedIn) {
      // Continue anyway: user may already be on Webmaster tabs after manual login
      log("yandex_session", { warning: "profile_unclear_continuing" });
    }
  }

  await webmasterBind(page);
  await metrikaConfirm(page);
  await vkPost(page);
  await dzenPost(page);
} catch (e) {
  log("fatal", { error: String(e?.stack || e) });
} finally {
  writeFileSync(join(OUT, "result.json"), JSON.stringify(report, null, 2));
  console.log("\n=== RESULT ===");
  console.log(JSON.stringify(report, null, 2));
  // keep Chrome open for user
}
