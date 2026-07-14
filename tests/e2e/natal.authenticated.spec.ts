import { expect, test, type Page } from "@playwright/test";

const chart = {
  birthFingerprint: "e2e-fixture",
  timeKnown: false,
  place: { label: "Москва", timezone: "Europe/Moscow" },
  western: {
    sun: { sign: "Aries", degree: 12.5, longitude: 12.5 },
    moon: { sign: "Taurus", degree: 8.25, longitude: 38.25 },
    planets: {
      mercury: { sign: "Pisces", degree: 29, longitude: 359 },
      venus: { sign: "Gemini", degree: 4, longitude: 64 },
      mars: { sign: "Cancer", degree: 17, longitude: 107 },
    },
    aspects: [],
    patterns: [],
    midpoints: [],
    ephemeris: "e2e fixture",
    houseSystem: "Placidus",
  },
  vedic: null,
  transits: [],
  warnings: ["E2E fixture: unknown birth time"],
  computedAt: "2026-07-14T12:00:00.000Z",
  engineVersion: "e2e-v1",
};

const reports = [
  {
    id: "western-e2e",
    tradition: "western",
    reportType: "natal",
    content: "Стабильный западный отчёт из E2E-фикстуры.",
    runeCost: 100,
    createdAt: "2026-07-14T12:00:00.000Z",
    engineVersion: "e2e-v1",
    ephemeris: "e2e fixture",
    structuredData: null,
    evidenceRefs: [],
    birthFingerprint: "e2e-fixture",
  },
  {
    id: "vedic-e2e",
    tradition: "vedic",
    reportType: "natal",
    content: "Стабильный отчёт джйотиш из E2E-фикстуры.",
    runeCost: 100,
    createdAt: "2026-07-14T12:01:00.000Z",
    engineVersion: "e2e-v1",
    ephemeris: "e2e fixture",
    structuredData: null,
    evidenceRefs: [],
    birthFingerprint: "e2e-fixture",
  },
];

async function installNatalMocks(page: Page) {
  let aiContextEnabled = false;
  let tarotContextEnabled = false;
  let shares: Array<{
    id: string;
    token: string;
    reportKind: "natal";
    reportId: string;
    selectedSections: string[];
    expiresAt: string;
    revokedAt: string | null;
  }> = [];

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (path === "/api/auth/me") {
      return route.fulfill({ json: {
        authenticated: true,
        user: { sub: "e2e", role: "user", email: "fixture@example.invalid", name: "E2E" },
      } });
    }
    if (path === "/api/natal-chart") {
      return route.fulfill({ json: { enabled: true, chart } });
    }
    if (path === "/api/natal-chart/history") {
      return route.fulfill({ json: { reports } });
    }
    if (path === "/api/natal-chart/ai-preferences") {
      if (request.method() === "PATCH") {
        const patch = request.postDataJSON() as {
          aiContextEnabled?: boolean;
          tarotContextEnabled?: boolean;
        };
        if (typeof patch.aiContextEnabled === "boolean") aiContextEnabled = patch.aiContextEnabled;
        if (typeof patch.tarotContextEnabled === "boolean") tarotContextEnabled = patch.tarotContextEnabled;
      }
      return route.fulfill({ json: { preferences: { aiContextEnabled, tarotContextEnabled } } });
    }
    if (path === "/api/natal-chart/timing") {
      const horizon = Number(url.searchParams.get("horizon") ?? 30);
      return route.fulfill({ json: { timing: {
        version: "timing-celestine-v2",
        horizon,
        windowStart: "2026-07-14",
        windowEnd: horizon === 90 ? "2026-10-12" : "2026-08-12",
        generatedAt: "2026-07-14T12:00:00.000Z",
        timezone: "Europe/Moscow",
        events: [],
        solarReturn: {
          year: 2026,
          exactAtUtc: "2026-07-14T10:00:00.000Z",
          exactAtLocal: "2026-07-14T13:00:00",
          timezone: "Europe/Moscow",
          location: { label: "Москва", latitude: 55.7558, longitude: 37.6173, assumption: "natal_place" },
          positions: [{ key: "sun", longitude: 12.5, sign: "Aries", degree: 12.5, retrograde: false, house: 1 }],
          method: "Тестовая методология.",
          resolutionSeconds: 1,
          houses: {
            system: "Placidus",
            cusps: Array.from({ length: 12 }, (_, index) => ({
              house: index + 1, longitude: index * 30, sign: "Aries", degree: 0,
            })),
            ascendant: { key: "rising", longitude: 0, sign: "Aries", degree: 0, retrograde: false },
            midheaven: { key: "midheaven", longitude: 270, sign: "Capricorn", degree: 0, retrograde: false },
            warnings: [],
          },
        },
        progressions: null,
      } } });
    }
    if (path === "/api/natal-chart/event-preferences") {
      return route.fulfill({ json: { preferences: {
        enabled: false,
        horizons: [30],
        categories: ["identity"],
        planetImportance: ["sun"],
        frequency: "weekly",
        inApp: true,
        push: false,
        timezone: "Europe/Moscow",
      } } });
    }
    if (path === "/api/natal-chart/interpretation") {
      return route.fulfill({
        status: 503,
        json: { error: "Paid LLM calls are disabled in E2E." },
      });
    }
    if (path === "/api/report-shares" && request.method() === "GET") {
      return route.fulfill({ json: { shares } });
    }
    if (path === "/api/report-shares" && request.method() === "POST") {
      const body = request.postDataJSON() as { reportId: string; sections: string[] };
      const created = {
        id: "share-e2e",
        token: "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
        reportKind: "natal" as const,
        reportId: body.reportId,
        selectedSections: body.sections,
        expiresAt: "2026-07-21T12:00:00.000Z",
        revokedAt: null,
      };
      shares = [created];
      return route.fulfill({ status: 201, json: {
        share: { ...created, url: `/reports/shared/${created.token}` },
      } });
    }
    if (path === "/api/report-shares/share-e2e" && request.method() === "DELETE") {
      shares = shares.map((share) => ({ ...share, revokedAt: "2026-07-14T12:05:00.000Z" }));
      return route.fulfill({ json: { ok: true } });
    }

    return route.continue();
  });
}

test.beforeEach(async ({ page }) => {
  await installNatalMocks(page);
  await page.goto("/cabinet/astrology");
  await expect(page.getByRole("heading", { name: "Астрологическое пространство" })).toBeVisible();
});

test("tabs, unknown-time guard, and recompute work", async ({ page }) => {
  const navigation = page.getByRole("navigation", { name: "Разделы карты" });
  for (const tab of ["Обзор", "Западная", "Джйотиш", "Периоды", "Отношения", "Отчёты"]) {
    await expect(navigation.getByRole("button", { name: tab })).toBeVisible();
  }
  await expect(page.getByText("Ограниченная точность без времени рождения")).toBeVisible();
  await expect(page.getByText(/ASC, MC, дома и лагна скрыты/)).toBeVisible();

  await navigation.getByRole("button", { name: "Западная" }).click();
  await expect(page).toHaveURL(/tab=western/);
  await expect(page.getByRole("heading", { name: "Интерактивное колесо" })).toBeVisible();

  const recompute = page.getByRole("button", { name: "Пересчитать карту" });
  const recomputeResponse = page.waitForResponse((response) =>
    response.url().endsWith("/api/natal-chart") && response.request().method() === "POST"
  );
  await recompute.click();
  await recomputeResponse;
  await expect(page.getByRole("status")).toContainText("Расчёт обновлён");
});

test("stored tradition reports render without a paid LLM call", async ({ page }) => {
  let interpretationRequests = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/natal-chart/interpretation") {
      interpretationRequests += 1;
    }
  });

  await page.getByRole("button", { name: "Отчёты" }).click();
  await expect(page.getByRole("heading", { name: "Западная трактовка" })).toBeVisible();
  await expect(page.getByText("Стабильный западный отчёт из E2E-фикстуры.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Трактовка джйотиш" })).toBeVisible();
  await expect(page.getByText("Стабильный отчёт джйотиш из E2E-фикстуры.")).toBeVisible();
  expect(interpretationRequests).toBe(0);
});

test("timing horizon reloads the requested window", async ({ page }) => {
  await page.getByRole("button", { name: "Периоды" }).click();
  const horizon = page.getByRole("group", { name: "Горизонт прогноза" });
  await expect(horizon.getByRole("button", { name: "30 дней" })).toHaveAttribute("aria-pressed", "true");

  const response = page.waitForResponse((item) =>
    new URL(item.url()).pathname === "/api/natal-chart/timing"
    && new URL(item.url()).searchParams.get("horizon") === "90"
  );
  await horizon.getByRole("button", { name: "90 дней" }).click();
  await response;
  await expect(horizon.getByRole("button", { name: "90 дней" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("2026-07-14 — 2026-10-12")).toBeVisible();
});

test("AI consent toggles save independently", async ({ page }) => {
  await page.getByRole("button", { name: "Отчёты" }).click();
  const chatConsent = page.getByLabel("Разрешить натальный контекст в обычном чате с Shri Raj");
  const tarotConsent = page.getByLabel("Отдельно разрешить натальный контекст в раскладах Таро Shri Raj");
  await expect(chatConsent).not.toBeChecked();
  await expect(tarotConsent).not.toBeChecked();

  await chatConsent.check();
  await expect(chatConsent).toBeChecked();
  await expect(tarotConsent).not.toBeChecked();
  await tarotConsent.check();
  await expect(chatConsent).toBeChecked();
  await expect(tarotConsent).toBeChecked();
});

test("private report share can be created and revoked", async ({ page }) => {
  await page.getByRole("button", { name: "Отчёты" }).click();
  await page.getByText("Западная", { exact: true }).last().click();
  await page.getByText("Приватная ссылка (по умолчанию выключена)").click();
  await page.getByLabel("summary", { exact: true }).check();
  await page.getByRole("button", { name: "Создать ссылку" }).click();

  await expect(page.getByRole("status").filter({ hasText: "Приватная ссылка создана" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Отозвать" })).toBeVisible();
  await page.getByRole("button", { name: "Отозвать" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Приватная ссылка отозвана" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Отозвать" })).toHaveCount(0);
});
