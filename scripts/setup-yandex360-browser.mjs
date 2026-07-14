#!/usr/bin/env node
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const OUT = join(process.cwd(), ".cursor", "yandex360-setup");
const profileDir = join(OUT, "pw-profile");
mkdirSync(OUT, { recursive: true });

async function snap(page, label) {
  await page.screenshot({ path: join(OUT, `${label}.png`), fullPage: true });
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
    await page.goto("https://admin.yandex.ru/", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);

    if (page.url().includes("select-organization")) {
      const kop = page.getByText("kopinfo.ru").first();
      if (await kop.count()) {
        await kop.click();
        await page.waitForTimeout(4000);
        log.push(`after_kop:${page.url()}`);
        await snap(page, "kop-org");
      }
    }

    for (const path of ["/domains", "/users", "/"]) {
      await page.goto(`https://admin.yandex.ru${path}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(3000);
      const text = (await page.locator("body").innerText()).toLowerCase();
      log.push({ path, url: page.url(), hasZovus: text.includes("zovus"), snippet: text.slice(0, 200) });
      await snap(page, `kop-${path.replace(/\//g, "_") || "home"}`);
      if (!page.url().includes("master-registration") && !page.url().includes("select-organization")) {
        log.push("entered_admin");
        break;
      }
    }

    // Create Yandex app password for cheldriver SMTP (interim)
    await page.goto("https://id.yandex.ru/security/app-passwords", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    const createSection = page.getByText("Создать пароль приложения");
    if (await createSection.count()) {
      const mailLine = page.locator("text=Почта").first();
      await mailLine.scrollIntoViewIfNeeded();
      const row = mailLine.locator("xpath=ancestor::div[contains(@class,'')][1]");
      const buttons = page.locator("button");
      for (let i = 0; i < await buttons.count(); i++) {
        const b = buttons.nth(i);
        const t = ((await b.innerText().catch(() => "")) || "").trim();
        if (t === "+" || t.includes("Создать")) {
          // skip
        }
      }
      // Use link 'Создать пароль' near Почта
      const createMail = page.locator("div").filter({ hasText: /^Почта/ }).getByRole("button").first();
      if (await createMail.count()) {
        await createMail.click();
      } else {
        await page.getByRole("button").filter({ hasText: "+" }).first().click().catch(() => {});
      }
      await page.waitForTimeout(2000);
      await page.getByText("Почта", { exact: true }).click().catch(() => {});
      await page.waitForTimeout(1000);
      const name = page.locator('input[placeholder*="назван"], input[type="text"]').first();
      if (await name.count()) await name.fill("ZovusProd");
      await page.getByRole("button", { name: /Создать|Далее|Готово/i }).first().click().catch(() => {});
      await page.waitForTimeout(4000);
      await snap(page, "new-app-password");
      const body = await page.locator("body").innerText();
      const lines = body.split("\n").map((l) => l.trim()).filter(Boolean);
      const pwd = lines.find((l) => /^[a-z0-9]{12,20}$/i.test(l));
      if (pwd) {
        writeFileSync(join(OUT, "smtp-app-password.txt"), pwd, "utf8");
        log.push("saved_app_password");
      }
    }

    const pwdFile = join(OUT, "smtp-app-password.txt");
    if (existsSync(pwdFile)) {
      log.push("password_file_exists");
    }

    console.log(JSON.stringify({ log }, null, 2));
  } finally {
    await context.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
