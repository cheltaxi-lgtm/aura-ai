#!/usr/bin/env node
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { execFileSync } from "child_process";

const OUT = join(process.cwd(), ".cursor", "gsc-security-review");
mkdirSync(OUT, { recursive: true });
const sshKey = process.env.USERPROFILE + "\\.ssh\\aura_deploy_ed25519";
const known = process.env.USERPROFILE + "\\.ssh\\known_hosts_aura_beget";

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const context = browser.contexts()[0];
const page =
  context.pages().find((p) => p.url().includes("search.google")) || (await context.newPage());

await page.goto("https://search.google.com/search-console/welcome", {
  waitUntil: "domcontentloaded",
  timeout: 90000,
});
await page.waitForTimeout(2000);
await page.getByText(/Завершить процедуру подтверждения/i).first().click({ force: true });
await page.waitForTimeout(2000);
await page.getByText("https://zovus.ru/", { exact: true }).first().click({ force: true });
await page.waitForTimeout(4000);
const ok = page.getByRole("button", { name: /^ОК$|^OK$/i }).first();
if (await ok.count()) await ok.click({ force: true });
await page.waitForTimeout(800);

// Hook multiple download paths before click
await page.evaluate(() => {
  window.__captured = null;
  const readBlob = async (b) => {
    try {
      window.__captured = await b.text();
    } catch {}
  };
  const OrigBlob = window.Blob;
  window.Blob = class extends OrigBlob {
    constructor(parts, opts) {
      super(parts, opts);
      const s = (parts || []).map((p) => (typeof p === "string" ? p : "")).join("");
      if (/google-site-verification|a07e95/i.test(s)) window.__captured = s;
      else readBlob(this);
    }
  };
  const origCreate = URL.createObjectURL.bind(URL);
  URL.createObjectURL = (obj) => {
    if (obj && typeof obj.text === "function") readBlob(obj);
    return origCreate(obj);
  };
  const origOpen = window.open;
  window.open = function (url, ...rest) {
    if (typeof url === "string" && url.startsWith("data:")) {
      window.__captured = decodeURIComponent(url.split(",")[1] || "");
    }
    return origOpen.call(window, url, ...rest);
  };
  document.addEventListener(
    "click",
    (e) => {
      const a = e.target?.closest?.("a");
      if (a?.href?.startsWith("data:")) {
        window.__captured = decodeURIComponent(a.href.split(",")[1] || "");
      }
    },
    true
  );
});

// Click download control by role near filename
const dl = page.locator('[role="button"]').filter({ hasText: /googlea07e95e8199f7e09\.html/i }).first();
console.log("dl count", await dl.count());

const client = await context.newCDPSession(page);
await client.send("Browser.setDownloadBehavior", {
  behavior: "allowAndName",
  downloadPath: OUT,
  eventsEnabled: true,
});

let downloadFile = null;
client.on("Browser.downloadWillBegin", (e) => {
  console.log("downloadWillBegin", e);
  downloadFile = e;
});
client.on("Browser.downloadProgress", (e) => {
  console.log("downloadProgress", e.state, e.guid);
});

await Promise.race([
  page.waitForEvent("download", { timeout: 15000 }).then(async (d) => {
    const p = join(OUT, "from-playwright.html");
    await d.saveAs(p);
    console.log("playwright download", p, d.suggestedFilename());
    return p;
  }),
  dl.click({ force: true }).then(() => page.waitForTimeout(5000)),
]);

await page.waitForTimeout(2000);
const captured = await page.evaluate(() => window.__captured);
console.log("captured", JSON.stringify(captured));

// Fallback: try meta method content as file with newline variants later
let content = captured;
if (!content) {
  // Try reading any new html in OUT
  const { readdirSync } = await import("fs");
  const files = readdirSync(OUT).filter((f) => f.endsWith(".html") || f.includes("google"));
  console.log("out files", files);
}

if (content) {
  writeFileSync(join(OUT, "official.html"), content);
  writeFileSync(join(process.cwd(), "public", "googlea07e95e8199f7e09.html"), content);
  execFileSync(
    "ssh",
    [
      "-i",
      sshKey,
      "-o",
      `UserKnownHostsFile=${known}`,
      "-o",
      "StrictHostKeyChecking=yes",
      "root@217.12.37.32",
      `python3 - <<'PY'
from pathlib import Path
p=Path('/opt/aura-ai/public/googlea07e95e8199f7e09.html')
content=${JSON.stringify(content)}
p.write_bytes(content.encode('utf-8'))
print(p.read_bytes())
PY
curl -s https://zovus.ru/googlea07e95e8199f7e09.html | xxd | head`,
    ],
    { stdio: "inherit" }
  );
}

// Also patch meta into homepage via quick next rebuild of seo only - use sed on server source + build
const token = "2xfoyJJx5rzmo7m9RUmw07wh1Zh3YBveFi71f3aZAqw";
console.log(
  execFileSync(
    "ssh",
    [
      "-i",
      sshKey,
      "-o",
      `UserKnownHostsFile=${known}`,
      "-o",
      "StrictHostKeyChecking=yes",
      "root@217.12.37.32",
      `python3 - <<'PY'
from pathlib import Path
p=Path('/opt/aura-ai/src/lib/seo.ts')
t=p.read_text()
token='${token}'
if f'google: "{token}"' not in t:
    t=t.replace('yandex: "7902ba7dfdb76ac3",', f'yandex: "7902ba7dfdb76ac3",\\n      google: "{token}",')
    p.write_text(t)
    print('seo patched')
else:
    print('seo already')
PY
cd /opt/aura-ai && npm run build >/tmp/gsc-build.log 2>&1; tail -20 /tmp/gsc-build.log; systemctl restart aura-ai; sleep 5; curl -s https://zovus.ru/ | grep -o 'google-site-verification[^>]*' | head`,
    ],
    { encoding: "utf8" }
  )
);
console.log("DONE_CAPTURE");
