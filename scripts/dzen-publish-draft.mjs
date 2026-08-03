#!/usr/bin/env node
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", ".cursor", "organic-finish");
mkdirSync(OUT, { recursive: true });

async function shot(page, name) {
  const p = join(OUT, `${name}.png`);
  await page.screenshot({ path: p, timeout: 15000 }).catch((e) => console.log("shot fail", name, e.message));
  return p;
}

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page = browser.contexts()[0].pages()[0] || (await browser.contexts()[0].newPage());

// Open drafts
await page.goto(
  "https://dzen.ru/profile/editor/id/6a50b97e363bf24ef269684e/publications?state=draft",
  { waitUntil: "domcontentloaded", timeout: 60000 },
);
await page.waitForTimeout(2500);
await shot(page, "dzen-drafts1");

// Click draft with our title
const draftRow = page.getByText(/Telegram-бот Zovus/i).first();
console.log("draft visible", await draftRow.isVisible().catch(() => false));
if (await draftRow.isVisible().catch(() => false)) {
  await draftRow.click();
  await page.waitForTimeout(3000);
}
console.log("after draft click", page.url());
await shot(page, "dzen-drafts2");

// If still on list, open known edit URL
if (!/edit/i.test(page.url())) {
  await page.goto(
    "https://dzen.ru/profile/editor/id/6a50b97e363bf24ef269684e/6a6f13aeaed80159d0ebc649/edit",
    { waitUntil: "domcontentloaded" },
  );
  await page.waitForTimeout(2500);
}

// Close overlays
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
await page.evaluate(() => {
  document.querySelectorAll(".ReactModalPortal").forEach((p) => {
    if (/help-popup|onboarding|NEW/i.test(p.innerHTML)) p.remove();
  });
});

// Dump all buttons with Опубликовать / Далее
const btns = await page.evaluate(() =>
  [...document.querySelectorAll("button, [role='button'], a")]
    .map((b) => {
      const r = b.getBoundingClientRect();
      return {
        text: (b.textContent || "").trim().replace(/\s+/g, " ").slice(0, 60),
        aria: b.getAttribute("aria-label"),
        disabled: !!b.disabled,
        x: Math.round(r.x),
        y: Math.round(r.y),
        w: Math.round(r.width),
        h: Math.round(r.height),
        cls: (b.className || "").toString().slice(0, 100),
      };
    })
    .filter((b) => b.w > 5 && b.h > 5 && /опублик|далее|продолж|обложк|добавить/i.test(`${b.text} ${b.aria}`)),
);
console.log("action buttons", btns);
writeFileSync(join(OUT, "dzen-draft-btns.json"), JSON.stringify(btns, null, 2));
await shot(page, "dzen-drafts3");

// Click publish
const pubBtn = page.getByRole("button", { name: /Опубликовать/i }).first();
if (await pubBtn.isVisible().catch(() => false)) {
  await pubBtn.click({ force: true });
  console.log("clicked publish");
  await page.waitForTimeout(2000);
  await shot(page, "dzen-drafts4");
}

// Wait for modal - including portals that don't use ReactModal__Content
await page.waitForTimeout(1000);
const portalInfo = await page.evaluate(() => {
  const portals = [...document.querySelectorAll(".ReactModalPortal, [class*='modal'], [class*='Modal']")];
  return portals.map((p) => ({
    cls: (p.className || "").toString().slice(0, 80),
    text: (p.innerText || "").slice(0, 400),
    buttons: [...p.querySelectorAll("button")].map((b) => (b.textContent || "").trim()).filter(Boolean),
  }));
});
console.log("portals", JSON.stringify(portalInfo, null, 2));
writeFileSync(join(OUT, "dzen-portals.json"), JSON.stringify(portalInfo, null, 2));

// Click Опубликовать in any portal
const confirmed = await page.evaluate(() => {
  const candidates = [...document.querySelectorAll("button")].filter((b) => {
    const t = (b.textContent || "").trim();
    const r = b.getBoundingClientRect();
    return t === "Опубликовать" && r.width > 40 && r.y > 200; // prefer bottom modal button
  });
  // prefer the one inside publication modal (black bottom)
  const btn = candidates.sort((a, b) => b.getBoundingClientRect().y - a.getBoundingClientRect().y)[0];
  if (!btn) return { ok: false };
  btn.click();
  return { ok: true, text: btn.textContent, y: btn.getBoundingClientRect().y };
});
console.log("confirm", confirmed);
await page.waitForTimeout(6000);
await shot(page, "dzen-drafts5");

// Maybe cover required — look for error
const body = await page.locator("body").innerText();
const needsCover = /обложк/i.test(body) && /обязательн|добавьте|нужн/i.test(body);

// Check result
await page.goto("https://dzen.ru/profile/editor/id/6a50b97e363bf24ef269684e/publications", {
  waitUntil: "domcontentloaded",
});
await page.waitForTimeout(3000);
const pubs = await page.locator("body").innerText();
const published = /Telegram-бот Zovus/i.test(pubs) && !/Черновики1/i.test(pubs.replace(/\s+/g, ""));

// Count draft badge
const draftCount = (pubs.match(/Черновики(\d+)/) || [])[1] || null;
const publishedCount = (pubs.match(/Опубликованные(\d+)/) || [])[1] || null;

await shot(page, "dzen-drafts6");

// Channel check
await page.goto("https://dzen.ru/id/6a50b97e363bf24ef269684e", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
const ch = await page.locator("body").innerText();
const onChannel = /Telegram-бот Zovus/i.test(ch);
const link = await page.evaluate(() => {
  const a = [...document.querySelectorAll("a")].find((el) => /Telegram-бот Zovus/i.test(el.textContent || ""));
  return a?.href || null;
});
await shot(page, "dzen-drafts7");

const result = {
  confirmed,
  needsCover,
  published,
  draftCount,
  publishedCount,
  onChannel,
  link,
  bodyHint: body.includes("Опубликовать") ? "had_publish" : "no",
};
writeFileSync(join(OUT, "post-result12.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
process.exit(onChannel || published ? 0 : 1);
