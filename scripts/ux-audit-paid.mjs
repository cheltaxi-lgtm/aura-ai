/**
 * Paid UX flows on smoke account only (no Gennady spend).
 * Usage: node scripts/ux-audit-paid.mjs [tokens.json]
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const TOKENS_PATH =
  process.argv[2] || path.join("test-results", "ux-audit-tokens.json");
const OUT_PATH = path.join("test-results", "ux-audit-paid-report.json");
const BASE = "https://zovus.ru";

const findings = [];
function add(level, area, message, extra = {}) {
  findings.push({ level, area, message, ...extra });
  const mark = level === "PASS" ? "✓" : level === "FAIL" ? "✗" : "!";
  console.log(`${mark} [${level}] ${area}: ${message}`);
}

/** 1x1 PNG fallback if page screenshot is unusable. */
function makeTinyPng() {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  );
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
        json = { raw: text.slice(0, 300) };
      }
      return { status: res.status, json };
    },
    { method, urlPath, body }
  );
}

async function balance(page) {
  const r = await api(page, "GET", "/api/runes/daily/status");
  return r.json?.currentBalance ?? null;
}

async function ensureAge(page) {
  await page.request.post(`${BASE}/api/age-gate/confirm`, {
    data: { confirmed: true },
  });
  const btn = page.getByRole("button", { name: /мне есть 18/i }).first();
  if (await btn.count()) await btn.click().catch(() => undefined);
}

async function createSession(page) {
  let sess = await api(page, "POST", "/api/session", { referrerSlug: null });
  if (sess.status === 429) {
    await page.waitForTimeout(10000);
    sess = await api(page, "POST", "/api/session", { referrerSlug: null });
  }
  return sess.json?.sessionId || sess.json?.id || null;
}

async function main() {
  if (!fs.existsSync(TOKENS_PATH)) {
    console.error("Missing tokens:", TOKENS_PATH);
    process.exit(1);
  }
  const tokens = JSON.parse(fs.readFileSync(TOKENS_PATH, "utf8"));
  const smoke = tokens.accounts.find((a) => a.key === "smoke");
  if (!smoke) {
    console.error("smoke account missing in tokens");
    process.exit(1);
  }

  fs.mkdirSync("test-results", { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    locale: "ru-RU",
    viewport: { width: 1280, height: 900 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  });
  await context.addCookies([
    {
      name: "aura_auth",
      value: smoke.token,
      domain: "zovus.ru",
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
    },
  ]);
  const page = await context.newPage();
  page.setDefaultTimeout(180000);

  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await ensureAge(page);
  await page.goto(`${BASE}/cabinet`, { waitUntil: "domcontentloaded" });
  await ensureAge(page);
  await page.waitForTimeout(800);

  const balStart = await balance(page);
  add("PASS", "balance-start", `ᚢ ${balStart}`);

  // 1) HD report + ask
  try {
    const mine = await api(page, "GET", "/api/human-design/mine");
    let chartId =
      (mine.json?.charts || []).find((c) => c.subjectKind === "self")?.id ||
      (mine.json?.charts || [])[0]?.id;
    if (!chartId) {
      const created = await api(page, "POST", "/api/human-design/chart", {
        birthDate: "1988-07-07",
        birthTime: null,
        timezone: "Europe/Moscow",
        placeName: "Moscow, Russia",
        lat: 55.7558,
        lon: 37.6173,
        subjectKind: "self",
      });
      chartId = created.json?.chart?.id || created.json?.id;
    }

    const b1 = await balance(page);
    const report = await api(page, "POST", "/api/human-design/report", {
      chartId,
      aiDataUseAcknowledged: true,
    });
    const b2 = await balance(page);
    const reportObj = report.json?.report;
    const reportText =
      typeof reportObj === "string"
        ? reportObj
        : reportObj?.text || report.json?.text || report.json?.markdown || "";
    const reportId =
      report.json?.reportId ||
      report.json?.id ||
      (typeof reportObj === "object" ? reportObj?.id : null);

    if (report.status === 200 && (reportText || reportObj)) {
      add("PASS", "hd-report", `HTTP 200, ᚢ ${b1}->${b2}`, {
        reportId,
        spent: b1 != null && b2 != null ? b1 - b2 : null,
        preview: String(reportText).slice(0, 160),
        keys: Object.keys(report.json || {}),
      });
    } else {
      add("WARN", "hd-report", `HTTP ${report.status}`, {
        err: report.json?.error,
        keys: Object.keys(report.json || {}),
      });
    }

    if (reportId) {
      const b3 = await balance(page);
      const ask = await api(page, "POST", "/api/human-design/report/ask", {
        reportId,
        question: "Какая у меня стратегия в работе на ближайший месяц?",
      });
      const b4 = await balance(page);
      const answer = ask.json?.answer || ask.json?.text || ask.json?.message || "";
      if (ask.status === 200 && answer) {
        add("PASS", "hd-ask", `HTTP 200, ᚢ ${b3}->${b4}`, {
          spent: b3 != null && b4 != null ? b3 - b4 : null,
          preview: String(answer).slice(0, 160),
        });
      } else {
        add("WARN", "hd-ask", `HTTP ${ask.status}`, {
          err: ask.json?.error,
          keys: Object.keys(ask.json || {}),
        });
      }
    } else {
      add("WARN", "hd-ask", "No reportId returned", {
        keys: Object.keys(report.json || {}),
      });
    }
  } catch (e) {
    add("FAIL", "hd-report-ask", e.message);
  }

  // 2) Matrix via reading
  try {
    await page.waitForTimeout(2000);
    const sessionId = await createSession(page);
    if (!sessionId) {
      add("WARN", "matrix-session", "session create failed");
    } else {
      const b1 = await balance(page);
      const reading = await api(page, "POST", "/api/reading", {
        characterId: "numerolog",
        userName: "Deploy Smoke",
        birthDate: "1990-05-15",
        sessionId,
        numerologToolId: "destiny_matrix",
        customQuestion: "UX paid audit matrix",
        async: false,
      });
      const b2 = await balance(page);
      const text =
        reading.json?.reading ||
        reading.json?.text ||
        reading.json?.content ||
        reading.json?.message ||
        "";
      if (
        reading.status === 200 &&
        (text || reading.json?.jobId || reading.json?.matrix || reading.json?.ok)
      ) {
        add("PASS", "matrix-reading", `HTTP 200, ᚢ ${b1}->${b2}`, {
          spent: b1 != null && b2 != null ? b1 - b2 : null,
          keys: Object.keys(reading.json || {}).slice(0, 20),
          preview: String(text).slice(0, 200),
        });
      } else {
        add("WARN", "matrix-reading", `HTTP ${reading.status}`, {
          err: reading.json?.error || reading.json?.message,
          keys: Object.keys(reading.json || {}).slice(0, 15),
        });
      }

      const owned = await api(
        page,
        "GET",
        "/api/numerology/matrix-report?birthDate=1990-05-15"
      );
      add(
        owned.json?.owned ? "PASS" : "WARN",
        "matrix-owned",
        owned.json?.owned ? "Owned after purchase" : "Not owned yet",
        { status: owned.status, owned: owned.json?.owned, hasReport: !!owned.json?.report }
      );
    }
  } catch (e) {
    add("FAIL", "matrix-reading", e.message);
  }

  // 3) Ritual luck full path (~150)
  try {
    await page.waitForTimeout(1500);
    const b1 = await balance(page);
    const created = await api(page, "POST", "/api/ritual/create", {
      characterKey: "agafya",
      ritualType: "luck",
    });
    if (created.status !== 200 || !created.json?.ritualId) {
      add("WARN", "ritual-create", `HTTP ${created.status}`, { body: created.json });
    } else {
      const ritualId = created.json.ritualId;
      add("PASS", "ritual-create", `id=${ritualId} cost=${created.json.cost}`);

      const qCount = (created.json.questions || []).length || 2;
      for (let i = 0; i < qCount; i++) {
        const ans = await api(page, "POST", `/api/ritual/${ritualId}/answer`, {
          answer:
            i === 0
              ? "Нужна удача в работе и сделках"
              : "Давно ощущение что не везёт в ключевых моментах",
        });
        if (ans.status !== 200) {
          add("WARN", "ritual-answer", `HTTP ${ans.status} step ${i}`, {
            body: ans.json,
          });
        }
      }

      const draw = await api(page, "GET", "/api/ritual/draw?characterKey=agafya");
      const cards = draw.json?.cards;
      if (!Array.isArray(cards) || cards.length !== 5) {
        add("WARN", "ritual-draw", `Bad draw HTTP ${draw.status}`, { body: draw.json });
      } else {
        const save = await api(page, "POST", `/api/ritual/${ritualId}/cards`, { cards });
        if (save.status === 200) {
          add("PASS", "ritual-cards", "5 cards saved", {
            status: save.json?.ritual?.status,
            cost: save.json?.cost,
          });
        } else {
          add("WARN", "ritual-cards", `HTTP ${save.status}`, { body: save.json });
        }
      }

      const pay = await api(page, "POST", `/api/ritual/${ritualId}/pay`, {});
      const b2 = await balance(page);
      if (pay.status === 200) {
        add("PASS", "ritual-pay", `Paid, ᚢ ${b1}->${b2}`, {
          status: pay.json?.ritual?.status || pay.json?.status,
          spent: b1 != null && b2 != null ? b1 - b2 : null,
        });
      } else {
        add("WARN", "ritual-pay", `HTTP ${pay.status}`, { body: pay.json, bal: b2 });
      }

      const gen = await api(page, "POST", `/api/ritual/${ritualId}/regenerate`, {});
      const genText =
        gen.json?.ritual?.resultText ||
        gen.json?.ritual?.generated_text ||
        gen.json?.text ||
        gen.json?.content ||
        "";
      if (gen.status === 200 && (genText || gen.json?.ritual || gen.json?.jobId)) {
        add("PASS", "ritual-generate", "HTTP 200", {
          keys: Object.keys(gen.json || {}).slice(0, 15),
          preview: String(genText).slice(0, 200),
          ritualStatus: gen.json?.ritual?.status,
        });
      } else {
        add("WARN", "ritual-generate", `HTTP ${gen.status}`, {
          err: gen.json?.error,
          keys: Object.keys(gen.json || {}).slice(0, 15),
        });
      }
    }
  } catch (e) {
    add("FAIL", "ritual", e.message);
  }

  // 4) Photo recognize (+ stream)
  try {
    await page.goto(`${BASE}/cards`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    const shot = path.join("test-results", "ux-cards-page.png");
    await page.screenshot({ path: shot, fullPage: false });
    const shotB64 = fs.readFileSync(shot).toString("base64");

    const b1 = await balance(page);
    const recognize = await page.evaluate(async (imageBase64) => {
      const res = await fetch("/api/photo-reading/recognize", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          characterId: "veronika",
          mimeType: "image/png",
          imageBase64,
          question: "UX paid photo audit",
        }),
      });
      const json = await res.json().catch(async () => ({
        raw: (await res.text()).slice(0, 240),
      }));
      return { status: res.status, json };
    }, shotB64);
    const b2 = await balance(page);

    if (recognize.status === 200 && (recognize.json?.cards || recognize.json?.positions)) {
      add("PASS", "photo-recognize", `HTTP 200, ᚢ ${b1}->${b2}`, {
        keys: Object.keys(recognize.json || {}).slice(0, 15),
        nCards: (recognize.json.cards || []).length,
      });

      const stream = await api(page, "POST", "/api/photo-reading/stream", {
        characterId: "veronika",
        question: "UX paid photo audit",
        cards: recognize.json.cards,
        recognitionId: recognize.json.recognitionId || recognize.json.id,
        sessionId: recognize.json.sessionId,
        aiDataUseAcknowledged: true,
      });
      const b3 = await balance(page);
      if (stream.status === 200) {
        add("PASS", "photo-stream", `HTTP 200, balance ${b2}->${b3}`, {
          keys: Object.keys(stream.json || {}).slice(0, 12),
          preview: String(
            stream.json?.text || stream.json?.reading || stream.json?.raw || ""
          ).slice(0, 180),
        });
      } else {
        add("WARN", "photo-stream", `HTTP ${stream.status}`, {
          err: stream.json?.error,
          keys: Object.keys(stream.json || {}).slice(0, 12),
        });
      }
    } else {
      const tiny = makeTinyPng().toString("base64");
      const fallback = await page.evaluate(async (imageBase64) => {
        const res = await fetch("/api/photo-reading/recognize", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            characterId: "veronika",
            mimeType: "image/png",
            imageBase64,
            question: "UX paid photo audit tiny",
          }),
        });
        const json = await res.json().catch(async () => ({
          raw: (await res.text()).slice(0, 240),
        }));
        return { status: res.status, json };
      }, tiny);

      add("WARN", "photo-recognize", `HTTP ${recognize.status} / tiny ${fallback.status}`, {
        err: recognize.json?.error || fallback.json?.error,
        keys: Object.keys(recognize.json || {}),
        bal: await balance(page),
      });
    }
  } catch (e) {
    add("FAIL", "photo", e.message);
  }

  // 5) Intention spread
  try {
    await page.waitForTimeout(1500);
    const sessionId = await createSession(page);
    const b1 = await balance(page);
    const intent = await api(page, "POST", "/api/intention-spread", {
      characterId: "veronika",
      sessionId,
      intention: "love",
      question: "UX paid intention audit",
    });
    const b2 = await balance(page);
    if (intent.status === 200) {
      add("PASS", "intention-spread", `HTTP 200, ᚢ ${b1}->${b2}`, {
        spent: b1 != null && b2 != null ? b1 - b2 : null,
        keys: Object.keys(intent.json || {}).slice(0, 15),
        preview: String(intent.json?.reading || intent.json?.text || "").slice(0, 160),
      });
    } else {
      add("WARN", "intention-spread", `HTTP ${intent.status}`, {
        err: intent.json?.error,
        keys: Object.keys(intent.json || {}).slice(0, 12),
      });
    }
  } catch (e) {
    add("FAIL", "intention-spread", e.message);
  }

  // 6) Natal interpretation + forecast
  try {
    await api(page, "POST", "/api/natal-chart", {
      birthDate: "1988-07-07",
      birthTime: "12:00",
      timezone: "Europe/Moscow",
      lat: 55.7558,
      lon: 37.6173,
      placeName: "Moscow",
    });
    const b1 = await balance(page);
    const interp = await api(page, "POST", "/api/natal-chart/interpretation", {
      tradition: "western",
      aiDataUseAcknowledged: true,
    });
    const b2 = await balance(page);
    if (interp.status === 200) {
      add("PASS", "natal-interp", `HTTP 200, ᚢ ${b1}->${b2}`, {
        spent: b1 != null && b2 != null ? b1 - b2 : null,
        keys: Object.keys(interp.json || {}).slice(0, 12),
        preview: String(interp.json?.report || interp.json?.text || "").slice(0, 160),
      });
    } else {
      add("WARN", "natal-interp", `HTTP ${interp.status}`, { err: interp.json?.error });
    }

    const forecast = await api(page, "POST", "/api/natal-chart/forecast", {
      horizonDays: 30,
      aiDataUseAcknowledged: true,
    });
    if (forecast.status === 200) {
      add("PASS", "natal-forecast", "HTTP 200", {
        keys: Object.keys(forecast.json || {}).slice(0, 12),
      });
    } else {
      add("WARN", "natal-forecast", `HTTP ${forecast.status}`, {
        err: forecast.json?.error,
      });
    }
  } catch (e) {
    add("FAIL", "natal-paid", e.message);
  }

  const balEnd = await balance(page);
  add("PASS", "balance-end", `ᚢ ${balStart} → ${balEnd}`, {
    spent: balStart != null && balEnd != null ? balStart - balEnd : null,
  });

  await browser.close();

  const summary = {
    pass: findings.filter((f) => f.level === "PASS").length,
    warn: findings.filter((f) => f.level === "WARN").length,
    fail: findings.filter((f) => f.level === "FAIL").length,
    balanceStart: balStart,
    balanceEnd: balEnd,
  };
  fs.writeFileSync(
    OUT_PATH,
    JSON.stringify(
      { summary, findings, account: smoke.email, at: new Date().toISOString() },
      null,
      2
    )
  );
  console.log("\n=== SUMMARY ===");
  console.log(JSON.stringify(summary, null, 2));
  console.log("Wrote", OUT_PATH);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
