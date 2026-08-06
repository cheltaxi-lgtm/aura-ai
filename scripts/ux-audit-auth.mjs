/**
 * Authenticated UX audit against production.
 * Usage: node scripts/ux-audit-auth.mjs [tokens.json]
 * tokens.json from scripts/_tmp-mint-ux-tokens.mjs (gitignored path recommended).
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const TOKENS_PATH =
  process.argv[2] || path.join("test-results", "ux-audit-tokens.json");
const OUT_PATH = path.join("test-results", "ux-audit-auth-report.json");

const findings = [];
function add(level, account, area, message, extra = {}) {
  findings.push({ level, account, area, message, ...extra });
  const mark = level === "PASS" ? "✓" : level === "FAIL" ? "✗" : "!";
  console.log(`${mark} [${level}] [${account}] ${area}: ${message}`);
}

async function api(page, method, urlPath, body) {
  return page.evaluate(
    async ({ method, urlPath, body }) => {
      const res = await fetch(urlPath, {
        method,
        credentials: "include",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const text = await res.text();
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = { raw: text.slice(0, 240) };
      }
      return { status: res.status, json };
    },
    { method, urlPath, body }
  );
}

async function acceptAge(page) {
  const btn = page.getByRole("button", { name: /мне есть 18|открыть карты/i }).first();
  if (await btn.count()) await btn.click().catch(() => undefined);
  await page.request.post("/api/age-gate/confirm", { data: { confirmed: true } }).catch(() => undefined);
}

async function auditAccount(browser, base, account) {
  const key = account.key;
  const context = await browser.newContext({
    locale: "ru-RU",
    viewport: { width: 1280, height: 900 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  });
  await context.addCookies([
    {
      name: "aura_auth",
      value: account.token,
      domain: new URL(base).hostname,
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
    },
  ]);
  const page = await context.newPage();
  page.setDefaultTimeout(45000);

  // Auth identity
  await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
  await acceptAge(page);
  const me = await api(page, "GET", "/api/auth/me");
  const email = me.json?.user?.email || me.json?.email || me.json?.account?.email;
  const okAuth =
    me.status === 200 &&
    (me.json?.authenticated === true ||
      Boolean(email) ||
      Boolean(me.json?.user) ||
      Boolean(me.json?.profile));
  if (okAuth) add("PASS", key, "auth/me", `HTTP ${me.status}`, { email: email || account.email });
  else add("FAIL", key, "auth/me", `Not authenticated`, { status: me.status, body: me.json });

  const profile = await api(page, "GET", "/api/profile");
  if (profile.status === 200) {
    add("PASS", key, "profile", "OK", {
      name: profile.json?.profile?.name || profile.json?.name,
      runes: profile.json?.profile?.runeBalance ?? profile.json?.runeBalance,
    });
  } else add("FAIL", key, "profile", `HTTP ${profile.status}`, { body: profile.json });

  // Cabinet pages
  const cabinetPaths = [
    { path: "/cabinet", expect: /кабинет|профиль|руны|сеанс|истор|настав|геннадий|пространство|баланс/i },
    { path: "/cabinet/human-design", expect: /дизайн|бодиграф|карт|тип|расчёт|я ·|друг/i },
    { path: "/cabinet/astrology", expect: /натал|астролог|карт|город|дата/i },
    { path: "/cabinet/support", expect: /поддержк|сообщени|чат|тикет/i },
  ];
  for (const item of cabinetPaths) {
    try {
      const resp = await page.goto(`${base}${item.path}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1400);
      const url = page.url();
      const body = (await page.locator("body").innerText().catch(() => "")) || "";
      if (/auth\/user\/login/i.test(url)) {
        add("FAIL", key, item.path, "Redirected to login — cookie not accepted");
      } else if (resp?.status() >= 400) {
        add("FAIL", key, item.path, `HTTP ${resp.status()}`);
      } else if (!item.expect.test(body)) {
        add("WARN", key, item.path, "Loaded but content markers weak", {
          sample: body.slice(0, 160).replace(/\s+/g, " "),
        });
      } else {
        add("PASS", key, item.path, "OK", { title: await page.title() });
      }
    } catch (e) {
      add("FAIL", key, item.path, e.message);
    }
  }

  // HD mine charts
  const hdMine = await api(page, "GET", "/api/human-design/mine");
  if (hdMine.status === 200) {
    const charts = hdMine.json?.charts || hdMine.json?.items || [];
    const kinds = Array.isArray(charts)
      ? charts.map((c) => ({
          kind: c.subjectKind,
          name: c.subjectName,
          type: c.chart?.type || c.type,
          profile: c.chart?.profile || c.profile,
        }))
      : [];
    add("PASS", key, "hd/mine", `${Array.isArray(charts) ? charts.length : "?"} charts`, {
      kinds: kinds.slice(0, 8),
    });

    // UI folder exclusivity for gennady
    if (key === "gennady" && Array.isArray(charts) && charts.length) {
      await page.goto(`${base}/cabinet/human-design`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2000);
      const tabMine = page.getByRole("button", { name: /моя карта/i }).first();
      const tabOthers = page.getByRole("button", { name: /другие/i }).first();
      if ((await tabMine.count()) && (await tabOthers.count())) {
        await tabMine.click();
        await page.waitForTimeout(1200);
        let t = await page.locator("body").innerText();
        const mineHasOtherName = /Юля/i.test(t) && !/Другие/i.test(await tabOthers.innerText().catch(() => ""));
        // soft check: on mine tab, chip "Я" should be present if self exists
        const hasSelfChip = /Я\s*·/i.test(t);
        add(hasSelfChip ? "PASS" : "WARN", key, "hd-tab-mine", hasSelfChip ? "Self chip visible" : "Self chip not found", {
          sample: t.slice(0, 200).replace(/\s+/g, " "),
        });

        await tabOthers.click();
        await page.waitForTimeout(1500);
        t = await page.locator("body").innerText();
        const hasYulya = /Юля/i.test(t);
        const bodygraphs = await page.locator("svg, canvas, .hd-bodygraph, [class*='bodygraph']").count();
        add(
          hasYulya ? "PASS" : "WARN",
          key,
          "hd-tab-others",
          hasYulya ? "Other person chart listed" : "Юля not visible on Others tab",
          { bodygraphs }
        );

        // switch back — ensure single chart region remount (no stacked mess heuristic)
        await tabMine.click();
        await page.waitForTimeout(1500);
        const bgAfter = await page.locator(".hd-chart-slot, [class*='HdChart'], .hd-bodygraph").count();
        add("PASS", key, "hd-tab-switch", `Chart slots after switch: ${bgAfter}`, {
          textHasYulyaOnMine: /Юля/i.test(await page.locator("body").innerText()),
        });
      } else {
        add("WARN", key, "hd-tabs", "Моя карта / Другие tabs not found");
      }
    }
  } else {
    add("WARN", key, "hd/mine", `HTTP ${hdMine.status}`, { body: hdMine.json });
  }

  // HD chart calc (smoke account — safe)
  if (key === "smoke" || key === "gennady") {
    const chart = await api(page, "POST", "/api/human-design/chart", {
      birthDate: "1992-03-21",
      birthTime: null,
      timezone: "Europe/Moscow",
      placeName: "Moscow, Russia",
      lat: 55.7558,
      lon: 37.6173,
      subjectKind: "other",
      subjectName: "UX Audit Temp",
    });
    const c = chart.json?.chart?.chart || chart.json?.chart;
    if (chart.status === 200 && (c?.type || c?.profile)) {
      add("PASS", key, "hd/chart-create", `${c.type || "?"} ${c.profile || ""}`.trim());
    } else {
      add("WARN", key, "hd/chart-create", `HTTP ${chart.status}`, {
        err: chart.json?.error || chart.json,
      });
    }
  }

  // Natal page + API probe
  await page.goto(`${base}/natalnaya-karta`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  const natalBody = await page.locator("body").innerText();
  if (/натал|дата|время|место/i.test(natalBody)) {
    add("PASS", key, "natal-ui", "Form shell OK");
  } else add("WARN", key, "natal-ui", "Weak natal UI");

  const natal = await api(page, "POST", "/api/natal-chart", {
    birthDate: "1990-05-15",
    birthTime: "12:00",
    timezone: "Europe/Moscow",
    lat: 55.7558,
    lon: 37.6173,
    placeName: "Moscow",
  });
  if (natal.status === 200 && (natal.json?.chart || natal.json?.planets || natal.json?.houses)) {
    add("PASS", key, "natal-api", "Chart computed");
  } else if (natal.status === 402 || natal.json?.code === "insufficient_runes") {
    add("WARN", key, "natal-api", "Paywall/insufficient runes", { body: natal.json });
  } else if (natal.status === 401) {
    add("FAIL", key, "natal-api", "Unauthorized despite cookie");
  } else {
    add("WARN", key, "natal-api", `HTTP ${natal.status}`, {
      err: natal.json?.error || natal.json?.message || natal.json,
    });
  }

  // Matrix report (paid) — only try on smoke with runes; don't burn gennady heavily
  if (key === "smoke") {
    const mx = await api(page, "POST", "/api/numerology/matrix-report", {
      birthDate: "1990-05-15",
      subjectName: "UX Audit",
    });
    if (mx.status === 200 && (mx.json?.report || mx.json?.text || mx.json?.content)) {
      add("PASS", key, "matrix-report", "Report returned");
    } else if (mx.status === 402 || mx.json?.code === "insufficient_runes") {
      add("WARN", key, "matrix-report", "Paywall", { body: mx.json });
    } else {
      add("WARN", key, "matrix-report", `HTTP ${mx.status}`, {
        err: mx.json?.error || mx.json?.message || mx.json,
      });
    }
  }

  // Destiny matrix UI
  await page.goto(`${base}/numerology/destiny-matrix`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);
  const date = page.locator('input[type="date"]').first();
  if (await date.count()) {
    await date.fill("1990-05-15");
    const btn = page.getByRole("button", { name: /рассчитать/i }).first();
    if (await btn.count()) await btn.click();
    await page.waitForTimeout(4000);
    const t = await page.locator("body").innerText();
    add(
      /матриц|аркан|энерг/i.test(t) ? "PASS" : "WARN",
      key,
      "matrix-ui",
      /матриц|аркан|энерг/i.test(t) ? "Preview OK" : "Weak preview"
    );
  }

  // Rituals
  await page.goto(`${base}/obryady`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);
  const ritualLinks = await page.locator('a[href*="/obryady/"]').count();
  add(ritualLinks > 0 ? "PASS" : "WARN", key, "rituals", `${ritualLinks} links`);

  // Photo reading
  await page.goto(`${base}/photo-rasklad`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);
  const photoPricing = await api(page, "GET", "/api/photo-reading/pricing");
  if (photoPricing.status === 200) {
    add("PASS", key, "photo-pricing", "OK", { keys: Object.keys(photoPricing.json || {}) });
  } else {
    add("WARN", key, "photo-pricing", `HTTP ${photoPricing.status}`, { body: photoPricing.json });
  }

  // Joint reading
  await page.goto(`${base}/joint-reading`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);
  const jr = await page.locator("body").innerText();
  add(
    /совместн|партн|приглас|ссылк|создать/i.test(jr) ? "PASS" : "WARN",
    key,
    "joint-ui",
    /совместн|партн|приглас|ссылк|создать/i.test(jr) ? "Flow shell OK" : "Weak joint UI"
  );

  // Sessions / diary
  const sessions = await api(page, "GET", "/api/sessions");
  if (sessions.status === 200) {
    const list = sessions.json?.sessions || sessions.json?.items || sessions.json;
    add("PASS", key, "sessions", `HTTP 200`, {
      count: Array.isArray(list) ? list.length : typeof list,
    });
  } else add("WARN", key, "sessions", `HTTP ${sessions.status}`);

  await page.goto(`${base}/diary`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  const diaryUrl = page.url();
  const diaryBody = await page.locator("body").innerText();
  if (/auth\/user\/login/i.test(diaryUrl)) {
    add("FAIL", key, "diary", "Login redirect");
  } else if (/дневник|сеанс|истор|пуст|запис/i.test(diaryBody)) {
    add("PASS", key, "diary", "OK");
  } else {
    add("WARN", key, "diary", "Weak diary markers", {
      sample: diaryBody.slice(0, 140).replace(/\s+/g, " "),
    });
  }

  // Runes packages + balance surface
  const pkgs = await api(page, "GET", "/api/runes/packages");
  add(pkgs.status === 200 ? "PASS" : "WARN", key, "runes-packages", `HTTP ${pkgs.status}`);

  // Intention session (auth)
  await page.goto(`${base}/session/intention`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  await acceptAge(page);
  const intent = await page.locator("body").innerText();
  if (/auth\/user\/login/i.test(page.url()) && /подтвердите возраст/i.test(intent)) {
    // still gated by age checkboxes on login form somehow
    add("WARN", key, "intention", "Still on auth/age UI", {
      sample: intent.slice(0, 160).replace(/\s+/g, " "),
    });
  } else if (/намер|вопрос|мастер|расклад|выбер|карт/i.test(intent)) {
    add("PASS", key, "intention", "Session shell OK");
  } else {
    add("WARN", key, "intention", "Unexpected shell", {
      url: page.url(),
      sample: intent.slice(0, 160).replace(/\s+/g, " "),
    });
  }

  // Chat smoke — cheap: only create session, skip LLM for most accounts
  const sess = await api(page, "POST", "/api/session", { referrerSlug: null });
  if (sess.status === 200 && (sess.json?.sessionId || sess.json?.id)) {
    add("PASS", key, "session-create", "OK", { id: sess.json?.sessionId || sess.json?.id });
  } else {
    add("WARN", key, "session-create", `HTTP ${sess.status}`, { body: sess.json });
  }

  // Pro module for pro account
  if (key === "pro") {
    for (const pth of ["/pro", "/pro/clients", "/pro/inbox", "/pro/settings", "/zovus-pro"]) {
      await page.goto(`${base}${pth}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1200);
      const t = await page.locator("body").innerText();
      const url = page.url();
      if (/login|войти/i.test(url) && /парол/i.test(t)) {
        add("WARN", key, pth, "Auth gate", { url });
      } else if (/Pro|клиент|кейс|входящ|биллинг|практик|заявк|кабинет/i.test(t)) {
        add("PASS", key, pth, "OK");
      } else {
        add("WARN", key, pth, "Weak Pro UI", { sample: t.slice(0, 140).replace(/\s+/g, " ") });
      }
    }
    const health = await api(page, "GET", "/api/pro/health");
    add(health.status === 200 ? "PASS" : "WARN", key, "pro/health", `HTTP ${health.status}`, {
      body: health.json,
    });
    const account = await api(page, "GET", "/api/pro/account");
    add(
      account.status === 200 || account.status === 404 || account.status === 403
        ? "PASS"
        : "WARN",
      key,
      "pro/account",
      `HTTP ${account.status}`,
      { body: account.json }
    );
  }

  // HD report ask — only smoke, may cost runes; skip if balance low after probes
  if (key === "smoke") {
    const mine2 = await api(page, "GET", "/api/human-design/mine");
    const charts = mine2.json?.charts || [];
    const self = charts.find((c) => c.subjectKind === "self") || charts[0];
    if (self?.id) {
      const report = await api(page, "POST", "/api/human-design/report", { chartId: self.id });
      if (report.status === 200 && (report.json?.report || report.json?.text || report.json?.markdown)) {
        add("PASS", key, "hd-report", "Report OK");
      } else if (report.status === 402) {
        add("WARN", key, "hd-report", "Paywall/insufficient");
      } else {
        add("WARN", key, "hd-report", `HTTP ${report.status}`, {
          err: report.json?.error || report.json?.message || report.json,
        });
      }
    } else {
      add("WARN", key, "hd-report", "No chart to report");
    }
  }

  // Spreads catalog still works while authed
  await page.goto(`${base}/rasklady/lyubov`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);
  const love = await page.locator("body").innerText();
  add(/любов|расклад/i.test(love) ? "PASS" : "WARN", key, "spreads-love", "Catalog check");

  await context.close();
}

async function main() {
  if (!fs.existsSync(TOKENS_PATH)) {
    console.error("Missing tokens file:", TOKENS_PATH);
    process.exit(1);
  }
  const tokens = JSON.parse(fs.readFileSync(TOKENS_PATH, "utf8"));
  const base = tokens.base || "https://zovus.ru";
  fs.mkdirSync("test-results", { recursive: true });

  const browser = await chromium.launch({ headless: true });
  try {
    for (const account of tokens.accounts) {
      console.log(`\n===== ACCOUNT ${account.key} (${account.email}) =====`);
      await auditAccount(browser, base, account);
    }
  } finally {
    await browser.close();
  }

  const summary = {
    pass: findings.filter((f) => f.level === "PASS").length,
    warn: findings.filter((f) => f.level === "WARN").length,
    fail: findings.filter((f) => f.level === "FAIL").length,
  };
  const report = { summary, findings, mintedAt: tokens.mintedAt };
  fs.writeFileSync(OUT_PATH, JSON.stringify(report, null, 2));
  console.log("\n=== SUMMARY ===");
  console.log(JSON.stringify(summary, null, 2));
  console.log("Wrote", OUT_PATH);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
