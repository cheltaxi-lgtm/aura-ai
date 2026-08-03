#!/usr/bin/env node
/**
 * Robust UI walk: Metrika counter gear → settings; Webmaster + → verify meta.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";
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
const snap = async (page, label) =>
  page.screenshot({ path: join(OUT, `${label}.png`), fullPage: true }).catch(() => {});

async function main() {
  const context = await chromium.launchPersistentContext(PROFILE, {
    headless: false,
    viewport: { width: 1440, height: 960 },
    locale: "ru-RU",
    args: ["--disable-blink-features=AutomationControlled"],
  });
  const page = context.pages()[0] || (await context.newPage());
  const result = { counterId: COUNTER, verificationCode: null };

  // Close chat widgets if any
  page.on("dialog", (d) => d.dismiss().catch(() => {}));

  // ===== Metrika via list gear =====
  await page.goto("https://metrika.yandex.ru/list", { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(4000);
  await snap(page, "40-list");

  // Find koplife row and open settings (gear)
  const row = page.locator("*").filter({ hasText: COUNTER }).filter({ hasText: /koplife/i }).first();
  // More reliable: locate link with counter id then sibling settings
  const settingsLinks = page.locator(
    `a[href*="id=${COUNTER}"][href*="settings"], a[href*="settings"][href*="${COUNTER}"], a[href*="/management/"][href*="${COUNTER}"]`,
  );
  if (await settingsLinks.count()) {
    await settingsLinks.first().click({ force: true });
    push(`clicked_settings_href=${await settingsLinks.first().getAttribute("href")}`);
  } else {
    // click gear near counter — often title="Настройки"
    const gear = page.locator(`[title*="Настрой"], [aria-label*="Настрой"], a[href*="settings"]`).filter({
      has: page.locator(`xpath=ancestor::*[contains(., '${COUNTER}')]`),
    });
    // simpler: all settings icons, pick one near koplife text
    const koplifeCell = page.getByText("koplife.ru", { exact: false }).first();
    await koplifeCell.scrollIntoViewIfNeeded().catch(() => {});
    const near = koplifeCell.locator("xpath=ancestor::tr[1]|ancestor::div[contains(@class,'counter')][1]");
    const gear2 = near.locator('a[href*="setting"], button[title*="Настрой"], a[title*="Настрой"]').first();
    if (await gear2.count()) {
      await gear2.click({ force: true });
      push("clicked_row_gear");
    } else {
      // open counter dashboard then navigate settings from menu
      await page.locator(`a[href*="${COUNTER}"]`).first().click({ force: true });
      await page.waitForTimeout(4000);
      await snap(page, "41-counter-dash");
      push(`dash_url=${page.url()}`);
      // sidebar settings
      const set = page.getByRole("link", { name: /Настройки/i }).first();
      if (await set.count()) await set.click({ force: true });
      else {
        // try common new UI path
        await page.goto(`https://metrika.yandex.ru/${COUNTER}`, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(3000);
        await page.getByText(/Настройки/i).first().click({ force: true }).catch(() => {});
      }
    }
  }
  await page.waitForTimeout(4000);
  push(`metrika_url=${page.url()}`);
  await snap(page, "42-metrika-settings-ui");
  writeFileSync(join(OUT, "metrika-settings-url.txt"), page.url());

  // Toggle switches on whatever settings page we landed
  const switchLabels = [
    /Вебвизор/i,
    /Карта кликов/i,
    /Карта скроллинга/i,
    /Электронная коммерция/i,
    /Отслеживание хеша|хэша/i,
    /Точный показатель отказов/i,
    /Контентная аналитика/i,
  ];
  for (const re of switchLabels) {
    const label = page.getByText(re).first();
    if (!(await label.count())) continue;
    const box = await label.boundingBox();
    if (!box) continue;
    // click to the right of label where switch usually is
    await page.mouse.click(box.x + box.width + 40, box.y + box.height / 2);
    push(`toggle_attempt:${re}`);
    await page.waitForTimeout(400);
  }
  const saveBtn = page.getByRole("button", { name: /^Сохранить$/i });
  if (await saveBtn.count()) {
    await saveBtn.first().click({ force: true });
    await page.waitForTimeout(2000);
    push("saved_metrika");
  }
  await snap(page, "43-metrika-after-save");

  // Also open "код счётчика" if in menu
  const codeLink = page.getByRole("link", { name: /Код счётчика|код счетчика/i }).first();
  if (await codeLink.count()) {
    await codeLink.click({ force: true });
    await page.waitForTimeout(2500);
    await snap(page, "44-code");
  }

  // ===== Webmaster =====
  await page.goto("https://webmaster.yandex.ru/sites/", { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(3500);
  await snap(page, "50-wm");

  // Sidebar site selector input + red plus
  const sideInput = page.locator('aside input, [class*="sidebar"] input, input[placeholder*="сайт"]').first();
  if (await sideInput.count()) {
    await sideInput.click({ force: true });
    await sideInput.fill("https://koplife.ru");
    await page.waitForTimeout(800);
  }
  // Red + next to selector
  const plus = page.locator('aside button, [class*="sidebar"] button').filter({ hasText: /^\+$|^＋$/ }).first();
  if (await plus.count()) {
    await plus.click({ force: true });
    push("clicked_sidebar_plus");
  } else {
    // main + Добавить
    await page.getByRole("button", { name: /Добавить/i }).first().click({ force: true });
    push("clicked_main_add");
  }
  await page.waitForTimeout(4000);
  await snap(page, "51-wm-add-dialog");

  // Fill URL in dialog if needed
  const dialogInputs = page.locator('[role="dialog"] input:visible, .modal input:visible, input:visible');
  const dic = await dialogInputs.count();
  for (let i = 0; i < dic; i++) {
    const el = dialogInputs.nth(i);
    const disabled = await el.isDisabled().catch(() => true);
    if (disabled) continue;
    const val = await el.inputValue().catch(() => "");
    if (!val || !val.includes("koplife")) {
      await el.fill("https://koplife.ru").catch(() => {});
    }
  }
  await page.getByRole("button", { name: /Добавить|Продолжить|Далее/i }).last().click({ force: true }).catch(() => {});
  await page.waitForTimeout(6000);
  await snap(page, "52-wm-after-add");
  push(`wm_url=${page.url()}`);
  writeFileSync(join(OUT, "wm-url.txt"), page.url() + "\n" + (await page.locator("body").innerText().catch(() => "")));

  // Wait for verification UI
  await page.waitForTimeout(2000);
  // Dismiss chat widget overlay
  await page.locator(".ya-chat-new-window__button").click({ force: true }).catch(() => {});
  await page.keyboard.press("Escape");

  // Click meta tag method
  const metaTab = page.getByRole("tab", { name: /Метатег|Meta/i }).or(page.getByText(/Метатег/i));
  if (await metaTab.count()) {
    await metaTab.first().click({ force: true });
    await page.waitForTimeout(1500);
  }
  await snap(page, "53-wm-verify");

  const html = await page.content();
  const text = await page.locator("body").innerText();
  writeFileSync(join(OUT, "wm53.html"), html);
  writeFileSync(join(OUT, "wm53.txt"), text);

  const m =
    html.match(/yandex-verification["'\s]+content=["']([a-f0-9]+)["']/i) ||
    html.match(/content=["']([a-f0-9]+)["'][^>]*yandex-verification/i) ||
    text.match(/content=["']([a-f0-9]+)["']/i) ||
    text.match(/\b([a-f0-9]{16})\b/);
  if (m) {
    result.verificationCode = m[1];
    push(`CODE=${m[1]}`);
  }

  // Collect all 16+ hex strings as candidates
  const hexes = [...new Set((html + "\n" + text).match(/[a-f0-9]{16,32}/gi) || [])];
  result.hexCandidates = hexes.slice(0, 20);
  push(`hexCandidates=${hexes.slice(0, 10).join(",")}`);

  writeFileSync(join(OUT, "result3.json"), JSON.stringify({ result, log }, null, 2));
  console.log(JSON.stringify(result, null, 2));
  await page.waitForTimeout(1000);
  await context.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
