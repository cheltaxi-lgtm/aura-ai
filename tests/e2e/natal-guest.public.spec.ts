import { expect, test } from "@playwright/test";

test.describe("natal guest calculator (public)", () => {
  test("guest can open calculator without registration wall", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/natalnaya-karta");

    await expect(page.getByRole("heading", { name: /Натальная карта/i }).first()).toBeVisible();

    // Age gate or calculator form — not a hard redirect to register.
    await expect(page).not.toHaveURL(/\/auth\/user\/register/);

    const ageBtn = page.getByRole("button", { name: /Мне есть 18 лет/i });
    if (await ageBtn.isVisible().catch(() => false)) {
      await ageBtn.click();
    }

    await expect(page.locator("#natal-calculator")).toBeVisible();
    await expect(page.getByRole("button", { name: /Построить мою карту/i })).toBeVisible();
    await expect(page.getByText(/Не знаю точное время/i)).toBeVisible();
  });

  test("calculator is embedded in the hero for guests", async ({ page }) => {
    await page.goto("/natalnaya-karta");
    await expect(page.locator(".premium-calculator-hero #natal-calculator")).toBeVisible();
  });
});
