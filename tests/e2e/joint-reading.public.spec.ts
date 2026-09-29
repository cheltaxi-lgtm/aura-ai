import { expect, test, type Page } from "@playwright/test";

const items = [
  {
    token: "completed-token",
    status: "completed",
    intentTitle: "Совместимость пары",
    initiatorName: "Анна",
    partnerName: "Максим",
    hasInitiatorReading: true,
    hasPartnerReading: true,
    hasCombined: true,
    createdAt: "2026-09-26T10:00:00Z",
    isInitiator: true,
  },
  {
    token: "pending-token",
    status: "pending_partner",
    intentTitle: "Дружба",
    initiatorName: "Анна",
    partnerName: "Игорь",
    hasInitiatorReading: true,
    hasPartnerReading: false,
    hasCombined: false,
    createdAt: "2026-09-27T10:00:00Z",
    isInitiator: true,
  },
  {
    token: "expired-token",
    status: "expired",
    intentTitle: "Бизнес",
    initiatorName: "Анна",
    partnerName: "Олег",
    hasInitiatorReading: false,
    hasPartnerReading: false,
    hasCombined: false,
    createdAt: "2026-09-01T10:00:00Z",
    isInitiator: true,
  },
  {
    token: "older-token",
    status: "completed",
    intentTitle: "Совместимость пары",
    initiatorName: "Анна",
    partnerName: "Мария",
    hasInitiatorReading: true,
    hasPartnerReading: true,
    hasCombined: true,
    createdAt: "2026-08-25T10:00:00Z",
    isInitiator: false,
  },
];

async function mockAccount(page: Page) {
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: {
    authenticated: true,
    user: { sub: "test-user", role: "user", name: "Анна", ageConfirmed: true },
  } }));
  await page.route("**/api/joint-reading/mine", (route) => route.fulfill({ json: { items } }));
  await page.route("**/api/runes/config", (route) => route.fulfill({ json: {
    enabled: true,
    costs: { JOINT_READING: 25, INTENTION_SPREAD: 20 },
  } }));
}

test("saved joint readings are visible on the landing and can be reopened", async ({ page }) => {
  await mockAccount(page);
  await page.goto("/joint-reading");

  const history = page.locator("#joint-history");
  await expect(history.getByRole("heading", { name: "Мои совместные расклады" })).toBeVisible();
  await expect(history.locator(".joint-archive__item:visible")).toHaveCount(3);
  await expect(history.getByRole("link", { name: /Анна и Максим/ })).toHaveAttribute("href", "/joint-reading/completed-token");
  await history.getByText(/Показать загруженные/).click();
  await expect(history.locator(".joint-archive__item:visible")).toHaveCount(4);
  await expect(page.locator("#joint-invite")).toBeVisible();
  if (process.env.JOINT_VISUAL_REVIEW === "1") await page.screenshot({ path: "output/joint-landing-desktop.png", fullPage: true });
});

test("history loads beyond the first 20 records and names the partner's turn", async ({ page }) => {
  await mockAccount(page);
  const firstPage = Array.from({ length: 20 }, (_, index) => ({
    ...items[1],
    token: `page-one-${index}`,
    isInitiator: false,
  }));
  await page.route("**/api/joint-reading/mine**", (route) => {
    const offset = new URL(route.request().url()).searchParams.get("offset");
    return route.fulfill({ json: offset === "20"
      ? { items: [{ ...items[0], token: "page-two-result" }], nextOffset: null }
      : { items: firstPage, nextOffset: 20 } });
  });
  await page.goto("/joint-reading");
  const history = page.locator("#joint-history");
  await expect(history.locator(".joint-archive__item:visible")).toHaveCount(3);
  await expect(history.locator(".joint-archive__item").first()).toContainText("Ваш ход");
  await history.getByText(/Показать загруженные/).click();
  await history.getByRole("button", { name: "Загрузить ещё" }).click();
  await expect(history.locator(".joint-archive__item:visible")).toHaveCount(21);
  await expect(history.getByRole("link", { name: /Анна и Максим/ })).toHaveAttribute("href", "/joint-reading/page-two-result");
});

test("theme, depth and price explanation fit a mobile screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockAccount(page);
  await page.goto("/joint-reading");

  const invite = page.locator("#joint-invite");
  await expect(invite.getByRole("heading", { name: "Создать приглашение" })).toBeVisible();
  await invite.getByRole("button", { name: /Быстрый/ }).click();
  await expect(invite.locator(".joint-invite__pricing")).toContainText("≈ 20 ᚢ");
  await invite.getByRole("button", { name: /Максимальный/ }).click();
  await expect(invite.locator(".joint-invite__pricing")).toContainText("≈ 60 ᚢ");
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (process.env.JOINT_VISUAL_REVIEW === "1") await page.screenshot({ path: "output/joint-landing-mobile.png", fullPage: true });
});

test("created invitation presents the initiator action and shareable partner link", async ({ page }) => {
  await mockAccount(page);
  let archiveLoads = 0;
  await page.route("**/api/joint-reading/mine", (route) => {
    archiveLoads += 1;
    return route.fulfill({ json: { items: archiveLoads > 1 ? [
      { ...items[1], token: "created-token", initiatorName: "Анна", partnerName: "Новый участник" },
      ...items,
    ] : items } });
  });
  let requestedSpread = "";
  let confirmedCost: number | undefined;
  await page.route("**/api/joint-reading/create", async (route) => {
    const body = route.request().postDataJSON() as { spreadId?: string; confirmedCost?: number };
    requestedSpread = body.spreadId ?? "";
    confirmedCost = body.confirmedCost;
    await route.fulfill({ json: {
      token: "created-token",
      url: "https://zovus.ru/joint-reading/created-token",
      intentSlug: "sovmestimost-pary",
      spreadId: "love-7",
      reused: false,
    } });
  });
  await page.goto("/joint-reading");
  await page.locator("#joint-invite").getByRole("button", { name: /Создать приглашение · 25/ }).click();

  await expect(page.locator("#joint-invite").getByRole("heading", { name: "Приглашение готово" })).toBeVisible();
  await expect(page.locator("#joint-invite").getByRole("button", { name: "Пройти мой расклад" })).toBeVisible();
  await expect(page.locator(".joint-invite__url")).toContainText("/joint-reading/created-token");
  await expect(page.locator("#joint-history")).toContainText("Новый участник");
  expect(requestedSpread).toBe("love-7");
  expect(confirmedCost).toBe(25);
});

test("updated price requires a second confirmation before creating an invitation", async ({ page }) => {
  await mockAccount(page);
  let pricingLoads = 0;
  await page.route("**/api/runes/config", (route) => {
    pricingLoads += 1;
    return route.fulfill({ json: {
      enabled: true,
      costs: { JOINT_READING: pricingLoads > 1 ? 30 : 25, INTENTION_SPREAD: 20 },
    } });
  });
  let createRequests = 0;
  await page.route("**/api/joint-reading/create", (route) => {
    createRequests += 1;
    return route.fulfill({ json: {
      token: "updated-price-token",
      url: "https://zovus.ru/joint-reading/updated-price-token",
      intentSlug: "sovmestimost-pary",
      spreadId: "love-7",
    } });
  });
  await page.goto("/joint-reading");
  const invite = page.locator("#joint-invite");
  await invite.getByRole("button", { name: /Создать приглашение · 25/ }).click();
  await expect(invite.getByRole("alert")).toContainText("Стоимость обновилась");
  expect(createRequests).toBe(0);
  await invite.getByRole("button", { name: /Создать приглашение · 30/ }).click();
  await expect(invite.getByRole("heading", { name: "Приглашение готово" })).toBeVisible();
  expect(createRequests).toBe(1);
});

test("price increase during a queued invitation is shown after the job fails", async ({ page }) => {
  await mockAccount(page);
  let pricingLoads = 0;
  await page.route("**/api/runes/config", (route) => {
    pricingLoads += 1;
    return route.fulfill({ json: {
      enabled: true,
      costs: { JOINT_READING: pricingLoads > 2 ? 30 : 25, INTENTION_SPREAD: 20 },
    } });
  });
  await page.route("**/api/joint-reading/create", (route) => route.fulfill({ status: 202, json: { jobId: "queued-price-change" } }));
  await page.route("**/api/jobs/queued-price-change", (route) => route.fulfill({ json: {
    status: "failed",
    error: "Стоимость изменилась. Проверьте цену и повторите попытку.",
  } }));
  await page.goto("/joint-reading");
  const invite = page.locator("#joint-invite");
  await invite.getByRole("button", { name: /Создать приглашение · 25/ }).click();
  await expect(invite.getByRole("alert")).toContainText("Стоимость обновилась");
  await expect(invite.getByRole("button", { name: /Создать приглашение · 30/ })).toBeEnabled();
});

test("completed result leads with the shared interpretation and keeps personal readings collapsible", async ({ page }) => {
  await page.route("**/api/joint-reading/result-token", (route) => route.fulfill({ json: {
    token: "result-token",
    status: "completed",
    spreadId: "love-7",
    intentSlug: "sovmestimost-pary",
    initiatorName: "Анна",
    partnerName: "Максим",
    expiresAt: "2026-10-10T00:00:00Z",
    hasInitiatorReading: true,
    hasPartnerReading: true,
    combinedReading: "Общий результат тестовой пары.",
    initiatorReading: "Личный результат первого участника.",
    partnerReading: null,
    viewerRole: "initiator",
    canStartAsInitiator: false,
    canStartAsPartner: false,
    isLoggedIn: true,
    synastry: null,
  } }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/joint-reading/result-token");

  await expect(page.locator("#joint-result-report")).toContainText("Общий результат тестовой пары.");
  await expect(page.locator(".joint-result__personal details")).toHaveCount(1);
  await expect(page.getByText("Личный результат первого участника.")).toBeHidden();
  if (process.env.JOINT_VISUAL_REVIEW === "1") await page.screenshot({ path: "output/joint-result-mobile.png", fullPage: true });
  await page.locator(".joint-result__personal summary").first().click();
  await expect(page.locator(".joint-result__personal")).toContainText("Личный результат первого участника.");
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("guest can see the archive sign-in path without creating an invitation", async ({ page }) => {
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: { authenticated: false, user: null } }));
  await page.goto("/joint-reading");

  await expect(page.locator("#joint-history").getByRole("link", { name: /Войти и посмотреть/ })).toBeVisible();
  await expect(page.locator("#joint-invite").getByRole("heading", { name: "Создать приглашение" })).toBeVisible();
});
