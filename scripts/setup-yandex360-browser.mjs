#!/usr/bin/env node
/**
 * Yandex 360 kopinfo.ru: DKIM, MX verify, create noreply@zovus.ru mailbox.
 * Profile: .cursor/yandex360-setup/pw-profile (manual login once).
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "fs";
import { randomBytes } from "crypto";
import { join } from "path";

const OUT = join(process.cwd(), ".cursor", "yandex360-setup");
const profileDir = join(OUT, "pw-profile");
mkdirSync(OUT, { recursive: true });

async function snap(page, label) {
  await page.screenshot({ path: join(OUT, `${label}.png`), fullPage: true });
}

async function enterKopinfo(page) {
  await page.goto("https://admin.yandex.ru/select-organization?uid=112696101", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(2000);
  const kop = page.getByText("kopinfo.ru").first();
  if (await kop.count()) {
    await kop.click({ force: true });
    await page.waitForTimeout(4000);
  }
  await page.keyboard.press("Escape");
}

async function clickFirst(page, locator, opts = {}) {
  const el = locator.first();
  if (!(await el.count())) return false;
  await el.click({ force: true, ...opts });
  await page.waitForTimeout(opts.wait ?? 2000);
  return true;
}

function parseDkim(txt) {
  const host =
    txt.match(/([a-z0-9-]+\._domainkey(?:\.zovus\.ru)?)/i)?.[1] ||
    "mail._domainkey.zovus.ru";
  const value = txt.match(/v=DKIM1[^;\n]+(?:;[^;\n]+)*/i)?.[0];
  return value ? { host, value } : null;
}

function randomPassword() {
  return randomBytes(12).toString("base64url").slice(0, 16);
}

async function userExists(page, email) {
  await page.goto("https://admin.yandex.ru/users", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  const search = page.locator('input[placeholder*="Поиск"], input[type="search"]').first();
  if (!(await search.count())) return false;
  await search.fill(email);
  await page.waitForTimeout(2500);
  const body = await page.locator("body").innerText();
  return body.toLowerCase().includes(email.split("@")[0].toLowerCase());
}

async function createMailbox(page, log, { login, lastName, firstName }) {
  const email = `${login}@zovus.ru`;
  if (await userExists(page, email)) {
    log.push(`exists:${email}`);
    return null;
  }

  await page.goto("https://admin.yandex.ru/users", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  await clickFirst(page, page.getByRole("button", { name: /^Добавить$/i }));
  await clickFirst(page, page.locator('[data-testid="dropdown-element-create"]'));
  await page.waitForTimeout(1500);

  const tariffModal = page.locator("div").filter({ hasText: "Вы добавляете сотрудников" }).first();
  if (await tariffModal.count()) {
    await tariffModal.getByRole("button", { name: /^Продолжить$/i }).click({ force: true });
    await page.waitForTimeout(3000);
    log.push(`tariff_continue:${login}`);
  }

  const panel = page.locator("div").filter({ hasText: "Новый сотрудник" }).first();
  await panel.getByLabel(/Фамилия/i).fill(lastName);
  await panel.getByLabel(/Имя/i).fill(firstName);
  await panel.getByLabel(/^Логин/i).fill(login);

  const kopSuffix = panel.getByText("@kopinfo.ru").first();
  if (await kopSuffix.count()) {
    await kopSuffix.click({ force: true });
    await page.waitForTimeout(800);
    const zovusOpt = page.getByText("@zovus.ru", { exact: true }).first();
    if (await zovusOpt.count()) {
      await zovusOpt.click({ force: true });
      log.push(`domain_switched:${login}`);
    }
  }

  const pwd = randomPassword();
  const pwdInputs = panel.locator('input[type="password"]');
  if ((await pwdInputs.count()) >= 2) {
    await pwdInputs.nth(0).fill(pwd);
    await pwdInputs.nth(1).fill(pwd);
  }
  writeFileSync(join(OUT, `${login}-password.txt`), pwd, "utf8");

  const cb = panel.locator('input[type="checkbox"]').first();
  if (await cb.count()) {
    if (await cb.isChecked()) await cb.uncheck({ force: true });
  }

  await panel.getByRole("button", { name: /^Добавить$/i }).click({ force: true });
  await page.waitForTimeout(6000);
  log.push(`created:${login}@zovus.ru`);
  await snap(page, `user-${login}-done`);
  return pwd;
}

async function main() {
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    viewport: { width: 1400, height: 900 },
    locale: "ru-RU",
  });
  const page = context.pages()[0] || (await context.newPage());
  const log = [];

  try {
    await enterKopinfo(page);

    // --- Domains: MX manual verify for zovus.ru ---
    await page.goto("https://admin.yandex.ru/domains", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);
    const zovusRow = page.locator("div, section, li").filter({ hasText: /^zovus\.ru/ }).first();
    if (await zovusRow.count()) {
      const mxManual = zovusRow.getByRole("button", { name: /Настроить вручную/i });
      if (await mxManual.count()) {
        await clickFirst(page, mxManual);
        log.push("mx_manual_opened");
        await snap(page, "mx-manual");
        await clickFirst(page, page.getByRole("button", { name: /Проверить/i }));
        log.push("mx_verify_clicked");
        await page.waitForTimeout(8000);
        await snap(page, "mx-after-verify");
      }
    }

    // --- DKIM for zovus.ru ---
    await page.goto("https://admin.yandex.ru/domains", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);
    const domainsBody = await page.locator("body").innerText();
    writeFileSync(join(OUT, "domains-status.txt"), domainsBody, "utf8");
    log.push(
      `domains:${domainsBody.includes("DKIM") ? "has_dkim" : "no_dkim"}:${domainsBody.includes("MX") ? "mentions_mx" : "no_mx"}`
    );
    await snap(page, "domains-current");

    const dkimBtn = page.getByText("Настроить DKIM", { exact: true }).first();
    if (await dkimBtn.count()) {
      await dkimBtn.click({ force: true });
      await page.waitForTimeout(3000);
      await snap(page, "dkim-page");
      const dkimBody = await page.locator("body").innerText();
      writeFileSync(join(OUT, "dkim-instructions.txt"), dkimBody, "utf8");
      const dkim = parseDkim(dkimBody);
      if (dkim) {
        writeFileSync(join(OUT, "dkim-record.json"), JSON.stringify(dkim, null, 2), "utf8");
        log.push(`dkim_parsed:${dkim.host}`);
      } else {
        log.push("dkim_not_parsed");
      }
      await clickFirst(page, page.getByRole("button", { name: /Проверить/i }));
      log.push("dkim_verify_clicked");
      await page.waitForTimeout(8000);
      await snap(page, "dkim-after-verify");
    } else {
      log.push("dkim_button_missing");
    }

    // --- Service mailboxes on zovus.ru ---
    const mailboxes = [
      { login: "noreply", lastName: "Noreply", firstName: "Zovus" },
      { login: "support", lastName: "Support", firstName: "Zovus" },
      { login: "admin", lastName: "Admin", firstName: "Zovus" },
      { login: "privacy", lastName: "Privacy", firstName: "Zovus" },
      { login: "claims", lastName: "Claims", firstName: "Zovus" },
    ];
    for (const m of mailboxes) {
      await createMailbox(page, log, m);
    }

    await page.goto("https://admin.yandex.ru/users", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    const search = page.locator('input[placeholder*="Поиск"], input[type="search"]').first();
    if (await search.count()) {
      await search.fill("noreply@zovus.ru");
      await page.waitForTimeout(3000);
    }
    const searchBody = await page.locator("body").innerText();
    const hasNoreply = /noreply@zovus\.ru/i.test(searchBody);
    log.push(`noreply_found:${hasNoreply}`);
    await snap(page, "users-noreply-search");

    console.log(JSON.stringify({ log, dkim: existsSync(join(OUT, "dkim-record.json")) }, null, 2));
  } finally {
    await context.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
