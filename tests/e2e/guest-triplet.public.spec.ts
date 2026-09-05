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
    const button = page.locator(".editorial-hero__question").getByRole("button", {
      name: "Открыть 3 карты бесплатно",
    });
    await expect(button).toBeVisible();
    await page.locator("#hero-question").fill("Как прояснить ситуацию на работе?");
    await button.click();
    await expectPickerOpened(page);
  });

  test("daily guest CTA opens and focuses the actual picker", async ({ page }) => {
    await openFreshLanding(page);
    await page.getByText("Другие возможности Zovus", { exact: true }).click();
    const button = page.locator(".editorial-daily-ritual").getByRole("button", {
      name: /Открыть первые 3 карты/i,
    });
    await expect(button).toBeVisible();
    await button.scrollIntoViewIfNeeded();
    await button.click();
    await expectPickerOpened(page);
  });

});

for (const width of [768, 1440]) {
  test("guest hero fits at " + width, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await openFreshLanding(page);
    const hero = page.locator(".editorial-hero");
    await expect(page.locator(".app-shell-splash")).toHaveCount(0, { timeout: 20000 });
    const bounds = await hero.locator(".hero-question__row").evaluate(el => ({ width: el.clientWidth, scroll: el.scrollWidth }));
    expect(bounds.scroll).toBeLessThanOrEqual(bounds.width + 1);
    await expect(page.locator(".landing-sticky-cta")).toHaveCount(0);
    await page.screenshot({ path: "test-results/guest-hero-" + width + ".png", fullPage: false });
  });
}
