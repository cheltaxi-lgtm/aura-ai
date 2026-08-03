#!/usr/bin/env node
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const OUT = join(process.cwd(), ".cursor", "yandex-koplife-setup");
const PROFILE = join(process.cwd(), ".cursor", "yandex360-setup", "pw-profile");
mkdirSync(OUT, { recursive: true });
const snap = (p, n) => p.screenshot({ path: join(OUT, `${n}.png`), fullPage: true }).catch(() => {});

async function main() {
  const context = await chromium.launchPersistentContext(PROFILE, {
    headless: false,
    viewport: { width: 1440, height: 960 },
    locale: "ru-RU",
    slowMo: 80,
  });
  const page = context.pages()[0] || (await context.newPage());

  await page.goto("https://webmaster.yandex.ru/sites/", { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(5000);

  // Dump button-like elements for debugging
  const buttons = await page.evaluate(() => {
    return [...document.querySelectorAll("button, a, [role='button']")]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.top < 900;
      })
      .slice(0, 80)
      .map((el) => ({
        tag: el.tagName,
        text: (el.innerText || "").trim().slice(0, 60),
        aria: el.getAttribute("aria-label"),
        title: el.getAttribute("title"),
        cls: (el.className || "").toString().slice(0, 80),
        x: Math.round(el.getBoundingClientRect().x),
        y: Math.round(el.getBoundingClientRect().y),
      }));
  });
  writeFileSync(join(OUT, "wm-buttons.json"), JSON.stringify(buttons, null, 2));
  console.log("buttons", buttons.filter((b) => /добав|\+/i.test(b.text + b.aria + b.title)).slice(0, 20));

  // Type into left site selector
  const leftInputs = await page.evaluate(() => {
    return [...document.querySelectorAll("input")].map((el, i) => {
      const r = el.getBoundingClientRect();
      return { i, x: r.x, y: r.y, w: r.width, ph: el.placeholder, val: el.value };
    });
  });
  writeFileSync(join(OUT, "wm-inputs.json"), JSON.stringify(leftInputs, null, 2));
  console.log("inputs", leftInputs);

  // Prefer input with x < 320 (sidebar)
  const side = leftInputs.find((x) => x.x < 320 && x.w > 80) || leftInputs[0];
  if (side) {
    const inp = page.locator("input").nth(side.i);
    await inp.click({ force: true });
    await inp.fill("https://koplife.ru");
    await page.waitForTimeout(1000);
  }
  await snap(page, "70-typed");

  // Click + near sidebar (x < 320)
  const plusBtn = buttons.find(
    (b) => b.x < 360 && (b.text === "+" || b.text.includes("+") || /добавить/i.test(b.aria || "")),
  );
  if (plusBtn) {
    console.log("click plus", plusBtn);
    await page.mouse.click(plusBtn.x + 10, plusBtn.y + 10);
  } else {
    // click main Добавить (orange)
    const mainAdd = buttons.find((b) => /добавить/i.test(b.text) && b.x > 400);
    if (mainAdd) {
      console.log("click mainAdd", mainAdd);
      await page.mouse.click(mainAdd.x + 20, mainAdd.y + 10);
    }
  }
  await page.waitForTimeout(4000);
  await snap(page, "71-after-plus");
  console.log("url1", page.url());

  // If dialog appeared, confirm
  const confirm = page.getByRole("button", { name: /Добавить|Продолжить|Подтвердить|Далее/i });
  if (await confirm.count()) {
    // ensure URL field
    const dlgInput = page.locator("[role='dialog'] input, .modal input, form input").first();
    if (await dlgInput.count()) {
      await dlgInput.fill("https://koplife.ru");
    }
    await confirm.last().click({ force: true });
    await page.waitForTimeout(6000);
  }

  // Also try pressing Enter after typing in sidebar
  if (page.url().includes("/sites")) {
    if (side) {
      await page.locator("input").nth(side.i).click();
      await page.keyboard.press("Enter");
      await page.waitForTimeout(4000);
    }
  }

  await snap(page, "72-final");
  console.log("url2", page.url());
  const html = await page.content();
  const text = await page.locator("body").innerText();
  writeFileSync(join(OUT, "wm72.txt"), text);
  writeFileSync(join(OUT, "wm72.html"), html);

  const m =
    html.match(/yandex-verification["'\s]+content=["']([a-f0-9]+)["']/i) ||
    text.match(/content=["']([a-f0-9]+)["']/i) ||
    text.match(/yandex-verification:\s*([a-f0-9]+)/i);
  const hexes = [...new Set((html + text).match(/\b[a-f0-9]{16}\b/gi) || [])];
  const out = { url: page.url(), code: m?.[1] || null, hexes, hasKoplife: /koplife/i.test(text) };
  writeFileSync(join(OUT, "webmaster-result2.json"), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));

  // Keep open a bit if verification UI shown
  if (out.code || /подтверд/i.test(text)) {
    console.log("VERIFICATION_UI_READY");
  }
  await context.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
