#!/usr/bin/env node
import { chromium } from "playwright";
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", ".cursor", "organic-finish");
const DOCS = join(dirname(fileURLToPath(import.meta.url)), "..", "docs", "yandex-audit");
mkdirSync(OUT, { recursive: true });

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page = browser.contexts()[0].pages()[0] || (await browser.contexts()[0].newPage());

await page.goto("https://dzen.ru/id/6a50b97e363bf24ef269684e", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(3000);

const dzen = await page.evaluate(() => {
  const links = [...document.querySelectorAll("a[href]")]
    .map((a) => ({ href: a.href, text: (a.textContent || "").trim().replace(/\s+/g, " ").slice(0, 120) }))
    .filter((x) => /Telegram-бот Zovus|zovus_card_bot|мессенджере/i.test(x.text) || /\/a\//.test(x.href));
  const unique = [];
  const seen = new Set();
  for (const l of links) {
    if (seen.has(l.href)) continue;
    seen.add(l.href);
    unique.push(l);
  }
  return {
    titleHit: /Telegram-бот Zovus/i.test(document.body.innerText),
    botHit: /zovus_card_bot/i.test(document.body.innerText),
    links: unique.slice(0, 15),
  };
});

await page.goto("https://vk.ru/wall-240408086_38", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);
const vk = {
  url: "https://vk.ru/wall-240408086_38",
  hasBot: /zovus_card_bot/i.test(await page.locator("body").innerText()),
};

const result = {
  at: new Date().toISOString(),
  vk,
  dzen,
  primaryDzenLink: dzen.links.find((l) => /Telegram-бот Zovus/i.test(l.text))?.href || dzen.links[0]?.href || null,
};

writeFileSync(join(OUT, "social-live.json"), JSON.stringify(result, null, 2));

// Update owner status doc if present
const statusPath = join(DOCS, "owner-login-status.md");
if (existsSync(statusPath)) {
  let md = readFileSync(statusPath, "utf8");
  const block = `

## Social posts (live)

- VK: ${vk.url} (бот @zovus_card_bot)
- Dzen: ${result.primaryDzenLink || "см. канал https://dzen.ru/id/6a50b97e363bf24ef269684e"} (статья про Telegram-бот)
- Updated: ${result.at}
`;
  if (!md.includes("## Social posts (live)")) {
    md += block;
  } else {
    md = md.replace(/## Social posts \(live\)[\s\S]*?(?=\n## |$)/, block.trim() + "\n");
  }
  writeFileSync(statusPath, md);
}

console.log(JSON.stringify(result, null, 2));
