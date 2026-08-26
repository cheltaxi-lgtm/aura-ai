import { expect, test, type Page } from "@playwright/test";

const AUTH_GATE = "#guest-teaser-auth";
const REAL_CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

async function startGuestQuestion(page: Page) {
  await page.route("**/api/auth/oauth/providers", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ providers: ["yandex", "vk"] }),
    });
  });
  await page.goto("/?app=1");
  const question = page.locator("#hero-question");
  await expect(question).toBeVisible({ timeout: 20_000 });
  await question.fill("Вернётся ли он ко мне?");
  await page.getByRole("button", { name: /Начать разбор/i }).click();

  const ageConfirm = page.getByRole("button", { name: /Мне есть 18 лет/i });
  if (await ageConfirm.isVisible({ timeout: 4_000 }).catch(() => false)) {
    await ageConfirm.click();
  }

  await expect(page.getByRole("heading", { name: "Выберите три карты" })).toBeVisible({
    timeout: 15_000,
  });
}

async function pickAndRevealTriplet(page: Page) {
  const slots = page.locator("button.deck-pick__slot");
  await expect(slots.first()).toBeVisible();
  await slots.nth(0).click();
  await slots.nth(1).click();
  await slots.nth(2).click();

  await expect(page.getByText(/Нажмите на каждую карту/i)).toBeVisible({ timeout: 15_000 });
  for (const pos of ["Прошлое", "Настоящее", "Будущее"]) {
    const flip = page.getByRole("button", { name: `Открыть ${pos}` });
    if (await flip.count()) {
      await flip.click();
    }
  }

  const finish = page.getByRole("button", { name: /Получить трактовку/i });
  await expect(finish).toBeEnabled({ timeout: 15_000 });
  await finish.click();
}

async function expectAuthGateVisuals(page: Page) {
  const gate = page.locator(AUTH_GATE);
  await expect(gate).toBeVisible({ timeout: 10_000 });
  await expect(gate).toBeInViewport();

  await expect(gate.getByText(/этих карт|эти три карты|не изменятся/i).first()).toBeVisible();
  await expect(gate.getByText(/карты дня/i)).toHaveCount(0);
  await expect(gate.getByText(/рекламн/i)).toHaveCount(0);
  await expect(gate.locator("#guest-oauth-age")).toHaveCount(0);
  await expect(gate.getByText(/Возраст 18\+ подтверждён/i)).toBeVisible();
  await expect(gate.getByText(/Подтвердите возраст и согласие/i)).toHaveCount(0);

  await expect(gate.locator("[data-oauth-provider=yandex]")).toBeVisible({ timeout: 10_000 });
  await expect(gate.locator("[data-oauth-provider=vk]")).toBeVisible();
  await expect(gate.getByRole("button", { name: /Продолжить по email/i })).toBeVisible();

  const emailCta = gate.getByRole("button", { name: /Продолжить по email/i });
  await expect(emailCta).toBeInViewport();

  const storage = await page.evaluate(() => ({
    local: { ...localStorage },
    session: { ...sessionStorage },
  }));
  const blob = JSON.stringify(storage);
  expect(blob).not.toContain('"zovus_guest_resume"');
  expect(blob).not.toContain('"aura_guest_claim"');
  expect(blob).not.toContain('"aura_session_claim"');
}

async function runGuestConversionSmoke(page: Page) {
  await startGuestQuestion(page);
  await pickAndRevealTriplet(page);

  await expect(page.getByText(/Полный разбор этих карт готов/i).first()).toBeVisible({
    timeout: 45_000,
  });
  await expect(page.getByText(/полный разбор именно этих трёх карт/i)).toBeVisible();
  await expect(page.locator(".guest-spread-teaser__text")).toBeVisible({ timeout: 45_000 });

  const cta = page.getByRole("button", { name: /Получить полный разбор/i });
  await expect(cta).toBeEnabled({ timeout: 45_000 });
  await cta.click();

  await expectAuthGateVisuals(page);
}

test.describe("guest conversion live smoke", () => {
  test.use({ userAgent: REAL_CHROME_UA });
  test.setTimeout(90_000);

  test.describe("desktop", () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test("question → cards → teaser → CTA → auth gate", async ({ page }) => {
      await runGuestConversionSmoke(page);
    });
  });

  test.describe("mobile", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("question → cards → teaser → CTA → auth gate", async ({ page }) => {
      await runGuestConversionSmoke(page);
    });
  });
});
