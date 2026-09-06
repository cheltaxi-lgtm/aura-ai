import { expect, test, type Page } from "@playwright/test";
import { calculateHdChart } from "../../src/lib/human-design/calculate";

const ids = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
];

const charts = ids.map((id, index) => ({
  id,
  subjectKind: index ? "other" : "self",
  subjectName: index === 1 ? "Алексей" : index === 2 ? "Мария" : null,
  relationToSelf: index ? "partner" : null,
  gender: index ? "male" : null,
  birthDate: "1990-08-15",
  birthTime: "12:00",
  timezone: "Europe/Moscow",
  placeName: "Москва",
  lat: 55.75,
  lon: 37.62,
  timeUnknown: false,
  createdAt: "2026-09-01T12:00:00Z",
  chart: calculateHdChart({
    birthDate: index === 2 ? "1985-04-03" : "1990-08-15",
    birthTime: "12:00",
    timezone: "Europe/Moscow",
  }),
}));

async function installAuthenticatedMocks(page: Page, baseURL: string) {
  expect(["127.0.0.1", "localhost"]).toContain(new URL(baseURL).hostname);
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/me") {
      return route.fulfill({ json: {
        authenticated: true,
        needsProfile: false,
        needsBirthProfile: false,
        user: {
          sub: "qa",
          role: "user",
          profileUserId: "qa",
          name: "Анна",
          ageConfirmed: true,
        },
      } });
    }
    if (path === "/api/platform/features") {
      return route.fulfill({ json: {
        humanDesignEnabled: true,
        natalChartEnabled: true,
        palmReadingEnabled: true,
        auraReadingEnabled: true,
      } });
    }
    if (path === "/api/human-design/mine") {
      return route.fulfill({ json: { enabled: true, charts } });
    }
    if (path === "/api/runes/config") {
      return route.fulfill({ json: {
        enabled: true,
        costs: { HD_REPORT: 100, HD_COMPOSITE_REPORT: 100 },
        starterRunes: 300,
        rubPerRune: 2,
      } });
    }
    if (path === "/api/memory/preferences") {
      return route.fulfill({ json: {
        needsInitialChoice: false,
        preferences: { memoryEnabled: true, autoCaptureEnabled: true },
      } });
    }
    if (path === "/api/cabinet") {
      return route.fulfill({ json: {
        profile: { name: "Анна", runeBalance: 300 },
        stats: { totalSessions: 0, totalCards: 0, daysWithUs: 1 },
        achievements: { earned: [], locked: [] },
        sessions: [],
        runes: { enabled: true, balance: 300, transactions: [] },
        photoSpreads: [],
        auraReadings: [],
        palmReadings: [],
        dailyReadings: [],
      } });
    }
    if (path === "/api/human-design/report" || path === "/api/human-design/composite-report") {
      return route.fulfill({ json: { report: null } });
    }
    return route.fulfill({ json: {} });
  });
}

for (const mode of ["personal", "composite"] as const) {
  test(`HD ${mode} ignores a late result after switching person`, async ({ page, baseURL }) => {
    await installAuthenticatedMocks(page, baseURL!);
    await page.setViewportSize({ width: 390, height: 844 });

    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let requested = false;
    const endpoint = mode === "personal"
      ? "/api/human-design/report"
      : "/api/human-design/composite-report";

    await page.route(`**${endpoint}`, async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      requested = true;
      await gate;
      await route.fulfill({ json: {
        report: {
          id: "old-report-a",
          status: "done",
          reportText: "Чужой запоздавший отчёт А. Содержимое предыдущей карты.",
        },
      } });
    });

    await page.goto("/cabinet/human-design");
    if (mode === "composite") {
      await page.getByRole("button", { name: /Связь с Алексей/ }).click();
    } else {
      await page.getByRole("tab", { name: /Другие/ }).click();
    }

    const consent = page.getByRole("checkbox", { name: /Подтверждаю передачу/ });
    await consent.check();
    await page.getByRole("button", {
      name: mode === "composite" ? /Получить разбор связи/ : /Получить полный разбор/,
    }).click();
    await expect.poll(() => requested).toBe(true);

    if (mode === "composite") {
      await page.getByRole("button", { name: /Связь с Мария/ }).click();
    } else {
      await page.getByRole("button", { name: /Мария/ }).first().click();
    }
    await expect(page.getByRole("checkbox", { name: /Подтверждаю передачу/ })).not.toBeChecked();

    const response = page.waitForResponse((item) =>
      new URL(item.url()).pathname === endpoint && item.request().method() === "POST"
    );
    release();
    await response;
    await page.evaluate(() => new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    ));
    await expect(page.getByText(/Чужой запоздавший отчёт А/)).toHaveCount(0);
    await expect(page.locator('a[href*="old-report-a"]')).toHaveCount(0);
    expect(await page.locator("body").evaluate((element) =>
      element.scrollWidth <= window.innerWidth
    )).toBe(true);
  });
}

test("memory preference failure keeps facts visible and blocks writes", async ({ page, baseURL }) => {
  await installAuthenticatedMocks(page, baseURL!);
  let failed = true;
  let mutations = 0;
  await page.route("**/api/memory/preferences", (route) => {
    if (route.request().method() !== "GET") mutations += 1;
    return route.fulfill(failed
      ? { status: 503, json: { error: "unavailable" } }
      : { json: {
          needsInitialChoice: false,
          preferences: { memoryEnabled: true, autoCaptureEnabled: true },
        } });
  });
  await page.route("**/api/memory/facts?*", (route) => route.fulfill({ json: { facts: [{
    id: ids[0],
    fact: "Важная сохранённая запись",
    category: null,
    eventDate: null,
    sourceType: "user",
    status: "active",
    salience: 4,
    addedByUser: true,
  }] } }));

  await page.goto("/cabinet?tab=memory");
  await expect(page.getByText("Важная сохранённая запись", { exact: true })).toBeVisible();
  await expect(page.getByText("Настройки недоступны", { exact: true })).toBeVisible();
  const toggle = page.getByRole("checkbox", { name: /Использовать память/ });
  await expect(toggle).toBeDisabled();
  expect(mutations).toBe(0);

  failed = false;
  await page.getByRole("button", { name: "Повторить", exact: true }).click();
  await expect(page.getByText("Важное остаётся с вами")).toBeVisible();
  await expect(toggle).toBeEnabled();
  expect(mutations).toBe(0);
});
