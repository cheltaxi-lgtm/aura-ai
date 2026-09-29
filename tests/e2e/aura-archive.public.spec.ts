import { expect, test, type Page } from "@playwright/test";

const snapshot = {
  version: 1,
  faceDetected: true,
  dominantColor: { key: "blue", name: "Синяя", hex: "#4f8fd0", meaning: "Ясность и внимание" },
  secondaryColors: [],
  layers: [],
  chakras: [],
  verdict: "mixed",
  teaser: "Спокойный период.",
  createdAt: "2026-09-28T12:00:00Z",
};

const reading = {
  snapshotId: "11111111-1111-4111-8111-111111111111",
  historyId: "22222222-2222-4222-8222-222222222222",
  paid: true,
  createdAt: snapshot.createdAt,
  dominantColor: snapshot.dominantColor,
  verdict: snapshot.verdict,
  teaser: snapshot.teaser,
  subjectKind: "self",
};

async function mockAuraAccount(page: Page, today: "empty" | "teaser" | "paid") {
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: {
    authenticated: true,
    user: { sub: "test-user", role: "user", name: "Тест", ageConfirmed: true },
  } }));
  await page.route("**/api/platform/features", (route) => route.fulfill({ json: {
    auraReadingEnabled: true,
    auraOtherSubjectsEnabled: false,
  } }));
  await page.route("**/api/aura/readings", async (route) => {
    if (today === "teaser") await new Promise((resolve) => setTimeout(resolve, 750));
    await route.fulfill({ json: { readings: [reading] } });
  });
  await page.route("**/api/aura/readings/*", (route) => route.fulfill({ json: { entry: {
    snapshot,
    snapshotId: reading.snapshotId,
    historyId: reading.historyId,
    report: "Сохранённый полный разбор для проверки интерфейса.",
    subjectKind: "self",
  } } }));
  await page.route("**/api/aura/today*", (route) => route.fulfill({ json: today === "empty" ? {} : {
    snapshot,
    snapshotId: reading.snapshotId,
    historyId: today === "paid" ? reading.historyId : null,
    paid: today === "paid",
    report: today === "paid" ? "Сегодняшний полный разбор для проверки интерфейса." : null,
  } }));
  await page.route("**/api/aura/claim", (route) => route.fulfill({ status: 404, json: { code: "NO_CLAIM_TOKEN" } }));
  await page.route("**/api/age-gate/confirm", (route) => route.fulfill({ json: { confirmed: true } }));
}

async function openAuraAfterFeatureGate(page: Page) {
  // Middleware caches the fail-closed gate briefly while the dev server starts.
  await expect.poll(async () => (await page.request.get("/aura")).status(), { timeout: 25_000 }).toBe(200);
  await page.goto("/aura");
}

test("the saved aura is visible without opening capture and reopens its report", async ({ page }) => {
  await mockAuraAccount(page, "empty");
  await openAuraAfterFeatureGate(page);

  const archive = page.locator("#aura-history");
  await expect(archive.getByRole("heading", { name: "История ауры" })).toBeVisible();
  await expect(archive.locator(".aura-past__item")).toHaveCount(1);
  await archive.locator(".aura-past__open").click();
  await expect(page.getByText("Сохранённый полный разбор для проверки интерфейса.")).toBeVisible();
});

test("history remains available when today's paid report is restored on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockAuraAccount(page, "paid");
  await openAuraAfterFeatureGate(page);

  await expect(page.getByText("Сегодняшний полный разбор для проверки интерфейса.")).toBeVisible();
  await expect(page.locator("#aura-history .aura-past__item")).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("history finishes loading when today's free preview restores before the archive reply", async ({ page }) => {
  await mockAuraAccount(page, "teaser");
  await openAuraAfterFeatureGate(page);

  await expect(page.locator("#aura-history .aura-past__item")).toHaveCount(1);
  await expect(page.locator("#aura-history")).not.toContainText("Загружаем историю");
});
