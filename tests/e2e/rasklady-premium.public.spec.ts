import { expect, test } from "@playwright/test";

test("catalog separates the free daily reading from priced question spreads", async ({ page }) => {
  await page.route("**/api/rasklady/prices", async (route) => {
    await route.fulfill({ json: { prices: { "year-ahead": 105 } } });
  });
  await page.goto("/rasklady");
  await expect(page.getByRole("heading", { level: 1, name: "Каталог раскладов Таро онлайн" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Бесплатный расклад на сутки/ })).toHaveAttribute("href", "/?daily=1");
  await expect(page.getByRole("heading", { name: "Популярное" })).toBeVisible();

  const firstDeep = page.locator(".rasklady-grid--deep .rasklady-card").first();
  await expect(firstDeep).toHaveAttribute("href", /\/rasklady\//);
  await expect(firstDeep).toContainText("от 105 ᚢ");
  await firstDeep.click();
  await expect(page).toHaveURL(/\/rasklady\/[^/]+$/, { timeout: 30_000 });
  await expect(page.locator(".rasklady-intent__ticket-price")).toContainText("от 105 ᚢ");
  await expect(page.getByRole("link", { name: /Разложить карты/ })).toHaveCount(1);
});

test("search, empty state and reset keep catalog navigation usable", async ({ page }) => {
  await page.goto("/rasklady");
  const search = page.getByRole("searchbox", { name: "Поиск расклада" });
  await search.fill("вернется ли он");
  await expect(page.locator("#rasklady-results .rasklady-card").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Популярное" })).toHaveCount(0);
  await search.fill("несуществующий-вопрос-12345");
  await expect(page.getByRole("heading", { name: "Найдено: 0" })).toBeVisible();
  await search.fill("карта дня");
  await expect(page.locator('#rasklady-results a[href="/rasklady/karta-dnya"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Показать все расклады" }).click();
  await expect(page.getByRole("heading", { name: "Популярное" })).toBeVisible();
  await expect(search).toHaveValue("");
});

test("catalog and reading detail fit a narrow mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  for (const path of ["/rasklady", "/rasklady/chto-on-chuvstvuet"]) {
    await page.goto(path);
    const widths = await page.evaluate(() => ({ body: document.body.scrollWidth, viewport: document.documentElement.clientWidth }));
    expect(widths.body, path).toBeLessThanOrEqual(widths.viewport);
  }
  await expect(page.getByRole("link", { name: /Разложить карты/ })).toBeVisible();
});
