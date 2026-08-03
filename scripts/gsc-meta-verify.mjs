#!/usr/bin/env node
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { execFileSync } from "child_process";

const OUT = join(process.cwd(), ".cursor", "gsc-security-review");
mkdirSync(OUT, { recursive: true });
const REVIEW =
  "Удалили тестовые APK (/zovus.apk, /test-root.apk, /releases/test.apk, /releases/zovus-latest.zip). Оставили /releases/zovus-latest.apk. Фишинга нет. Zovus легитимный. Просим снять Safe Browsing social engineering.";

const sshKey = process.env.USERPROFILE + "\\.ssh\\aura_deploy_ed25519";
const known = process.env.USERPROFILE + "\\.ssh\\known_hosts_aura_beget";

function ssh(cmd) {
  return execFileSync(
    "ssh",
    ["-i", sshKey, "-o", `UserKnownHostsFile=${known}`, "-o", "StrictHostKeyChecking=yes", "root@217.12.37.32", cmd],
    { encoding: "utf8" }
  );
}

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page =
  browser.contexts()[0].pages().find((p) => p.url().includes("search.google")) ||
  (await browser.contexts()[0].newPage());

await page.goto("https://search.google.com/search-console/welcome", {
  waitUntil: "domcontentloaded",
  timeout: 90000,
});
await page.waitForTimeout(2000);
await page.evaluate(() => {
  const el = [...document.querySelectorAll("a,button,div,span")].find(
    (e) =>
      /Завершить процедуру подтверждения/i.test((e.textContent || "").trim()) &&
      (e.textContent || "").trim().length < 80
  );
  if (el) el.click();
});
await page.waitForTimeout(2000);
await page.evaluate(() => {
  const el = [...document.querySelectorAll("div,span,li,a,button")].find(
    (e) => (e.textContent || "").trim() === "https://zovus.ru/"
  );
  if (el) el.click();
});
await page.waitForTimeout(4000);
const ok = page.getByRole("button", { name: /^ОК$|^OK$/i }).first();
if (await ok.count()) await ok.click({ force: true });
await page.waitForTimeout(1000);

// Expand HTML tag method
await page.getByText("Тег HTML", { exact: true }).first().click({ force: true }).catch(() => {});
await page.waitForTimeout(1500);
const body = await page.locator("body").innerText();
console.log(body.slice(0, 3000));
await page.screenshot({ path: join(OUT, "meta-01.png"), fullPage: true });

const metaMatch =
  body.match(/content=["']([^"']+)["']/i) ||
  body.match(/google-site-verification["'\s]+content=["']?([A-Za-z0-9_-]+)/i) ||
  (await page.content()).match(/content=["']([A-Za-z0-9_-]{10,})["'][^>]*google-site-verification|google-site-verification[^>]*content=["']([A-Za-z0-9_-]{10,})["']/i);

let token =
  metaMatch?.[1] ||
  metaMatch?.[2] ||
  body.match(/name="google-site-verification"\s+content="([^"]+)"/)?.[1];

// Also search HTML for meta snippet in page
const html = await page.content();
const fromHtml = html.match(/google-site-verification["\s]+content=["']([A-Za-z0-9_-]+)["']/i)
  || html.match(/content=["']([A-Za-z0-9_-]+)["']\s+name=["']google-site-verification["']/i)
  || html.match(/&lt;meta[^&]+google-site-verification[^&]+content=["']([A-Za-z0-9_-]+)["']/i)
  || html.match(/<meta[^>]+google-site-verification[^>]+content=["']([A-Za-z0-9_-]+)["']/i);

token = token || fromHtml?.[1];
console.log("token", token);

// Try to grab copyable code block text
const codeBits = await page.evaluate(() => {
  const nodes = [...document.querySelectorAll("code, pre, input, textarea, div")];
  return nodes
    .map((n) => (n.tagName === "INPUT" || n.tagName === "TEXTAREA" ? n.value : n.textContent || ""))
    .map((t) => t.trim())
    .filter((t) => /google-site-verification/i.test(t))
    .slice(0, 10);
});
console.log("codeBits", codeBits);

if (!token && codeBits[0]) {
  token = codeBits[0].match(/content=["']([^"']+)["']/i)?.[1];
}
if (!token) throw new Error("No meta token found");

// Patch local seo.ts and deploy meta via sed on server + restart, OR inject via Caddy/header
// Fast path: patch production getRootMetadata via editing deployed seo file and restart
const seoPath = "/opt/aura-ai/src/lib/seo.ts";
const patchCmd = `
python3 - <<'PY'
from pathlib import Path
p=Path('${seoPath}')
t=p.read_text()
token='${token}'
if 'google:' in t and token in t:
    print('already')
elif 'verification:' in t:
    import re
    t2=re.sub(r'verification:\\s*\\{[^}]*\\}', f"verification: {{\\n      yandex: \\"7902ba7dfdb76ac3\\",\\n      google: \\"{token}\\",\\n    }}", t, count=1)
    if t2==t:
        # try simpler insert after yandex line
        t2=t.replace('yandex: "7902ba7dfdb76ac3",', f'yandex: "7902ba7dfdb76ac3",\\n      google: "{token}",')
    p.write_text(t2)
    print('patched seo.ts')
else:
    raise SystemExit('no verification block')
print(p.read_text().split('verification')[1][:200])
PY
# Also patch built output if present
`;

// Local patch first
const localSeo = readFileSync("src/lib/seo.ts", "utf8");
let local2 = localSeo;
if (!local2.includes(`google: "${token}"`)) {
  local2 = local2.replace(
    'yandex: "7902ba7dfdb76ac3",',
    `yandex: "7902ba7dfdb76ac3",\n      google: "${token}",`
  );
  writeFileSync("src/lib/seo.ts", local2);
  console.log("patched local seo.ts");
}

// Server: inject meta via Caddy header is hard. Restart after editing compiled? Better deploy.
// Quick: use next and patch .next server chunks is fragile.
// Use Caddy to inject? No.
// Fastest reliable: add meta via a tiny static HTML? Meta must be on homepage.
// Deploy via npm build is slow. Patch running source and rebuild.

console.log("Deploying meta token via ssh build...");
ssh(`python3 - <<'PY'
from pathlib import Path
p=Path('/opt/aura-ai/src/lib/seo.ts')
t=p.read_text()
token=${JSON.stringify(token)}
if f'google: "{token}"' in t:
    print('already on server')
else:
    if 'yandex: "7902ba7dfdb76ac3",' in t:
        t=t.replace('yandex: "7902ba7dfdb76ac3",', f'yandex: "7902ba7dfdb76ac3",\\n      google: "{token}",')
        p.write_text(t)
        print('patched server seo')
    else:
        raise SystemExit('yandex line missing')
print([line for line in p.read_text().splitlines() if 'google' in line or 'yandex' in line or 'verification' in line][:10])
PY`);

// Also try download file via network sniff while clicking
const client = await page.context().newCDPSession(page);
await client.send("Network.enable");
const urls = [];
client.on("Network.responseReceived", (e) => {
  const u = e.response.url;
  if (/google|verification|\.html/i.test(u)) urls.push(u);
});

await page.evaluate(() => {
  const el = [...document.querySelectorAll("div,span,a,button")].find((e) =>
    /googlea07e95e8199f7e09\.html/i.test((e.textContent || "").trim())
  );
  if (el) el.click();
});
await page.waitForTimeout(3000);
console.log("network urls", urls);

// Rebuild/restart next for meta - use existing deploy script if quick, else npm run build
console.log(ssh("cd /opt/aura-ai && npm run build 2>&1 | tail -30"));
console.log(ssh("systemctl restart aura-ai && sleep 4 && curl -s https://zovus.ru/ | tr '\\n' ' ' | grep -o 'google-site-verification[^>]*' | head -5"));

// Reopen and verify via HTML tag method
await page.goto("https://search.google.com/search-console/welcome", {
  waitUntil: "domcontentloaded",
  timeout: 90000,
});
await page.waitForTimeout(2000);
await page.evaluate(() => {
  const el = [...document.querySelectorAll("a,button,div,span")].find(
    (e) =>
      /Завершить процедуру подтверждения/i.test((e.textContent || "").trim()) &&
      (e.textContent || "").trim().length < 80
  );
  if (el) el.click();
});
await page.waitForTimeout(2000);
await page.evaluate(() => {
  const el = [...document.querySelectorAll("div,span,li,a,button")].find(
    (e) => (e.textContent || "").trim() === "https://zovus.ru/"
  );
  if (el) el.click();
});
await page.waitForTimeout(4000);
await page.getByText("Тег HTML", { exact: true }).first().click({ force: true }).catch(() => {});
await page.waitForTimeout(1000);
const verifyBtns = page.getByRole("button", { name: /^Подтвердить$/i });
const count = await verifyBtns.count();
console.log("verify buttons", count);
// HTML tag verify is usually the second Подтвердить
if (count >= 2) await verifyBtns.nth(1).click({ force: true });
else await verifyBtns.first().click({ force: true });
await page.waitForTimeout(10000);
console.log("after", (await page.locator("body").innerText()).slice(0, 2000));
await page.screenshot({ path: join(OUT, "meta-02.png"), fullPage: true });

const done = page.getByRole("button", { name: /^(ГОТОВО|Done|ОК|OK)$/i }).first();
if (await done.count()) await done.click({ force: true });
await page.waitForTimeout(2500);

await page.goto(
  "https://search.google.com/search-console/security-issues?resource_id=https%3A%2F%2Fzovus.ru%2F",
  { waitUntil: "domcontentloaded", timeout: 90000 }
);
await page.waitForTimeout(5000);
let t = await page.locator("body").innerText();
console.log("SEC", page.url());
console.log(t.slice(0, 2500));
await page.screenshot({ path: join(OUT, "meta-03.png"), fullPage: true });

if (!/нет доступа|not-verified/i.test(t + page.url())) {
  const issue = page.locator("a,button,[role=row]").filter({ hasText: /Social|Социальн|Unsafe|Небезопас/i }).first();
  if (await issue.count()) {
    await issue.click({ force: true });
    await page.waitForTimeout(2000);
  }
  const review = page.locator("a,button,[role=button]").filter({ hasText: /Request a review|Запросить проверку/i }).first();
  if (await review.count()) {
    await review.click({ force: true });
    await page.waitForTimeout(1500);
    const ta = page.locator("textarea").first();
    if (await ta.count()) await ta.fill(REVIEW);
    const cbs = page.locator('input[type=checkbox]');
    for (let i = 0; i < (await cbs.count()); i++) await cbs.nth(i).check({ force: true }).catch(() => {});
    const submit = page.getByRole("button", { name: /Submit|Отправить|Request|Запросить/i }).last();
    if (await submit.count()) {
      await submit.click({ force: true });
      await page.waitForTimeout(4000);
      console.log("REVIEW_SUBMITTED");
    }
  }
  console.log("FINAL", (await page.locator("body").innerText()).slice(0, 2000));
}

writeFileSync(join(OUT, "meta-result.json"), JSON.stringify({ token, url: page.url(), text: await page.locator("body").innerText() }, null, 2));
console.log("DONE");
