import { expect, test, type Page } from "@playwright/test";

const PICKER = "#guest-spread-picker";

async function openFreshLanding(page: Page) {
  await page.goto("/?app=1");
  await expect(page.locator(".editorial-starter-pack, .editorial-hero").first()).toBeVisible({
    timeout: 20_000,
  });
}

async function expectPickerOpened(page: Page) {
  const picker = page.locator(PICKER);
  await expect(picker).toBeVisible();
  await expect(picker).toBeFocused();
  await expect(page.getByRole("heading", { name: "Сервис только для взрослых 18+" })).toBeVisible();
}

test.describe("mobile guest triplet entry points", () => {
  test("hero CTA opens and focuses the actual picker", async ({ page }) => {
    await openFreshLanding(page);
    const button = page.locator(".editorial-hero__actions").getByRole("button", {
      name: "Открыть 3 карты",
    });
    await expect(button).toBeVisible();
    await button.click();
    await expectPickerOpened(page);
  });

  test("daily guest CTA opens and focuses the actual picker", async ({ page }) => {
    await openFreshLanding(page);
    const button = page.locator(".editorial-daily-ritual").getByRole("button", {
      name: /Открыть первые 3 карты/i,
    });
    await expect(button).toBeVisible();
    await button.scrollIntoViewIfNeeded();
    await button.click();
    await expectPickerOpened(page);
  });

});
