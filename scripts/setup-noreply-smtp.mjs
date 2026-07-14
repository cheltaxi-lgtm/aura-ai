#!/usr/bin/env node
/** Create Yandex app password for noreply@zovus.ru and apply SMTP on prod. */
import { chromium } from "playwright";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

const OUT = join(process.cwd(), ".cursor", "yandex360-setup");
const profileDir = join(OUT, "pw-profile");
mkdirSync(OUT, { recursive: true });

async function snap(page, label) {
  await page.screenshot({ path: join(OUT, `${label}.png`), fullPage: true });
}

async function loginAsNoreply(browser) {
  const pwdPath = join(OUT, "noreply-password.txt");
  if (!existsSync(pwdPath)) throw new Error("noreply-password.txt missing");
  const mailboxPwd = readFileSync(pwdPath, "utf8").trim();

  const context = await browser.newContext({ locale: "ru-RU", viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();
  await page.goto("https://passport.yandex.ru/auth?retpath=https%3A%2F%2Fid.yandex.ru%2Fsecurity%2Fapp-passwords", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: join(OUT, "noreply-mail-login.png"), fullPage: true });

  const more = page.getByRole("button", { name: /^Ещё$/i }).first();
  if (await more.count()) {
    await more.click({ force: true });
    await page.waitForTimeout(1000);
    const mailBtn = page.getByText(/^Почта$/i).first();
    if (await mailBtn.count()) await mailBtn.click({ force: true });
    await page.waitForTimeout(1000);
  }

  const loginInput = page.getByPlaceholder(/Логин или email/i).first();
  await loginInput.waitFor({ state: "visible", timeout: 15000 });
  await loginInput.fill("noreply@zovus.ru");
  await page.getByRole("button", { name: /^Далее$/i }).click({ force: true });
  await page.waitForTimeout(2500);

  const pwdInput = page.getByPlaceholder(/Пароль/i).first();
  await pwdInput.waitFor({ state: "visible", timeout: 15000 });
  await pwdInput.fill(mailboxPwd);
  await page.getByRole("button", { name: /^Войти$|^Далее$/i }).first().click({ force: true });
  await page.waitForTimeout(6000);
  await page.screenshot({ path: join(OUT, "noreply-after-login.png"), fullPage: true });

  await page.goto("https://id.yandex.ru/security/app-passwords", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: join(OUT, "noreply-app-passwords.png"), fullPage: true });
  return { context, page };
}

async function createAppPassword(page) {
  const outFile = join(OUT, "noreply-smtp-password.txt");

  await page.getByText("Почта", { exact: true }).first().click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(1000);

  const createBtn = page.getByRole("button", { name: /Создать|Добавить/i }).first();
  if (await createBtn.count()) await createBtn.click({ force: true });
  await page.waitForTimeout(1500);

  const name = page.locator('input[type="text"]').first();
  if (await name.count()) await name.fill(`ZovusNoreplySMTP${Date.now().toString().slice(-4)}`);
  await page.getByRole("button", { name: /Создать|Готово|Далее/i }).first().click({ force: true }).catch(() => {});
  await page.waitForTimeout(4000);
  await snap(page, "noreply-new-app-password");

  const modal = page.locator("div").filter({ hasText: /показывается один раз/i }).first();
  let pwd = "";
  if (await modal.count()) {
    pwd = await modal.evaluate((el) => {
      const m = el.textContent?.match(/([a-z]{8,12})/);
      return m?.[1] || "";
    });
  }
  if (!pwd) {
    const body = await page.locator("body").innerText();
    pwd =
      body
        .split("\n")
        .map((l) => l.trim())
        .find((l) => /^[a-z]{8,20}$/.test(l) && !["openclaw", "foxbit"].includes(l.toLowerCase())) || "";
  }
  if (!pwd) throw new Error("App password not found on page");
  writeFileSync(outFile, pwd, "utf8");
  return pwd;
}

async function verifyDkim(page, log) {
  await page.goto("https://admin.yandex.ru/select-organization?uid=112696101", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(1500);
  const kop = page.getByText("kopinfo.ru").first();
  if (await kop.count()) await kop.click({ force: true });
  await page.waitForTimeout(3000);

  await page.goto("https://admin.yandex.ru/domains", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  const dkim = page.getByText("Настроить DKIM", { exact: true }).first();
  if (await dkim.count()) {
    await dkim.click({ force: true });
    await page.waitForTimeout(2000);
    const check = page.getByRole("button", { name: /Проверить/i }).first();
    if (await check.count()) {
      await check.click({ force: true });
      await page.waitForTimeout(10000);
      log.push("dkim_rechecked");
    }
    await snap(page, "dkim-recheck");
  }
}

async function main() {
  const browser = await chromium.launch({ headless: false });
  const adminContext = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    viewport: { width: 1400, height: 900 },
    locale: "ru-RU",
  });
  const adminPage = adminContext.pages()[0] || (await adminContext.newPage());
  const log = [];
  let noreplyContext;

  try {
    await verifyDkim(adminPage, log);
    const noreply = await loginAsNoreply(browser);
    noreplyContext = noreply.context;
    const appPwd = await createAppPassword(noreply.page);
    log.push("app_password_saved");

    const sshKey = join(process.env.USERPROFILE || "", ".ssh", "aura_deploy_ed25519");
    const hosts = join(process.env.USERPROFILE || "", ".ssh", "known_hosts_aura_beget");
    const remoteScript = "scripts/apply-smtp-prod.sh";
    const scp = `scp.exe -o BatchMode=yes -i "${sshKey}" -o UserKnownHostsFile="${hosts}" "${remoteScript}" root@217.12.37.32:/tmp/apply-smtp-prod.sh`;
    const ssh = `ssh.exe -o BatchMode=yes -i "${sshKey}" -o UserKnownHostsFile="${hosts}" root@217.12.37.32 "bash /tmp/apply-smtp-prod.sh /opt/aura-ai/.env.local '${appPwd}' noreply@zovus.ru"`;
    execSync(scp, { stdio: "inherit", cwd: process.cwd() });
    execSync(ssh, { stdio: "inherit" });
    log.push("prod_smtp_applied");

    execSync(
      `ssh.exe -o BatchMode=yes -i "${sshKey}" -o UserKnownHostsFile="${hosts}" root@217.12.37.32 "cd /opt/aura-ai && node scripts/test-smtp.mjs cheldriver@yandex.ru"`,
      { stdio: "inherit" }
    );
    log.push("smtp_test_sent");

    console.log(JSON.stringify({ log, ok: true }, null, 2));
  } finally {
    if (noreplyContext) await noreplyContext.close().catch(() => {});
    await adminContext.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
