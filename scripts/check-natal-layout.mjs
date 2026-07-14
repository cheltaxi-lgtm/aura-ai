import { chromium } from "@playwright/test";
import { SignJWT } from "jose";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const baseURL = process.env.NATAL_LAYOUT_BASE_URL ?? "http://127.0.0.1:3417";

function loadAuthSecret() {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
  const envPath = join(rootDir, ".env.local");
  if (existsSync(envPath)) {
    const match = readFileSync(envPath, "utf8").match(/^AUTH_SECRET=(.+)$/m);
    if (match) return match[1].trim().replace(/^["']|["']$/g, "");
  }
  return "dev-secret-change-in-production";
}

async function createAuthCookie() {
  const token = await new SignJWT({
    sub: "layout-check",
    role: "user",
    email: "layout@example.invalid",
    name: "Layout Check",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("86400s")
    .sign(new TextEncoder().encode(loadAuthSecret()));
  return token;
}

const chart = {
  birthFingerprint: "layout-fixture",
  timeKnown: true,
  place: { label: "Москва", timezone: "Europe/Moscow" },
  western: {
    sun: { sign: "Aries", degree: 12.5, longitude: 12.5, house: 5 },
    moon: { sign: "Taurus", degree: 8.25, longitude: 38.25, house: 6 },
    rising: { sign: "Sagittarius", degree: 3.1, longitude: 243.1 },
    midheaven: { sign: "Virgo", degree: 18.2, longitude: 168.2 },
    planets: {
      mercury: { sign: "Pisces", degree: 29, longitude: 359, house: 4 },
      venus: { sign: "Gemini", degree: 4, longitude: 64, house: 7 },
      mars: { sign: "Cancer", degree: 17, longitude: 107, house: 8 },
      jupiter: { sign: "Leo", degree: 2, longitude: 122, house: 9 },
      saturn: { sign: "Capricorn", degree: 11, longitude: 281, house: 2 },
      uranus: { sign: "Aquarius", degree: 19, longitude: 319, house: 3 },
      neptune: { sign: "Aquarius", degree: 5, longitude: 305, house: 3 },
      pluto: { sign: "Sagittarius", degree: 12, longitude: 252, house: 1 },
    },
    aspects: [
      { type: "trine", planet1: "sun", planet2: "moon", orb: 2.1, nature: "harmonious" },
      { type: "square", planet1: "mars", planet2: "saturn", orb: 1.4, nature: "tense" },
    ],
    patterns: [{ type: "tSquare", planets: ["sun", "mars", "saturn"], note: "fixture" }],
    midpoints: [{ pair: "sun/moon", sign: "Gemini", degree: 25.3 }],
    ephemeris: "layout fixture",
    houseSystem: "Placidus",
    cusps: Array.from({ length: 12 }, (_, index) => ({
      house: index + 1,
      sign: "Aries",
      degree: index * 30,
      longitude: index * 30,
    })),
  },
  vedic: {
    ayanamsa: { system: "Lahiri", formatted: "24°11'14\"" },
    moonSign: {
      rashi: { index: 2, name: "Врishabha", westernName: "Taurus", symbol: "♉" },
      nakshatra: { name: "Rohini", pada: 2, lord: "moon" },
    },
    hasExactLagna: true,
    positions: {
      sun: { rashi: { index: 1, name: "Mesha", symbol: "♈" }, degree: "12°30'", nakshatra: { name: "Bharani", pada: 1, lord: "venus" } },
      moon: { rashi: { index: 2, name: "Vrishabha", symbol: "♉" }, degree: "8°15'", nakshatra: { name: "Rohini", pada: 2, lord: "moon" } },
      mercury: { rashi: { index: 12, name: "Meena", symbol: "♓" }, degree: "29°00'", nakshatra: { name: "Revati", pada: 4, lord: "mercury" } },
      venus: { rashi: { index: 3, name: "Mithuna", symbol: "♊" }, degree: "4°00'", nakshatra: { name: "Mrigashira", pada: 3, lord: "mars" } },
      mars: { rashi: { index: 4, name: "Karka", symbol: "♋" }, degree: "17°00'", nakshatra: { name: "Ashlesha", pada: 2, lord: "mercury" } },
      jupiter: { rashi: { index: 5, name: "Simha", symbol: "♌" }, degree: "2°00'", nakshatra: { name: "Magha", pada: 1, lord: "ketu" } },
      saturn: { rashi: { index: 10, name: "Makara", symbol: "♑" }, degree: "11°00'", nakshatra: { name: "Shravana", pada: 2, lord: "moon" } },
      rahu: { rashi: { index: 11, name: "Kumbha", symbol: "♒" }, degree: "19°00'", nakshatra: { name: "Shatabhisha", pada: 1, lord: "rahu" } },
      ketu: { rashi: { index: 5, name: "Simha", symbol: "♌" }, degree: "19°00'", nakshatra: { name: "Purva Phalguni", pada: 3, lord: "venus" } },
      ascendant: { rashi: { index: 9, name: "Dhanu", symbol: "♐" }, degree: "3°06'", nakshatra: { name: "Mula", pada: 1, lord: "ketu" } },
    },
    navamsa: {
      sun: { rashiIndex: 5, rashiName: "Simha", symbol: "♌", degreeInSign: 22.5 },
      moon: { rashiIndex: 6, rashiName: "Kanya", symbol: "♍", degreeInSign: 14.25 },
    },
    houses: Object.fromEntries(
      Array.from({ length: 12 }, (_, index) => [
        String(index + 1),
        { sign: { name: `Дом ${index + 1}` }, planets: index % 3 === 0 ? ["sun"] : [] },
      ]),
    ),
    dasha: {
      authoritative: true,
      current: { lord: "jupiter", startDate: "2020-01-01T00:00:00.000Z", endDate: "2036-01-01T00:00:00.000Z" },
      dashas: [
        { lord: "jupiter", startDate: "2020-01-01T00:00:00.000Z", endDate: "2036-01-01T00:00:00.000Z", years: 16, isPartial: false },
        { lord: "saturn", startDate: "2036-01-01T00:00:00.000Z", endDate: "2055-01-01T00:00:00.000Z", years: 19, isPartial: false },
      ],
    },
  },
  transits: [{ kind: "aspect", note: "Транзит Сатурна к натальной Луне · fixture" }],
  warnings: [],
  computedAt: "2026-07-14T12:00:00.000Z",
  engineVersion: "layout-v1",
};

const reports = [
  {
    id: "western-layout",
    tradition: "western",
    reportType: "natal",
    content: "Первый абзац западного отчёта.\n\nВторой абзац с дополнительным контекстом для проверки вертикальных отступов.",
    runeCost: 20,
    createdAt: "2026-07-14T12:00:00.000Z",
    engineVersion: "layout-v1",
    ephemeris: "layout fixture",
    structuredData: null,
    evidenceRefs: [],
    birthFingerprint: "layout-fixture",
  },
];

const tabs = [
  { label: "Обзор", url: /tab=overview|^\/cabinet\/astrology\/?$/, heading: "Ключевые положения" },
  { label: "Западная", url: /tab=western/, heading: "Интерактивное колесо" },
  { label: "Джйотиш", url: /tab=jyotish/, heading: "Джйотиш" },
  { label: "Периоды", url: /tab=timing/, heading: "Персональная шкала" },
  { label: "Отношения", url: /tab=relationships/, heading: "Стоимость и область покупки" },
  { label: "Отчёты", url: /tab=reports/, heading: "Западная трактовка" },
];

function overlaps(a, b, tolerance = 1) {
  const horizontal = a.left + tolerance < b.right && b.left + tolerance < a.right;
  const vertical = a.top + tolerance < b.bottom && b.top + tolerance < a.bottom;
  return horizontal && vertical;
}

function area(rect) {
  return Math.max(0, rect.width) * Math.max(0, rect.height);
}

function intersectionArea(a, b) {
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  const right = Math.min(a.right, b.right);
  const bottom = Math.min(a.bottom, b.bottom);
  return Math.max(0, right - left) * Math.max(0, bottom - top);
}

async function installMocks(page) {
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (path === "/api/auth/me") {
      return route.fulfill({ json: {
        authenticated: true,
        user: { sub: "layout", role: "user", email: "layout@example.invalid", name: "Layout" },
      } });
    }
    if (path === "/api/natal-chart") {
      return route.fulfill({ json: { enabled: true, chart } });
    }
    if (path === "/api/natal-chart/history") {
      return route.fulfill({ json: { reports } });
    }
    if (path === "/api/natal-chart/ai-preferences") {
      return route.fulfill({ json: { preferences: { aiContextEnabled: false, tarotContextEnabled: false } } });
    }
    if (path === "/api/natal-chart/timing") {
      const horizon = Number(url.searchParams.get("horizon") ?? 30);
      return route.fulfill({ json: { timing: {
        version: "timing-celestine-v2",
        horizon,
        windowStart: "2026-07-14",
        windowEnd: "2026-08-12",
        generatedAt: "2026-07-14T12:00:00.000Z",
        timezone: "Europe/Moscow",
        events: [{
          id: "evt-1",
          kind: "aspect",
          planetKey: "saturn",
          targetKey: "moon",
          aspect: "square",
          category: "emotion",
          source: "transit",
          date: "2026-07-20",
          peakAtLocal: "2026-07-20T12:00:00",
          orb: 0.42,
          maxOrb: 2,
        }],
        solarReturn: {
          exactAtUtc: "2026-07-14T10:00:00.000Z",
          exactAtLocal: "2026-07-14T13:00:00",
          timezone: "Europe/Moscow",
          method: "Тестовая методология солнечного возвращения.",
          location: { label: "Москва" },
          positions: [
            { key: "sun", longitude: 12.5, sign: "Aries", degree: 12.5, retrograde: false, house: 10 },
            { key: "moon", longitude: 38.25, sign: "Taurus", degree: 8.25, retrograde: false, house: 11 },
          ],
          houses: {
            system: "Placidus",
            ascendant: { key: "rising", longitude: 243.1, sign: "Sagittarius", degree: 3.1, retrograde: false },
            midheaven: { key: "midheaven", longitude: 168.2, sign: "Virgo", degree: 18.2, retrograde: false },
            cusps: Array.from({ length: 12 }, (_, index) => ({
              house: index + 1,
              longitude: index * 30,
              sign: ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"][index],
              degree: 0,
            })),
            warnings: [],
          },
        },
        progressions: {
          progressedAtUtc: "2026-07-15T00:00:00.000Z",
          exactAgeYears: 35.5,
          aspectsToNatal: [{ progressedKey: "moon", natalKey: "sun", aspect: "trine", orb: 0.8 }],
        },
      } } });
    }
    if (path === "/api/natal-chart/event-preferences") {
      return route.fulfill({ json: { preferences: {
        enabled: false,
        horizons: [30],
        categories: ["identity", "emotion"],
        planetImportance: ["sun", "moon"],
        frequency: "weekly",
        inApp: true,
        push: false,
        timezone: "Europe/Moscow",
      } } });
    }
    if (path === "/api/joint-reading/mine") {
      return route.fulfill({ json: { items: [] } });
    }
    return route.continue();
  });
}

async function collectPanelOverlaps(page) {
  return page.evaluate(() => {
    const panels = [...document.querySelectorAll("section.rounded-2xl.border")];
    const issues = [];

    for (const panel of panels) {
      const header = panel.querySelector("header");
      const body = panel.querySelector(":scope > div.flex.flex-col, :scope > div:not(header)");
      const eyebrow = header?.querySelector("p");
      const title = header?.querySelector("h2, h3");
      const intro = panel.querySelector("section[aria-label^='Объяснение:']");
      const afterIntro = intro?.nextElementSibling;

      const pairs = [
        ["eyebrow", "title", eyebrow, title],
      ];

      if (intro && afterIntro) {
        const introRect = intro.getBoundingClientRect();
        const nextRect = afterIntro.getBoundingClientRect();
        const gap = nextRect.top - introRect.bottom;
        if (gap < 12) {
          issues.push({
            panel: title?.textContent?.trim() ?? panel.querySelector("h2,h3")?.textContent?.trim() ?? "unknown",
            pair: "intro/next",
            gapPx: Math.round(gap),
          });
        }
      }

      for (const [aName, bName, a, b] of pairs) {
        if (!a || !b) continue;
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        const overlap = Math.max(0, Math.min(ar.bottom, br.bottom) - Math.max(ar.top, br.top));
        if (overlap > 2 && ar.top < br.top) {
          issues.push({
            panel: title?.textContent?.trim() ?? panel.querySelector("h2,h3")?.textContent?.trim() ?? "unknown",
            pair: `${aName}/${bName}`,
            overlapPx: Math.round(overlap),
          });
        }
      }
    }

    const cards = [...document.querySelectorAll("section.rounded-2xl.border")];
    for (let i = 0; i < cards.length - 1; i += 1) {
      const current = cards[i].getBoundingClientRect();
      const next = cards[i + 1].getBoundingClientRect();
      const horizontalOverlap = Math.max(0, Math.min(current.right, next.right) - Math.max(current.left, next.left));
      const sharedColumn = horizontalOverlap / Math.min(current.width, next.width) > 0.55;
      if (!sharedColumn) continue;
      const gap = next.top - current.bottom;
      if (gap < -2) {
        issues.push({
          panel: cards[i + 1].querySelector("h2,h3")?.textContent?.trim() ?? `card-${i + 1}`,
          pair: "card/card",
          overlapPx: Math.round(Math.abs(gap)),
        });
      }
    }

    return issues;
  });
}

async function collectMajorOverlaps(page) {
  return page.evaluate(() => {
    const selectors = [
      "section.rounded-2xl.border",
      "aside[aria-label='Справка для начинающих']",
      "label.flex.cursor-pointer",
      "article.rounded-xl",
    ];
    const nodes = [...document.querySelectorAll(selectors.join(","))]
      .filter((node) => {
        const rect = node.getBoundingClientRect();
        return rect.width > 40 && rect.height > 20;
      });

    const issues = [];
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const a = nodes[i];
        const b = nodes[j];
        if (a.contains(b) || b.contains(a)) continue;
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        const inter = Math.max(0, Math.min(ar.bottom, br.bottom) - Math.max(ar.top, br.top))
          * Math.max(0, Math.min(ar.right, br.right) - Math.max(ar.left, br.left));
        const minArea = Math.min(ar.width * ar.height, br.width * br.height);
        if (minArea > 0 && inter / minArea > 0.08) {
          issues.push({
            a: a.querySelector("h2,h3,p")?.textContent?.trim().slice(0, 40) ?? a.className.slice(0, 40),
            b: b.querySelector("h2,h3,p")?.textContent?.trim().slice(0, 40) ?? b.className.slice(0, 40),
            ratio: Number((inter / minArea).toFixed(3)),
          });
        }
      }
    }
    return issues.slice(0, 20);
  });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 2200 } });
  await context.addCookies([{
    name: "aura_auth",
    value: await createAuthCookie(),
    url: baseURL,
    httpOnly: true,
    sameSite: "Lax",
  }]);
  const page = await context.newPage();
  await installMocks(page);

  const allIssues = [];

  await page.goto(`${baseURL}/cabinet/astrology`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Астрологическое пространство" }).waitFor({ timeout: 60000 });
  await page.getByRole("navigation", { name: "Разделы карты" }).waitFor({ timeout: 15000 });

  for (const tab of tabs) {
    await page.getByRole("navigation", { name: "Разделы карты" }).getByRole("button", { name: tab.label }).click();
    await page.waitForTimeout(400);
    await page.waitForSelector(`h2:has-text("${tab.heading.split(" ")[0]}")`, { timeout: 10000 }).catch(() => {});

    const panelIssues = await collectPanelOverlaps(page);
    const majorIssues = await collectMajorOverlaps(page);

    if (panelIssues.length || majorIssues.length) {
      allIssues.push({ tab: tab.label, panelIssues, majorIssues });
    }

    await page.screenshot({
      path: `test-results/natal-layout-${tab.label.replace(/\s+/g, "-").toLowerCase()}.png`,
      fullPage: true,
    });
  }

  await browser.close();

  if (allIssues.length) {
    console.error("Layout overlap issues found:\n", JSON.stringify(allIssues, null, 2));
    process.exit(1);
  }

  console.log("All natal tabs passed layout overlap checks.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
