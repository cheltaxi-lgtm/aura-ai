import { expect, test, type Page } from "@playwright/test";
import { randomBytes } from "node:crypto";
import sharp from "sharp";
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
    if (path === "/api/auth/user/register" && route.request().method() === "POST") {
      loggedIn = true;
      return route.fulfill({ json: {
        ok: true,
        user: { id: "photo-fixture", email: "photo@example.test", name: "Проверка" },
        profile: { id: "photo-profile", name: "Проверка", birthDate: "", gender: "female", tarotCards: [] },
        starterRunes: 300,
        needsProfile: false,
      } });
    }
    if (path === "/api/platform/features") return route.fulfill({ json: { recaptcha: { configured: false, masterEnabled: false, scopes: {} } } });
    if (path === "/api/runes/config") return route.fulfill({ json: { enabled: true, starterRunes: 300, rubPerRune: 5, costs: { VISION_ANALYSIS: 30 } } });
    if (path === "/api/runes/balance") return route.fulfill({ json: { balance: 300 } });
    if (path === "/api/photo-reading/recognize" && route.request().method() === "POST") return route.fulfill({ json: {
      guest: !loggedIn,
      detectedCards: ["Шут"],
      deckType: "Таро Райдера — Уэйта",
      spreadType: "Одна карта",
      confidence: "high",
      partial: false,
      redrawSpread: {
        system: "tarot-veronika",
        deckType: "Таро Райдера — Уэйта",
        spreadType: "Одна карта",
        cards: [{
          name: "Шут", originalName: "Шут", reversed: false, position: "Суть вопроса",
          imagePath: "/decks/tarot-veronika/the-fool.webp", shortMeaning: "Новое начало",
          placeholder: false, order: 0, confidence: "high",
        }],
      },
    } });
    if (path === "/api/photo-reading/pricing") return route.fulfill({ json: { baseCost: 30, effectiveCost: 15, firstPhotoDiscount: true } });
    if (path === "/api/age-gate/confirm") return route.fulfill({ json: { confirmed: true } });
    if (path === "/api/masters") return route.fulfill({ json: { masters: [{ id: "veronika", name: "Вероника", kind: "ai", title: "Таро" }] } });
    if (path === "/api/auth/oauth/providers") return route.fulfill({ json: { providers: [] } });
    return route.fulfill({ json: {} });
  });
  return { calls, login: () => { loggedIn = true; } };
}

async function realisticPhonePhoto() {
  const width = 2200;
  const height = 1650;
  return sharp(randomBytes(width * height * 3), { raw: { width, height, channels: 3 } })
    .jpeg({ quality: 95 })
    .toBuffer();
}

test("the guest sees recognized cards before registration and resumes them without an automatic charge", async ({ page }, info) => {
  const f = await fixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?photo=1");
  const dialog = page.getByRole("dialog", { name: /фото-расклад/ });
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await expect(dialog.getByRole("button", { name: /Как сфотографировать/ })).toHaveAttribute("aria-expanded", "false");
  await expect(dialog.getByRole("button", { name: /Загрузить фото/ })).toBeInViewport();
  await dialog.locator('input[type="file"]').last().setInputFiles("public/decks/tarot-veronika/the-fool.webp");
  await dialog.getByLabel("Ваш вопрос (необязательно)").fill("Как подготовиться к разговору?");
  const recognize = dialog.getByRole("button", { name: "Распознать карты бесплатно" });
  await expect(recognize).toBeEnabled({ timeout: 15_000 });
  await recognize.click();
  await expect(dialog.getByText("Расклад распознан")).toBeVisible({ timeout: 15_000 });
  await expect(dialog.getByText("В центре расклада — «Шут»")).toBeVisible();
  await expect(dialog.getByLabel("Результат распознавания: проверьте расклад")).toBeFocused();
  await expect(dialog.getByAltText("Распознанная карта: Шут")).toBeInViewport();
  await expect(dialog.getByRole("button", { name: "Открыть полный разбор" })).toBeInViewport();
  await page.screenshot({ path: info.outputPath("photo-guest-teaser-mobile.png") });
  await expect(page).not.toHaveURL(/auth\/user\/(login|register)/);
  expect(f.calls.filter((c) => c === "POST /api/photo-reading/recognize")).toHaveLength(1);
  expect(f.calls.some((c) => /photo-reading\/(interpret|stream)/.test(c))).toBe(false);

  await dialog.getByRole("button", { name: "Открыть полный разбор" }).click();
  await expect(page).toHaveURL(/auth\/user\/register/);
  await page.waitForLoadState("domcontentloaded");
  const saved = await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)!), PHOTO_AUTH_DRAFT_KEY);
  expect(saved.question).toBe("Как подготовиться к разговору?");
  expect(saved.image.base64.length).toBeGreaterThan(100);
  expect(saved.recognized.detectedCards).toEqual(["Шут"]);
  f.login();
  try {
    await page.goto("/?photo=1", { waitUntil: "domcontentloaded" });
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("ERR_ABORTED")) throw error;
  }
  await expect(dialog.getByText("Карты уже распознаны — проверьте расклад и откройте полную расшифровку.")).toBeVisible({ timeout: 30_000 });
  await expect(dialog.getByRole("button", { name: "Подтвердить" })).toBeVisible();
  expect(await page.evaluate((key) => sessionStorage.getItem(key), PHOTO_AUTH_DRAFT_KEY)).toBeNull();
  expect(f.calls.filter((c) => c === "POST /api/photo-reading/recognize")).toHaveLength(1);
  expect(f.calls.some((c) => /POST .*photo-reading\/(interpret|stream)/.test(c))).toBe(false);
  await page.screenshot({ path: info.outputPath("photo-restored-mobile.png") });
});

test("manual entry lets a guest choose cards before authentication and resumes after it", async ({ page }) => {
  const f = await fixture(page);
  await page.goto("/?photo=1&mode=mark");
  await expect(page).not.toHaveURL(/auth\/user\/register/);
  await expect(page.getByRole("button", { name: "Собрать расклад вручную" })).toHaveCount(0);
  await page.getByRole("button", { name: "Добавить символ" }).click();
  await page.locator(".photo-spread-preview__picker-option").first().click();
  await page.getByRole("button", { name: "Открыть полный разбор" }).click();
  await expect(page).toHaveURL(/auth\/user\/register/);
  await page.waitForLoadState("domcontentloaded");
  const returnTo = new URL(page.url()).searchParams.get("returnTo");
  expect(returnTo).toBe("/?photo=1&mode=mark");
  f.login();
  await page.goto(returnTo!);
  await expect(page.getByRole("dialog", { name: /фото-расклад/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Собрать расклад вручную" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Назад/, exact: true })).toBeVisible();
});

test("a realistic phone photo survives the complete email registration route", async ({ page }) => {
  await fixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/photo-rasklad");
  await page.getByRole("link", { name: "Загрузить фото расклада", exact: true }).click();

  const dialog = page.getByRole("dialog", { name: /фото-расклад/ });
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await dialog.locator('input[type="file"]').last().setInputFiles({
    name: "phone-spread.jpg",
    mimeType: "image/jpeg",
    buffer: await realisticPhonePhoto(),
  });
  await dialog.getByLabel("Ваш вопрос (необязательно)").fill("Что важно увидеть в этой ситуации?");
  await dialog.getByRole("button", { name: "Распознать карты бесплатно" }).click();
  await expect(dialog.getByText("Расклад распознан")).toBeVisible({ timeout: 15_000 });
  await dialog.getByRole("button", { name: "Открыть полный разбор" }).click();

  await expect(page).toHaveURL(/auth\/user\/register/);
  const savedBeforeRegister = await page.evaluate((key) => sessionStorage.getItem(key), PHOTO_AUTH_DRAFT_KEY);
  expect(savedBeforeRegister).not.toBeNull();
  expect(savedBeforeRegister!.length).toBeGreaterThan(100_000);

  await page.getByRole("button", { name: "Продолжить по email" }).click();
  await page.getByLabel(/Я согласен/).check();
  await page.getByLabel("Имя *").fill("Проверка");
  await page.getByLabel("Email *").fill("photo@example.test");
  await page.getByLabel("Пароль *").fill("Photo-test-2026");
  await page.getByRole("button", { name: "Создать аккаунт и открыть разбор" }).click();

  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await expect(dialog.getByText("Карты уже распознаны — проверьте расклад и откройте полную расшифровку.")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Подтвердить" })).toBeVisible();
  expect(await page.evaluate((key) => sessionStorage.getItem(key), PHOTO_AUTH_DRAFT_KEY)).toBeNull();
});

test("the guest gets immediate feedback while the photo workspace is loading", async ({ page }) => {
  await fixture(page);
  await page.goto("/photo-rasklad");
  await page.getByRole("link", { name: "Загрузить фото расклада", exact: true }).click();

  await expect(page.getByRole("status", { name: "Открываем фото-расклад" })).toBeVisible({
    timeout: 1_000,
  });
  await expect(page.getByRole("dialog", { name: /фото-расклад/ })).toBeVisible({
    timeout: 30_000,
  });
  const dialog = page.getByRole("dialog", { name: /фото-расклад/ });
  await expect.poll(() => dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
});

test("a cold photo deep link shows a recoverable workspace loader", async ({ page }) => {
  await fixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/*PhotoReadingFlow*.js", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2_500));
    await route.continue();
  });
  await page.goto("/?photo=1", { waitUntil: "domcontentloaded" });

  const loader = page.locator('[data-flow-overlay="true"] [role="status"]');
  await expect(loader).toHaveAccessibleName("Открываем фото-расклад");
  await expect(loader).toBeVisible({
    timeout: 1_000,
  });
  await expect(loader.getByRole("button", { name: "Вернуться на главную" })).toBeInViewport();
  expect(await loader.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const topmost = document.elementFromPoint(rect.left + rect.width / 2, rect.bottom - 8);
    return Boolean(topmost && element.contains(topmost));
  })).toBe(true);
  await expect(page.getByRole("dialog", { name: /фото-расклад/ })).toBeVisible({
    timeout: 30_000,
  });
});

test("closing the guest workspace releases the local photo blob", async ({ page }) => {
  await fixture(page);
  await page.addInitScript(() => {
    const original = URL.revokeObjectURL.bind(URL);
    const revoked: string[] = [];
    Object.defineProperty(window, "__photoRevokedUrls", { value: revoked });
    URL.revokeObjectURL = (url: string) => {
      revoked.push(url);
      original(url);
    };
  });
  await page.goto("/?photo=1");
  const dialog = page.getByRole("dialog", { name: /фото-расклад/ });
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await dialog.locator('input[type="file"]').last().setInputFiles("public/decks/tarot-veronika/the-fool.webp");
  const previewUrl = await dialog.getByAltText("Ваш расклад").getAttribute("src");
  expect(previewUrl).toMatch(/^blob:/);

  await dialog.getByRole("button", { name: "Закрыть окно" }).click();
  await expect(dialog).toHaveCount(0);
  const revoked = await page.evaluate(() => (window as typeof window & { __photoRevokedUrls: string[] }).__photoRevokedUrls);
  expect(revoked).toContain(previewUrl);
});

test("switching from the guest Tarot picker to Photo never leaves a stale picker underneath", async ({ page }) => {
  await fixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?spread=1");
  await expect(page.getByText("Выберите три карты", { exact: true })).toBeVisible({ timeout: 30_000 });

  await page.goto("/?photo=1");
  const dialog = page.getByRole("dialog", { name: /фото-расклад/ });
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await dialog.getByRole("button", { name: "Закрыть окно" }).click();
  await expect(page).toHaveURL(/\/photo-rasklad$/, { timeout: 10_000 });
  await expect(page.getByText("Выберите три карты", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Расшифровка Таро по фото онлайн" })).toBeVisible();
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
