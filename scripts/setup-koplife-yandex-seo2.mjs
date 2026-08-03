#!/usr/bin/env node
/**
 * Step 2: configure existing Metrika 108436216 + add koplife.ru to Webmaster.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const OUT = join(process.cwd(), ".cursor", "yandex-koplife-setup");
const PROFILE = join(process.cwd(), ".cursor", "yandex360-setup", "pw-profile");
const COUNTER = "108436216";
mkdirSync(OUT, { recursive: true });

const log = [];
const push = (m) => {
  console.log(m);
  log.push(String(m));
};

async function snap(page, label) {
  await page.screenshot({ path: join(OUT, `${label}.png`), fullPage: true }).catch(() => {});
}

async function clickText(page, re, wait = 1500) {
  const el = page.getByText(re).first();
  if (await el.count()) {
    await el.click({ force: true });
    await page.waitForTimeout(wait);
    return true;
  }
  return false;
}

async function main() {
  const context = await chromium.launchPersistentContext(PROFILE, {
    headless: false,
    viewport: { width: 1440, height: 960 },
    locale: "ru-RU",
    args: ["--disable-blink-features=AutomationControlled"],
  });
  const page = context.pages()[0] || (await context.newPage());
  const result = { counterId: COUNTER, verificationCode: null, steps: [] };

  // ===== Metrika settings =====
  push("open metrika settings");
  await page.goto(`https://metrika.yandex.ru/management/settings?id=${COUNTER}`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await page.waitForTimeout(5000);
  await snap(page, "20-metrika-settings");

  // If redirected to list, click settings gear for koplife
  if (!page.url().includes("settings")) {
    await page.goto("https://metrika.yandex.ru/list", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);
    const row = page.locator("tr, div").filter({ hasText: COUNTER }).first();
    const gear = row.locator('a[href*="settings"], button, a').filter({ has: page.locator("svg, .icon") }).first();
    // click counter name then settings
    await page.locator(`a[href*="id=${COUNTER}"]`).first().click({ force: true }).catch(() => {});
    await page.waitForTimeout(2000);
    await page.goto(`https://metrika.yandex.ru/management/settings?id=${COUNTER}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(4000);
    await snap(page, "21-metrika-settings-retry");
  }

  // Enable toggles: look for switch inputs near labels
  const labels = [
    "Вебвизор",
    "Карта кликов",
    "Карта скроллинга",
    "Электронная коммерция",
    "Отслеживание хеша",
    "Отслеживание хэша",
    "Точный показатель отказов",
    "Сбор данных для контентной аналитики",
  ];
  for (const label of labels) {
    const row = page.locator("label, div, span").filter({ hasText: new RegExp(`^${label}|${label}`) }).first();
    if (!(await row.count())) continue;
    // try nearby checkbox/switch
    const container = row.locator("xpath=ancestor::*[self::label or self::div][1]");
    const input = container.locator('input[type="checkbox"], [role="switch"]').first();
    if (await input.count()) {
      const checked = await input.isChecked().catch(() => null);
      if (checked === false) {
        await input.check({ force: true }).catch(async () => input.click({ force: true }));
        push(`enabled:${label}`);
      } else {
        push(`already:${label}`);
      }
    } else {
      await row.click({ force: true }).catch(() => {});
      push(`clicked:${label}`);
    }
    await page.waitForTimeout(300);
  }

  // Save
  const save = page.getByRole("button", { name: /Сохранить/i });
  if (await save.count()) {
    await save.first().click({ force: true });
    await page.waitForTimeout(2500);
    push("metrika_saved");
  }
  await snap(page, "22-metrika-saved");

  // Filters / mirrors — ensure only koplife
  await page.goto(`https://metrika.yandex.ru/management/filters?id=${COUNTER}`, {
    waitUntil: "domcontentloaded",
  }).catch(() => {});
  await page.waitForTimeout(2500);
  await snap(page, "23-metrika-filters");

  // Code page with options
  await page.goto(`https://metrika.yandex.ru/management/code?id=${COUNTER}`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(3000);
  // check option checkboxes on code page
  for (const t of [/Вебвизор/i, /карта кликов/i, /электронной коммерции|ecommerce/i, /хеша|хэша/i, /отказов/i]) {
    const lab = page.getByText(t).first();
    if (await lab.count()) {
      await lab.click({ force: true }).catch(() => {});
      push(`code_opt:${t}`);
    }
  }
  await snap(page, "24-metrika-code");
  const codeHtml = await page.content();
  writeFileSync(join(OUT, "metrika-code.html"), codeHtml);

  // ===== Webmaster add site =====
  push("webmaster add");
  await page.goto("https://webmaster.yandex.ru/sites/", { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(4000);
  await snap(page, "30-wm-sites");

  // Use find/add field
  const findAdd = page.getByPlaceholder(/Найти или добавить|добавить сайт|http/i).first();
  if (await findAdd.count()) {
    await findAdd.fill("https://koplife.ru");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(3000);
  } else {
    await page.getByRole("button", { name: /Добавить/i }).first().click({ force: true }).catch(() => {});
    await page.waitForTimeout(2000);
  }
  await snap(page, "31-wm-after-type");

  // Click + Добавить if still on list
  if ((await page.locator("body").innerText()).includes("zovus.ru") && !(await page.locator("body").innerText()).match(/koplife/i)) {
    await page.getByRole("button", { name: /^\+?\s*Добавить$/i }).first().click({ force: true }).catch(() => {});
    await page.waitForTimeout(2000);
    const inp = page.locator("input:visible").filter({ hasNot: page.locator('[disabled]') });
    const n = await inp.count();
    for (let i = 0; i < n; i++) {
      const el = inp.nth(i);
      const box = await el.boundingBox();
      if (!box || box.width < 100) continue;
      await el.fill("https://koplife.ru");
      push("filled_add_input");
      break;
    }
    await page.getByRole("button", { name: /Добавить|Продолжить/i }).last().click({ force: true }).catch(() => {});
    await page.waitForTimeout(5000);
  }
  await snap(page, "32-wm-added-or-confirm");

  // Navigate via sites list click
  await page.goto("https://webmaster.yandex.ru/sites/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  const siteCard = page.getByText(/koplife\.ru/i).first();
  if (await siteCard.count()) {
    await siteCard.click({ force: true });
    await page.waitForTimeout(5000);
    push(`wm_site_url=${page.url()}`);
  } else {
    push("wm_site_not_in_list_yet");
  }
  await snap(page, "33-wm-site");
  result.wmSiteUrl = page.url();

  // Find verification in sidebar / settings
  const verifyLink = page.locator('a[href*="verification"], a[href*="confirm"]').first();
  if (await verifyLink.count()) {
    await verifyLink.click({ force: true });
    await page.waitForTimeout(3000);
  } else {
    await clickText(page, /Права доступа|Подтверждение|Настройки сайта/i, 2000);
    await clickText(page, /Подтверд|Метатег|мета-тег/i, 2000);
  }
  await snap(page, "34-wm-verify");

  // Prefer meta tag tab
  await clickText(page, /Метатег|Meta/i, 1500);
  await snap(page, "35-wm-meta");

  const html = await page.content();
  const text = await page.locator("body").innerText();
  writeFileSync(join(OUT, "wm-verify.html"), html);
  writeFileSync(join(OUT, "wm-verify.txt"), text);

  const patterns = [
    /name=["']yandex-verification["']\s+content=["']([a-f0-9]+)["']/i,
    /content=["']([a-f0-9]+)["']\s+name=["']yandex-verification["']/i,
    /yandex-verification["'\s:]+([a-f0-9]{8,})/i,
    /content=["']([a-f0-9]{16})["']/,
  ];
  for (const p of patterns) {
    const m = html.match(p) || text.match(p);
    if (m) {
      result.verificationCode = m[1];
      push(`verificationCode=${m[1]}`);
      break;
    }
  }

  // Also check data attributes
  if (!result.verificationCode) {
    const nodes = page.locator("[data-clipboard-text], code, pre, textarea");
    const c = await nodes.count();
    for (let i = 0; i < c; i++) {
      const t =
        (await nodes.nth(i).getAttribute("data-clipboard-text").catch(() => null)) ||
        (await nodes.nth(i).innerText().catch(() => ""));
      const m = String(t).match(/([a-f0-9]{16,})/i);
      if (m) {
        result.verificationCode = m[1];
        push(`verificationCode_from_node=${m[1]}`);
        break;
      }
    }
  }

  writeFileSync(join(OUT, "result2.json"), JSON.stringify({ result, log }, null, 2));
  writeFileSync(join(OUT, "log2.txt"), log.join("\n"));
  console.log("RESULT2", JSON.stringify(result, null, 2));

  await page.waitForTimeout(1500);
  await context.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
