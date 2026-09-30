import { expect, test } from "@playwright/test";

test("a saved bodygraph is visible on the hub and reopens the exact chart", async ({ page }) => {
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: {
    authenticated: true,
    needsProfile: false,
    user: { sub: "test-user", role: "user", name: "Гость", ageConfirmed: true },
  } }));
  await page.route("**/api/human-design/mine", (route) => route.fulfill({ json: {
    enabled: true,
    charts: [{
      id: "saved-chart-1",
      fingerprint: "saved-chart-fingerprint",
      subjectKind: "self",
      birthDate: "1990-04-12",
      chart: { type: "generator", profile: "2/4" },
    }],
  } }));
  await page.goto("/dizayn-cheloveka");

  const history = page.locator("#hd-my-charts");
  await expect(history.getByRole("heading", { name: "Мои карты" })).toBeVisible();
  await expect(history.getByRole("link", { name: /Я · 12.04.1990/ })).toHaveAttribute(
    "href", "/cabinet/human-design?chart=saved-chart-1"
  );
  await expect(page.getByRole("link", { name: /Рассчитать карту бесплатно/ })).toHaveAttribute(
    "href", "/dizayn-cheloveka/rasschitat"
  );
  await page.getByRole("link", { name: /Рассчитать карту бесплатно/ }).click();
  await expect(page).toHaveURL(/\/dizayn-cheloveka\/rasschitat/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Рассчитать карту Дизайна Человека" })).toBeVisible();
  await expect(page.getByLabel("Дата рождения")).toBeVisible();
});

test("guest can return to the last browser chart and mobile layout has no horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem("hd:last-fingerprint", "recent-fingerprint"));
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: { authenticated: false } }));
  await page.goto("/dizayn-cheloveka");

  await expect(page.locator("#hd-my-charts").getByRole("link", { name: /Открыть последний бодиграф/ }))
    .toHaveAttribute("href", "/dizayn-cheloveka/rasschitat");
  const dimensions = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }));
  expect(dimensions.body).toBeLessThanOrEqual(dimensions.viewport);
});

test("a guest chart is claimed before the signed-in history is shown", async ({ page }) => {
  let claimed = false;
  await page.addInitScript(() => {
    localStorage.setItem("hd:last-fingerprint", "guest-fingerprint");
    localStorage.setItem("hd:claim-token:guest-fingerprint", "guest-claim-token");
  });
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: {
    authenticated: true,
    needsProfile: false,
  } }));
  await page.route("**/api/human-design/claim", (route) => {
    claimed = true;
    return route.fulfill({ json: { claimed: true } });
  });
  await page.route("**/api/human-design/mine", (route) => route.fulfill({ json: {
    enabled: true,
    charts: claimed ? [{
      id: "claimed-chart",
      fingerprint: "guest-fingerprint",
      subjectKind: "self",
      chart: { type: "generator", profile: "2/4" },
    }] : [],
  } }));
  await page.goto("/dizayn-cheloveka");

  await expect(page.locator("#hd-my-charts").getByRole("link", { name: /Открыть карту/ }))
    .toHaveAttribute("href", "/cabinet/human-design?chart=claimed-chart");
  expect(claimed).toBe(true);
});
