/**
 * Live joint_combined e2e on production (two accounts).
 *
 * Usage:
 *   $env:AUTH_SECRET="..." ; node scripts/browser-smoke-joint-combined.mjs
 */
import { chromium } from "@playwright/test";
import { SignJWT } from "jose";
import fs from "node:fs";
import path from "node:path";

const BASE = (process.argv[2] || "https://zovus.ru").replace(/\/$/, "");
const OUT_DIR = path.join("test-results", "ai-delivery-joint");

const INITIATOR = {
  accountId: process.env.E2E_ACCOUNT_ID || "b5dbca4c-114b-4c62-9546-011ad309e5bb",
  email: process.env.E2E_EMAIL || "gamer_club@mail.ru",
  name: process.env.E2E_NAME || "ГЕННАДИЙ",
};

const PARTNER = {
  accountId: process.env.E2E_PARTNER_ACCOUNT_ID || "47319ebc-4cb8-4bcb-aeca-9e2717aceb9f",
  email: process.env.E2E_PARTNER_EMAIL || "vk_888527438@oauth.zovus.local",
  name: process.env.E2E_PARTNER_NAME || "Аигул",
};

const LOVE7_CARDS = [
  { name: "Влюблённые", position: "Вы" },
  { name: "Двойка Кубков", position: "Партнёр" },
  { name: "Императрица", position: "Связь" },
  { name: "Звезда", position: "Сила" },
  { name: "Луна", position: "Слабость" },
  { name: "Солнце", position: "Совет" },
  { name: "Мир", position: "Итог" },
];

const SAMPLE_READING = [
  "Совместный тестовый расклад для проверки синтеза.",
  "Карты показывают взаимный интерес и мягкий рост связи.",
  "Слабое место — недосказанность, совет — говорить прямо.",
  "Итог благоприятный при честном диалоге в ближайшие недели.",
  "Это достаточно длинный текст для прохождения валидации стороны расклада.",
].join(" ");

function requireSecret() {
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret || secret === "dev-secret-change-in-production") {
    throw new Error("AUTH_SECRET required (prod secret)");
  }
  return secret;
}

async function makeCookie(secret, user) {
  const token = await new SignJWT({
    sub: user.accountId,
    role: "user",
    email: user.email,
    name: user.name,
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
        json = { raw: text.slice(0, 400) };
      }
      return { status: res.status, json };
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

async function waitJob(page, jobId, label, maxAttempts = 120) {
  for (let i = 0; i < maxAttempts; i += 1) {
    const res = await api(page, "GET", `/api/jobs/${encodeURIComponent(jobId)}`);
    const status = res.json?.status;
    if (status === "completed") {
      pass(label, { jobId, chars: String(res.json?.result?.combinedReading || res.json?.result?.text || "").length });
      return res.json;
    }
    if (status === "failed") fail(label, res);
    await page.waitForTimeout(2500);
  }
  fail(label, { timeout: true, jobId });
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const secret = requireSecret();
  const browser = await chromium.launch({ headless: true });

  const initiatorCtx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: "ru-RU",
  });
  await initiatorCtx.addCookies([await makeCookie(secret, INITIATOR)]);
  const initiator = await initiatorCtx.newPage();

  const partnerCtx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: "ru-RU",
  });
  await partnerCtx.addCookies([await makeCookie(secret, PARTNER)]);
  const partner = await partnerCtx.newPage();

  await initiator.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  const me = await api(initiator, "GET", "/api/auth/me");
  if (!me.json?.authenticated && !me.json?.user && me.json?.email !== INITIATOR.email) {
    fail("initiator_auth", me);
  }
  pass("initiator_auth");

  const created = await api(initiator, "POST", "/api/joint-reading/create", {
    initiatorName: "Геннадий",
    partnerName: "Аигул",
    spreadId: "love-7",
    intentSlug: "sovmestimost-pary",
    forceNew: true,
  });
  let token = created.json?.token;
  if (!token && created.status === 202 && created.json?.jobId) {
    const jobResult = await waitJob(initiator, created.json.jobId, "create_job");
    token = jobResult?.result?.token || jobResult?.outputEntityId;
  }
  if (!token) fail("create_invite", created);
  pass("create_invite", { token, status: created.status });

  const sideA = await api(initiator, "POST", `/api/joint-reading/${encodeURIComponent(token)}/complete`, {
    role: "initiator",
    characterKey: "veronika",
    reading: SAMPLE_READING,
    cards: LOVE7_CARDS,
  });
  if (sideA.status >= 400) fail("initiator_complete", sideA);
  pass("initiator_complete", { status: sideA.status });

  await partner.goto(`${BASE}/joint-reading/${encodeURIComponent(token)}`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  const sideB = await api(partner, "POST", `/api/joint-reading/${encodeURIComponent(token)}/complete`, {
    role: "partner",
    characterKey: "veronika",
    reading: `${SAMPLE_READING} Партнёрская сторона подтверждает общий вектор.`,
    cards: LOVE7_CARDS,
  });
  if (sideB.status >= 400) fail("partner_complete", sideB);
  pass("partner_complete", {
    status: sideB.status,
    combinedPending: sideB.json?.combinedPending,
    combinedJobId: sideB.json?.combinedJobId,
  });

  let combinedJobId = sideB.json?.combinedJobId || null;
  if (!combinedJobId) {
    const get = await api(initiator, "GET", `/api/joint-reading/${encodeURIComponent(token)}`);
    combinedJobId = get.json?.combinedJobId || null;
    if (get.json?.combinedReading?.length > 80) {
      pass("combined_ready_sync", { chars: get.json.combinedReading.length });
      await initiator.screenshot({ path: path.join(OUT_DIR, "joint-done.png"), fullPage: true });
      await browser.close();
      return;
    }
  }

  if (combinedJobId) {
    await waitJob(initiator, combinedJobId, "joint_combined_job");
  }

  let combined = null;
  for (let i = 0; i < 40; i += 1) {
    const get = await api(initiator, "GET", `/api/joint-reading/${encodeURIComponent(token)}`);
    if (get.json?.combinedReading?.length > 80) {
      combined = get.json.combinedReading;
      break;
    }
    await initiator.waitForTimeout(2500);
  }
  if (!combined) fail("combined_reading_missing", { token, combinedJobId });
  pass("combined_reading", { chars: combined.length, token });

  await initiator.goto(`${BASE}/joint-reading/${encodeURIComponent(token)}`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await initiator.screenshot({ path: path.join(OUT_DIR, "joint-done.png"), fullPage: true });
  await browser.close();
  console.log("browser-smoke-joint-combined: OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
