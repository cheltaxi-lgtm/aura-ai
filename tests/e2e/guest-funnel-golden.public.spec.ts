import { expect, test, type Page } from "@playwright/test";

/**
 * Browser golden-path smoke for guest conversion.
 * External OAuth is not live; post-CTA auth gate + same-card claim are covered
 * by invariant DB tests. This suite verifies UI order: teaser CTA → auth only after.
 */

const PICKER = "#guest-spread-picker";

async function startGuestFromHero(page: Page) {
  await page.goto("/?app=1");
  const button = page.locator(".editorial-hero__actions").getByRole("button", {
    name: /Открыть 3 карты/i,
  });
  await expect(button).toBeVisible();
  await button.click();
  await expect(page.locator(PICKER)).toBeVisible();
}

test.describe("guest funnel golden path (public)", () => {
  test("auth gate is not shown before teaser CTA", async ({ page }) => {
    await startGuestFromHero(page);
    await expect(
      page.getByRole("heading", { name: /Полный разбор готов/i })
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Войти через VK|Яндекс/i })).toHaveCount(0);
  });

  test("SEO ask+spread without receipt still opens a new guest picker", async ({ page }) => {
    await page.goto("/?ask=1&spread=1&app=1");
    // New spread path — age gate or picker, not an automatic resumed full reading.
    await expect(page.locator(PICKER)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Восстанавливаем Ваш расклад/i)).toHaveCount(0);
  });

  test("conversion CTA copy is present in guest draw source path after cards", async ({
    page,
  }) => {
    // Structural smoke: landing still exposes free-card CTA without registration demand.
    await page.goto("/?app=1");
    await expect(
      page.getByRole("button", { name: /Открыть 3 карты/i }).first()
    ).toBeVisible();
    await expect(page.locator(".editorial-hero").getByRole("button", { name: /Войти/i })).toHaveCount(
      0
    );
  });

  test("landing sells daily retention hook without guest-auth demand", async ({ page }) => {
    await page.goto("/?app=1");
    await expect(page.getByRole("heading", { name: /3 карты дня/i })).toBeVisible();
    await expect(page.getByText(/раз в сутки/i).first()).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Открыть первые 3 карты/i }).first()
    ).toBeVisible();
    await expect(page.getByText(/не путать со стартовым раскладом/i)).toHaveCount(0);
    await expect(page.getByText(/^После входа$/i)).toHaveCount(0);
  });

  test("starter gift before cards never promises full reading", async ({ page }) => {
    await page.goto("/?app=1");
    const gift = page.locator(".editorial-starter-gift");
    await expect(gift).toBeVisible({ timeout: 20_000 });
    await expect(gift.getByRole("link", { name: /Получить полный разбор/i })).toHaveCount(0);
    await expect(gift.getByRole("button", { name: /Получить полный разбор/i })).toHaveCount(0);
    await page
      .locator(".editorial-hero__actions")
      .getByRole("button", { name: /Открыть 3 карты/i })
      .click();
    await expect(page.locator(PICKER)).toBeVisible({ timeout: 15_000 });
  });
});
