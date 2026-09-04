import { expect, test, type Page } from "@playwright/test";
import { PHOTO_AUTH_DRAFT_KEY } from "../../src/lib/photo-auth-draft";

async function fixture(page: Page) {
  let loggedIn = false;
  const calls: string[] = [];
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    calls.push(`${route.request().method()} ${path}`);
    if (path === "/api/auth/me") return route.fulfill({ json: {
      authenticated: loggedIn,
      user: loggedIn ? { sub: "photo-fixture", role: "user", name: "Проверка", profileUserId: "photo-profile", ageConfirmed: true } : null,
    } });
    if (path === "/api/platform/features") return route.fulfill({ json: { recaptcha: { configured: false, masterEnabled: false, scopes: {} } } });
    if (path === "/api/runes/config") return route.fulfill({ json: { enabled: true, starterRunes: 300, rubPerRune: 5, costs: { VISION_ANALYSIS: 30 } } });
    if (path === "/api/runes/balance") return route.fulfill({ json: { balance: 300 } });
    if (path === "/api/photo-reading/pricing") return route.fulfill({ json: { baseCost: 30, effectiveCost: 15, firstPhotoDiscount: true } });
    if (path === "/api/age-gate/confirm") return route.fulfill({ json: { confirmed: true } });
    if (path === "/api/masters") return route.fulfill({ json: { masters: [{ id: "veronika", name: "Вероника", kind: "ai", title: "Таро" }] } });
    if (path === "/api/auth/oauth/providers") return route.fulfill({ json: { providers: [] } });
    return route.fulfill({ json: {} });
  });
  return { calls, login: () => { loggedIn = true; } };
}

test("photo and question survive the registration round trip without an automatic charge", async ({ page }, info) => {
  const f = await fixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?photo=1");
  const dialog = page.getByRole("dialog", { name: /фото-расклад/ });
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await expect(dialog.getByRole("button", { name: /Как сфотографировать/ })).toHaveAttribute("aria-expanded", "false");
  await expect(dialog.getByRole("button", { name: /Загрузить фото/ })).toBeInViewport();
  await dialog.locator('input[type="file"]').last().setInputFiles("public/decks/tarot-veronika/the-fool.webp");
  await dialog.getByLabel("Ваш вопрос (необязательно)").fill("Как подготовиться к разговору?");
  const auth = dialog.getByRole("button", { name: "Сохранить фото и продолжить" });
  await expect(auth).toBeEnabled({ timeout: 15_000 });
  await auth.click();
  await expect(page).toHaveURL(/auth\/user\/register/);
  expect(f.calls.some((c) => c.includes("/photo-reading/recognize"))).toBe(false);
  const saved = await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)!), PHOTO_AUTH_DRAFT_KEY);
  expect(saved.question).toBe("Как подготовиться к разговору?");
  expect(saved.image.base64.length).toBeGreaterThan(100);
  f.login();
  await page.goto("/?photo=1");
  await expect(dialog.getByText("Черновик восстановлен. Проверьте вопрос и продолжите разбор.")).toBeVisible({ timeout: 30_000 });
  await expect(dialog.getByLabel("Ваш вопрос (необязательно)")).toHaveValue(saved.question);
  await expect(dialog.getByAltText("Ваш расклад")).toBeVisible();
  expect(await page.evaluate((key) => sessionStorage.getItem(key), PHOTO_AUTH_DRAFT_KEY)).toBeNull();
  expect(f.calls.some((c) => /POST .*photo-reading\/(recognize|interpret|stream)/.test(c))).toBe(false);
  await page.screenshot({ path: info.outputPath("photo-restored-mobile.png") });
});

test("manual entry returns to manual card selection after authentication", async ({ page }) => {
  const f = await fixture(page);
  await page.goto("/?photo=1&mode=mark");
  await page.getByRole("button", { name: "Собрать расклад вручную" }).click();
  await expect(page).toHaveURL(/auth\/user\/register/);
  const returnTo = new URL(page.url()).searchParams.get("returnTo");
  expect(returnTo).toBe("/?photo=1&mode=mark");
  f.login();
  await page.goto(returnTo!);
  await expect(page.getByRole("dialog", { name: /фото-расклад/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Собрать расклад вручную" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Назад/, exact: true })).toBeVisible();
});

test("photo landing shows the live tariff and a consistent starter offer", async ({ page }, info) => {
  await fixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/photo-rasklad");
  await expect(page.getByTestId("photo-reading-offer")).toContainText("30 ᚢ (150 ₽)");
  await expect(page.getByTestId("photo-reading-offer")).toContainText("без пополнения");
  await expect(page.getByText(/платный цикл|демо-контур/)).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Загрузить фото расклада", exact: true })).toBeInViewport();
  await page.screenshot({ path: info.outputPath("photo-landing-mobile.png") });
});
