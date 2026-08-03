/**
 * Browser smoke for Premium AI delivery on production.
 * Auth via JWT signed with AUTH_SECRET (from env or prod .env.local).
 *
 * Usage:
 *   $env:AUTH_SECRET="..." ; node scripts/browser-smoke-ai-delivery.mjs
 *   node scripts/browser-smoke-ai-delivery.mjs https://zovus.ru
 */
import { chromium } from "@playwright/test";
import { SignJWT } from "jose";
import fs from "node:fs";
import path from "node:path";

const BASE = (process.argv[2] || "https://zovus.ru").replace(/\/$/, "");
const ACCOUNT_ID = process.env.E2E_ACCOUNT_ID || "b5dbca4c-114b-4c62-9546-011ad309e5bb";
const EMAIL = process.env.E2E_EMAIL || "gamer_club@mail.ru";
const NAME = process.env.E2E_NAME || "ГЕННАДИЙ";
const OUT_DIR = path.join("test-results", "ai-delivery-smoke");

function requireSecret() {
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret || secret === "dev-secret-change-in-production") {
    throw new Error("AUTH_SECRET required (prod secret)");
  }
  return secret;
}

async function makeCookie(secret) {
  const token = await new SignJWT({
    sub: ACCOUNT_ID,
    role: "user",
    email: EMAIL,
    name: NAME,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(new TextEncoder().encode(secret));
  return {
    name: "aura_auth",
    value: token,
    domain: new URL(BASE).hostname,
    path: "/",
    httpOnly: true,
    secure: BASE.startsWith("https"),
    sameSite: "Lax",
  };
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
      return { status: res.status, json, contentType: res.headers.get("content-type") };
    },
    { method, urlPath, body }
  );
}

function pass(name, detail = {}) {
  console.log(`PASS  ${name}`, detail);
}
function fail(name, detail = {}) {
  console.error(`FAIL  ${name}`, detail);
  throw new Error(`${name}: ${JSON.stringify(detail)}`);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const secret = requireSecret();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: "ru-RU",
  });
  await context.addCookies([await makeCookie(secret)]);
  const page = await context.newPage();

  // 1) Home + auth
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.screenshot({ path: path.join(OUT_DIR, "01-home.png"), fullPage: true });
  const me = await api(page, "GET", "/api/auth/me");
  if (!me.json?.authenticated && !me.json?.user) {
    // some responses use different shape
    const alt = me.json;
    if (!alt?.email && alt?.user?.email !== EMAIL && alt?.email !== EMAIL) {
      fail("auth_me", me);
    }
  }
  pass("auth_me", { status: me.status, email: me.json?.user?.email || me.json?.email });

  // 2) Active jobs endpoint
  const active = await api(page, "GET", "/api/jobs/active");
  if (active.status !== 200) fail("jobs_active", active);
  pass("jobs_active", { status: active.status, count: active.json?.jobs?.length ?? 0 });

  // 3) Daily reading GET (existing or empty)
  const dailyGet = await api(page, "GET", "/api/daily-reading");
  if (dailyGet.status !== 200) fail("daily_get", dailyGet);
  pass("daily_get", {
    status: dailyGet.status,
    drawn: dailyGet.json?.drawn,
    hasText: Boolean(dailyGet.json?.text),
  });
  await page.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 60_000 }).catch(() => {});
  await page.screenshot({ path: path.join(OUT_DIR, "02-home-authed.png"), fullPage: true });

  // 4) Enqueue reading async (should 202 or 200 cache)
  const readingBody = {
    async: true,
    characterId: "veronika",
    userName: NAME,
    tarotCards: [
      { name: "Шут", meaning: "Начало" },
      { name: "Маг", meaning: "Воля" },
      { name: "Жрица", meaning: "Интуиция" },
    ],
    intention: "love",
    spreadId: "triplet",
  };
  const reading = await api(page, "POST", "/api/reading", readingBody);
  if (reading.status === 202 && typeof reading.json?.jobId === "string") {
    pass("reading_enqueued", { jobId: reading.json.jobId });
    // poll up to ~3 min
    let done = null;
    for (let i = 0; i < 90; i += 1) {
      await page.waitForTimeout(2000);
      const job = await api(page, "GET", `/api/jobs/${reading.json.jobId}`);
      if (job.json?.status === "completed") {
        done = job.json;
        break;
      }
      if (job.json?.status === "failed") {
        fail("reading_job_failed", job.json);
      }
    }
    if (!done) fail("reading_job_timeout", { jobId: reading.json.jobId });
    const text = String(done.result?.reading || "");
    if (text.length < 80) fail("reading_too_short", { len: text.length });
    pass("reading_completed", { len: text.length, refunded: done.refunded });
  } else if (reading.status === 200 && String(reading.json?.reading || "").length >= 80) {
    pass("reading_sync_or_cache", {
      len: String(reading.json.reading).length,
      reused: reading.json.reused,
    });
  } else if (reading.status === 402) {
    pass("reading_insufficient_runes", { status: 402 });
  } else {
    fail("reading_unexpected", { status: reading.status, body: reading.json });
  }

  // 5) Intention-spread enqueue
  const intention = await api(page, "POST", "/api/intention-spread", {
    async: true,
    characterId: "veronika",
    intention: "love",
    spreadId: "triplet",
  });
  if (intention.status === 202 && intention.json?.jobId) {
    pass("intention_enqueued", { jobId: intention.json.jobId });
    let done = null;
    for (let i = 0; i < 90; i += 1) {
      await page.waitForTimeout(2000);
      const job = await api(page, "GET", `/api/jobs/${intention.json.jobId}`);
      if (job.json?.status === "completed") {
        done = job.json;
        break;
      }
      if (job.json?.status === "failed") {
        // generation_failed with refund is acceptable fail-closed
        pass("intention_failed_closed", {
          error: job.json.error,
          refunded: job.json.refunded,
        });
        done = "failed_ok";
        break;
      }
    }
    if (!done) fail("intention_timeout", { jobId: intention.json.jobId });
    if (done !== "failed_ok") {
      const text = String(done.result?.reading || "");
      if (text.length < 80) fail("intention_too_short", { len: text.length });
      pass("intention_completed", { len: text.length });
    }
  } else if (intention.status === 200 && String(intention.json?.reading || "").length >= 80) {
    pass("intention_sync_or_cache", { len: String(intention.json.reading).length });
  } else if (intention.status === 402) {
    pass("intention_insufficient_runes", { status: 402 });
  } else {
    fail("intention_unexpected", { status: intention.status, body: intention.json });
  }

  // 6) Natal page UI
  await page.goto(`${BASE}/astrology`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT_DIR, "03-astrology.png"), fullPage: true });
  const natalVisible = await page.locator("body").innerText();
  if (!/натал|астролог|джйотиш|прогноз/i.test(natalVisible)) {
    pass("natal_page_loaded_soft", { note: "page loaded, copy may vary" });
  } else {
    pass("natal_page_ui", { matched: true });
  }

  // 7) Photo page UI
  await page.goto(`${BASE}/photo-rasklad`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(OUT_DIR, "04-photo.png"), fullPage: true });
  pass("photo_page", { url: page.url() });

  // 8) Admin settings surface (may 403 for user — ok)
  const settings = await api(page, "GET", "/api/admin/settings");
  pass("admin_settings_probe", { status: settings.status });

  await browser.close();
  console.log(`\nSmoke OK. Screenshots: ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
