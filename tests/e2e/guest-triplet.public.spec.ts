import { expect, test, type Page } from "@playwright/test";

const PICKER = "#guest-spread-picker";

async function openFreshLanding(page: Page) {
  await page.goto("/?app=1");
  await expect(page.getByRole("heading", { name: "Когда нужен разговор с собой" })).toBeVisible();
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

  test("starter-pack CTA opens and focuses the actual picker", async ({ page }) => {
    await openFreshLanding(page);
    const button = page.locator(".editorial-starter-pack").getByRole("button", {
      name: "Сначала открыть 3 карты",
    });
    await button.scrollIntoViewIfNeeded();
    await button.click();
    await expectPickerOpened(page);
  });

});
