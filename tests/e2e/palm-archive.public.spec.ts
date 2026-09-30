import { expect, test, type Page } from "@playwright/test";

const snapshot = {
  version: 1,
  handDetected: true,
  whichHand: "right",
  handShape: "fire",
  verdict: "mixed",
  teaser: "Краткий результат для проверки интерфейса.",
  createdAt: "2026-09-28T12:00:00Z",
};

const reading = {
  snapshotId: "11111111-1111-4111-8111-111111111111",
  historyId: "22222222-2222-4222-8222-222222222222",
  paid: true,
  createdAt: snapshot.createdAt,
  whichHand: snapshot.whichHand,
  handShape: snapshot.handShape,
  verdict: snapshot.verdict,
  teaser: snapshot.teaser,
};

async function mockPalmAccount(page: Page, today: "empty" | "paid") {
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: {
    authenticated: true,
    user: { sub: "test-user", role: "user", name: "Тест", ageConfirmed: true },
  } }));
  await page.route("**/api/palm/readings", (route) => route.fulfill({ json: { readings: [reading] } }));
  await page.route("**/api/palm/readings/*", (route) => route.fulfill({ json: { entry: {
    snapshot,
    snapshotId: reading.snapshotId,
    historyId: reading.historyId,
    paid: true,
    report: "Сохранённый разбор ладони для проверки интерфейса.",
  } } }));
  await page.route("**/api/palm/today*", (route) => route.fulfill({ json: today === "empty" ? {} : {
    snapshot,
    snapshotId: reading.snapshotId,
    historyId: reading.historyId,
    paid: true,
    report: "Сегодняшний разбор ладони для проверки интерфейса.",
  } }));
  await page.route("**/api/palm/claim", (route) => route.fulfill({ status: 404, json: { code: "NO_CLAIM_TOKEN" } }));
  await page.route("**/api/palm/pricing", (route) => route.fulfill({ json: {
    baseCost: 250, effectiveCost: 125, firstPalmDiscount: true, todayPaid: today === "paid",
  } }));
  await page.route("**/api/age-gate/confirm", (route) => route.fulfill({ json: { confirmed: true } }));
}

async function openPalmAfterFeatureGate(page: Page) {
  await expect.poll(async () => (await page.request.get("/gadanie-po-ladoni")).status(), { timeout: 25_000 }).toBe(200);
  await page.goto("/gadanie-po-ladoni");
}

test("saved palm reading is visible without opening capture and reopens its report", async ({ page }) => {
  await mockPalmAccount(page, "empty");
  await openPalmAfterFeatureGate(page);

  const archive = page.locator("#palm-history");
  await expect(archive.getByRole("heading", { name: "История ладоней" })).toBeVisible();
  await expect(archive.locator(".palm-archive__item")).toHaveCount(1);
  if (process.env.PALM_VISUAL_REVIEW === "1") await page.screenshot({ path: "output/palm-archive-desktop.png", fullPage: true });
  await archive.locator(".palm-archive__open").click();
  await expect(page.getByText("Сохранённый разбор ладони для проверки интерфейса.")).toBeVisible();
});

test("archive remains visible beside a restored report on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockPalmAccount(page, "paid");
  await openPalmAfterFeatureGate(page);

  await expect(page.getByText("Сегодняшний разбор ладони для проверки интерфейса.")).toBeVisible();
  await expect(page.locator("#palm-history .palm-archive__item")).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (process.env.PALM_VISUAL_REVIEW === "1") await page.screenshot({ path: "output/palm-report-mobile.png", fullPage: true });
});

test("guest sees the archive sign-in path and a separate capture panel", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: { authenticated: false, user: null } }));
  await page.route("**/api/palm/today*", (route) => route.fulfill({ json: {} }));
  await page.route("**/api/palm/pricing", (route) => route.fulfill({ json: {
    baseCost: 250, effectiveCost: 125, firstPalmDiscount: true,
  } }));
  await openPalmAfterFeatureGate(page);

  await expect(page.locator("#palm-history").getByRole("link", { name: /Войти и посмотреть/ })).toBeVisible();
  await expect(page.locator("#palm-new")).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (process.env.PALM_VISUAL_REVIEW === "1") await page.screenshot({ path: "output/palm-guest-mobile.png", fullPage: true });
});
