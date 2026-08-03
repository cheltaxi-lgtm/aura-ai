#!/usr/bin/env node
/**
 * Configure Yandex Metrika + Webmaster for koplife.ru
 * Reuses logged-in Playwright profile from aura-ai (zovus setup).
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dir, "..", ".cursor", "yandex-koplife-setup");
const PROFILE =
  process.env.YANDEX_PW_PROFILE ||
  "C:\\Users\\gamer\\Projects\\aura-ai\\.cursor\\yandex360-setup\\pw-profile";
const SITE = "https://koplife.ru";
const COUNTER_HINT = "108436216";

mkdirSync(OUT, { recursive: true });

const log = [];
const push = (m) => {
  console.log(m);
  log.push(m);
};

async function snap(page, label) {
  await page.screenshot({ path: join(OUT, `${label}.png`), fullPage: true }).catch(() => {});
}

async function bodyText(page) {
  return page.locator("body").innerText().catch(() => "");
}

async function main() {
  if (!existsSync(PROFILE)) {
    throw new Error(`Playwright profile not found: ${PROFILE}`);
  }

  const context = await chromium.launchPersistentContext(PROFILE, {
    headless: false,
    viewport: { width: 1400, height: 900 },
    locale: "ru-RU",
    args: ["--disable-blink-features=AutomationControlled"],
  });
  const page = context.pages()[0] || (await context.newPage());
  const result = {
    metrika: {},
    webmaster: {},
  };

  // ---------- Metrika ----------
  push("=== Metrika list ===");
  await page.goto("https://metrika.yandex.ru/list", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(4000);
  await snap(page, "01-metrika-list");
  let text = await bodyText(page);
  if (/войти|логин|passport\.yandex/i.test(text) && /войдите|вход/i.test(text)) {
    push("NEED_LOGIN: Metrika — войдите в открывшемся окне, затем нажмите Enter в терминале");
    await new Promise((r) => process.stdin.once("data", r));
    await page.goto("https://metrika.yandex.ru/list", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);
    text = await bodyText(page);
  }

  const hasHint = text.includes(COUNTER_HINT) || text.includes("koplife");
  push(`list_has_counter_or_koplife=${hasHint}`);

  // Open counter if exists
  let counterId = COUNTER_HINT;
  const counterLink = page.locator(`a[href*="${COUNTER_HINT}"], a:has-text("${COUNTER_HINT}")`).first();
  if (await counterLink.count()) {
    await counterLink.click({ force: true });
    await page.waitForTimeout(4000);
  } else {
    // try search
    const search = page.locator('input[type="search"], input[placeholder*="Поиск"], input[placeholder*="поиск"]').first();
    if (await search.count()) {
      await search.fill("koplife");
      await page.waitForTimeout(2000);
      await snap(page, "02-metrika-search");
    }
    const koplifeRow = page.getByText(/koplife\.ru/i).first();
    if (await koplifeRow.count()) {
      await koplifeRow.click({ force: true });
      await page.waitForTimeout(4000);
    } else {
      // Create new counter
      push("Creating new Metrika counter for koplife.ru");
      const addBtn = page.getByRole("button", { name: /Добавить счётчик|Создать счётчик/i }).first();
      const addLink = page.getByRole("link", { name: /Добавить счётчик|Создать счётчик/i }).first();
      if (await addBtn.count()) await addBtn.click({ force: true });
      else if (await addLink.count()) await addLink.click({ force: true });
      else await page.goto("https://metrika.yandex.ru/add", { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(3000);
      await snap(page, "03-metrika-add");

      // Fill form fields
      const nameInput = page.locator('input[name="name"], input[placeholder*="Название"]').first();
      const siteInput = page
        .locator('input[name="site"], input[placeholder*="сайт"], input[placeholder*="Адрес"]')
        .first();
      if (await nameInput.count()) await nameInput.fill("koplife.ru");
      if (await siteInput.count()) await siteInput.fill("koplife.ru");

      // enable checkboxes if visible
      for (const label of [/Вебвизор/i, /Карта кликов/i, /Карта скроллинга/i, /Отслеживание хэша/i]) {
        const cb = page.getByText(label).first();
        if (await cb.count()) {
          await cb.click({ force: true }).catch(() => {});
        }
      }

      const create = page.getByRole("button", { name: /Создать|Добавить|Сохранить/i }).first();
      if (await create.count()) {
        await create.click({ force: true });
        await page.waitForTimeout(5000);
      }
      await snap(page, "04-metrika-created");
    }
  }

  // Detect counter id from URL
  const url = page.url();
  const idMatch = url.match(/[?&]id=(\d+)/) || url.match(/\/(\d{6,})(?:\/|$|\?)/);
  if (idMatch) counterId = idMatch[1];
  result.metrika.counterId = counterId;
  result.metrika.url = page.url();
  push(`counterId=${counterId} url=${page.url()}`);

  // Settings page
  await page.goto(`https://metrika.yandex.ru/management/settings?id=${counterId}`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForTimeout(4000);
  await snap(page, "05-metrika-settings");

  // Turn on key options if toggles present
  for (const label of [
    /Вебвизор/i,
    /Карта кликов/i,
    /Карта скроллинга/i,
    /Электронная коммерция/i,
    /Отслеживание хеша|хэша/i,
    /Точный показатель отказов/i,
  ]) {
    const row = page.getByText(label).first();
    if (await row.count()) {
      await row.click({ force: true }).catch(() => {});
      await page.waitForTimeout(400);
    }
  }
  const save = page.getByRole("button", { name: /Сохранить/i }).first();
  if (await save.count()) {
    await save.click({ force: true });
    await page.waitForTimeout(2000);
    push("metrika_settings_saved");
  }
  await snap(page, "06-metrika-settings-after");

  // Code snippet page — confirm filter matches
  await page.goto(`https://metrika.yandex.ru/management/code?id=${counterId}`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(3000);
  const codeText = await bodyText(page);
  result.metrika.codeHasWebvisor = /webvisor:\s*true/i.test(codeText) || /Вебвизор/i.test(codeText);
  await snap(page, "07-metrika-code");

  // ---------- Webmaster ----------
  push("=== Webmaster ===");
  await page.goto("https://webmaster.yandex.ru/sites/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(4000);
  await snap(page, "08-webmaster-sites");
  text = await bodyText(page);

  let verificationCode = null;
  if (/koplife\.ru/i.test(text)) {
    push("webmaster_site_exists");
    const siteLink = page.getByText(/koplife\.ru/i).first();
    if (await siteLink.count()) {
      await siteLink.click({ force: true });
      await page.waitForTimeout(4000);
    }
  } else {
    push("Adding site to Webmaster");
    const add = page.getByRole("button", { name: /Добавить/i }).first();
    const addLink = page.getByRole("link", { name: /Добавить/i }).first();
    if (await add.count()) await add.click({ force: true });
    else if (await addLink.count()) await addLink.click({ force: true });
    else await page.goto("https://webmaster.yandex.ru/site/add/", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);
    await snap(page, "09-webmaster-add");

    const urlInput = page.locator('input[type="url"], input[name="host"], input[placeholder*="http"], input').first();
    // Prefer dedicated field
    const fields = page.locator("input:visible");
    const count = await fields.count();
    for (let i = 0; i < Math.min(count, 6); i++) {
      const ph = ((await fields.nth(i).getAttribute("placeholder")) || "").toLowerCase();
      const name = ((await fields.nth(i).getAttribute("name")) || "").toLowerCase();
      if (ph.includes("http") || ph.includes("сайт") || name.includes("host") || name.includes("url")) {
        await fields.nth(i).fill(SITE);
        break;
      }
    }
    // fallback
    if (!(await bodyText(page)).includes("koplife")) {
      await page.keyboard.type(SITE);
    }
    const next = page.getByRole("button", { name: /Добавить|Продолжить|Далее/i }).first();
    if (await next.count()) await next.click({ force: true });
    await page.waitForTimeout(5000);
    await snap(page, "10-webmaster-added");
  }

  // Verification settings
  const hostEnc = encodeURIComponent("https://koplife.ru:443");
  await page.goto(`https://webmaster.yandex.ru/site/${hostEnc}/settings/verification/`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  }).catch(async () => {
    // try alternate host key formats
    await page.goto("https://webmaster.yandex.ru/sites/", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    const link = page.locator('a[href*="koplife"]').first();
    if (await link.count()) {
      await link.click({ force: true });
      await page.waitForTimeout(3000);
    }
  });
  await page.waitForTimeout(3000);
  await snap(page, "11-webmaster-verify");
  text = await bodyText(page);

  // Prefer meta tag method
  const metaMethod = page.getByText(/Метатег|мета.?тег|HTML.?файл/i).first();
  if (await metaMethod.count()) {
    await metaMethod.click({ force: true });
    await page.waitForTimeout(1500);
  }

  // Extract verification code from page / meta example
  const html = await page.content();
  const metaMatch =
    html.match(/yandex-verification["'\s]+content=["']([a-f0-9]+)["']/i) ||
    html.match(/content=["']([a-f0-9]{8,})["'][^>]*yandex-verification/i) ||
    text.match(/yandex-verification:\s*([a-f0-9]+)/i) ||
    text.match(/\b([a-f0-9]{16,})\b/);
  if (metaMatch) {
    verificationCode = metaMatch[1];
    push(`verificationCode=${verificationCode}`);
  } else {
    // copy from code block
    const code = page.locator("code, pre, .clipboard, [data-clipboard-text]").first();
    if (await code.count()) {
      const t = await code.innerText();
      const m = t.match(/content=["']([a-f0-9]+)["']/i) || t.match(/([a-f0-9]{16,})/);
      if (m) verificationCode = m[1];
    }
  }
  result.webmaster.verificationCode = verificationCode;
  result.webmaster.url = page.url();
  await snap(page, "12-webmaster-verify-code");

  // Try link Metrika in Webmaster settings
  try {
    await page.goto(`https://webmaster.yandex.ru/site/${hostEnc}/settings/`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForTimeout(2500);
    await snap(page, "13-webmaster-settings");
    const metrikaBind = page.getByText(/Метрик|привяз|счётчик/i).first();
    if (await metrikaBind.count()) {
      await metrikaBind.click({ force: true });
      await page.waitForTimeout(2000);
      const counterOpt = page.getByText(new RegExp(counterId)).first();
      if (await counterOpt.count()) {
        await counterOpt.click({ force: true });
        await page.waitForTimeout(1000);
        const saveBtn = page.getByRole("button", { name: /Сохранить|Привязать/i }).first();
        if (await saveBtn.count()) await saveBtn.click({ force: true });
        push("webmaster_metrika_linked");
      }
    }
  } catch (e) {
    push(`webmaster_link_skip: ${e.message}`);
  }

  // Sitemap
  try {
    await page.goto(`https://webmaster.yandex.ru/site/${hostEnc}/indexing/sitemap/`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForTimeout(3000);
    await snap(page, "14-webmaster-sitemap");
    const smInput = page.locator('input[type="url"], input[placeholder*="sitemap"], input').first();
    const addSm = page.getByRole("button", { name: /Добавить/i }).first();
    if (await smInput.count()) {
      await smInput.fill("https://koplife.ru/sitemap-index.xml");
      if (await addSm.count()) {
        await addSm.click({ force: true });
        await page.waitForTimeout(2000);
        push("sitemap_submitted");
      }
    }
  } catch (e) {
    push(`sitemap_skip: ${e.message}`);
  }

  writeFileSync(join(OUT, "result.json"), JSON.stringify({ result, log }, null, 2));
  writeFileSync(join(OUT, "log.txt"), log.join("\n"));
  push("DONE");
  console.log("\nRESULT:", JSON.stringify(result, null, 2));
  console.log(`Artifacts: ${OUT}`);

  // Keep browser open briefly for inspection
  await page.waitForTimeout(2000);
  await context.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
