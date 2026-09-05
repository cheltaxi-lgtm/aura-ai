import { expect, test, type Page } from "@playwright/test";

// Each flow shares a cold Next dev server; keep this suite sequential for stable hydration.
test.describe.configure({ mode: "default" });

const AUTH_GATE = "#guest-teaser-auth";
const REAL_CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

async function startGuestQuestion(page: Page, entry = "/?app=1", questionText = "Вернётся ли он ко мне?", keepCookieBanner = false) {
  await page.route("**/api/auth/oauth/providers", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ providers: ["yandex", "vk"] }),
    });
  });
  await page.goto(entry);
  const necessaryCookies = page.getByRole("button", { name: "Только необходимые", exact: true });
  if (!keepCookieBanner && await necessaryCookies.isVisible()) await necessaryCookies.click();
  const question = page.locator("#hero-question");
  await expect(question).toBeVisible({ timeout: 20_000 });
  await question.fill(questionText);
  await page.getByRole("button", { name: /Открыть 3 карты бесплатно/i }).click();

  const ageConfirm = page.getByRole("button", { name: /Мне есть 18 лет/i });
  await expect(ageConfirm.or(page.getByRole("heading", { name: "Выберите три карты" }))).toBeVisible({ timeout: 20000 });
  if (await ageConfirm.isVisible()) {
    await ageConfirm.click();
  }

  await expect(page.getByRole("heading", { name: "Выберите три карты" })).toBeVisible({
    timeout: 30_000,
  });
}

async function pickAndRevealTriplet(page: Page) {
  const slots = page.locator("button.deck-pick__slot");
  await expect(slots.first()).toBeVisible();
  await slots.nth(0).click();
  await slots.nth(1).click();
  await slots.nth(2).click();

  // The third choice now saves automatically; no repeated flips or submit tap.

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

  await expect(page.getByText(/Получите полный разбор этих карт/i).first()).toBeVisible({
    timeout: 45_000,
  });
  await expect(page.getByText(/Ваш вопрос и эти карты уже сохранены/i).first()).toBeVisible();
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

test.describe("mobile cache recovery with API fixtures", () => {
  test.use({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  test.setTimeout(90_000);
  for (const failCacheWrite of [false, true]) {
    test(`result and reload continuation, cache write failure=${failCacheWrite}`, async ({ page }) => {
      let confirmed = false;
      let completions = 0;
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/api/age-gate/confirm", async (route) => {
        if (route.request().method() === "POST") confirmed = true;
        await route.fulfill({ json: { ok: true, confirmed } });
      });
      await page.route("**/api/guest-triplet/complete", async (route) => {
        completions++;
        await route.fulfill({ json: { ok: true, expiresAt: new Date(Date.now() + 86_400_000).toISOString() } });
      });
      await page.route("**/api/guest-triplet/teaser", (route) => route.fulfill({ json: { text: "Тестовый краткий результат: уточните условия совместной работы и выберите один небольшой шаг.", isFallback: false } }));
      await page.route("**/api/guest-triplet/status", (route) => route.fulfill({ json: { ok: true, status: "none" } }));
      await startGuestQuestion(page, "/");
      if (failCacheWrite) await page.evaluate(() => {
        const original = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key, value) {
          if (key === "aura_guest_triplet") throw new DOMException("test quota", "QuotaExceededError");
          original.call(this, key, value);
        };
      });
      await pickAndRevealTriplet(page);
      await expect(page.locator(".guest-spread-teaser__text")).toBeVisible({ timeout: 20_000 });
      await expect(page.getByRole("button", { name: "Получить полный разбор", exact: true })).toBeEnabled();
      const originalCards = await page.evaluate(() => JSON.parse(localStorage.getItem("zovus_guest_resume_ui_v1")!).cards);
      await page.reload();
      const resume = page.getByRole("link", { name: "Продолжить сохранённый расклад" });
      await expect(resume).toBeInViewport();
      // Actual click detects fixed-header / hero overlays which isVisible misses.
      await resume.click();
      await expect(page).toHaveURL(/\/auth\/user\/register(?:\?|$)/);
      expect(await page.evaluate(() => JSON.parse(localStorage.getItem("zovus_guest_resume_ui_v1")!).cards)).toEqual(originalCards);
      expect(completions).toBe(1);
      expect(errors).toEqual([]);
    });
  }
});


test.describe("landing question storage failure", () => {
  test.use({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  test.setTimeout(90000);
  for (const entry of ["typed", "chip"] as const) {
    test(`${entry} question survives blocked draft through age confirmation and registration`, async ({ page }) => {
      let confirmed = false;
      let savedQuestion = "";
      let completions = 0;
      const errors: string[] = [];
      page.on("pageerror", e => errors.push(e.message));
      await page.route("**/api/age-gate/confirm", route => {
        if (route.request().method() === "POST") confirmed = true;
        return route.fulfill({ json: { ok: true, confirmed } });
      });
      await page.route("**/api/guest-triplet/status", route => route.fulfill({ json: { ok: true, status: "none" } }));
      await page.route("**/api/auth/oauth/providers", route => route.fulfill({ json: { providers: ["yandex", "vk"] } }));
      await page.route("**/api/guest-triplet/complete", route => {
        completions++;
        savedQuestion = route.request().postDataJSON().question;
        return route.fulfill({ json: { ok: true } });
      });
      await page.route("**/api/guest-triplet/teaser", route => route.fulfill({ json: { text: "Пример для теста: обсудите ожидания и выберите один небольшой шаг." } }));
      await page.addInitScript(() => {
        const get = Storage.prototype.getItem;
        const set = Storage.prototype.setItem;
        Storage.prototype.getItem = function (key) {
          if (key === "zovus_landing_question") throw new DOMException("blocked draft read", "SecurityError");
          return get.call(this, key);
        };
        Storage.prototype.setItem = function (key, value) {
          if (key === "zovus_landing_question") throw new DOMException("blocked draft write", "QuotaExceededError");
          return set.call(this, key, value);
        };
      });
      await page.goto("/");
      await page.getByRole("button", { name: "Только необходимые", exact: true }).click();
      const question = "Как подготовиться к важному разговору?";
      if (entry === "typed") {
        await page.locator("#hero-question").fill(question);
        await page.getByRole("button", { name: "Открыть 3 карты бесплатно", exact: true }).click();
      } else {
        const chip = page.locator(".editorial-hero__pain-chips").getByRole("button").first();
        expect((await chip.boundingBox())!.height).toBeGreaterThanOrEqual(44);
        await chip.click();
      }
      await page.getByRole("button", { name: "Мне есть 18 лет — открыть карты", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Выберите три карты" })).toBeVisible();
      await pickAndRevealTriplet(page);
      await expect(page.locator(".guest-spread-teaser__text")).toBeVisible();
      expect(completions).toBe(1);
      expect(savedQuestion).toBeTruthy();
      if (entry === "typed") expect(savedQuestion).toBe(question);
      await page.getByRole("button", { name: "Получить полный разбор", exact: true }).click();
      await expect(page.locator(AUTH_GATE)).toBeInViewport();
      await page.getByRole("button", { name: "Продолжить по email", exact: true }).click();
      await expect(page).toHaveURL(/method=email/);
      await expect(page.getByRole("heading", { name: "Откройте полный разбор этих карт" })).toBeVisible();
      expect(errors).toEqual([]);
    });
  }
});

test("late registration offer hides competing sticky CTA", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/runes/config", async route => {
    const response = await route.fetch();
    await pending;
    await route.fulfill({ response });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Только необходимые", exact: true }).click();
  await expect(page.locator(".editorial-starter-gift")).toHaveCount(0);
  release();
  const cta = page.getByRole("link", { name: "Создать бесплатный аккаунт", exact: true });
  await expect(cta).toBeVisible();
  await cta.scrollIntoViewIfNeeded();
  await expect(cta).toBeInViewport();
  await expect(page.locator(".landing-sticky-cta")).toHaveAttribute("aria-hidden", "true");
  await cta.click();
  await expect(page).toHaveURL(/\/auth\/user\/register(?:\?|$)/);
});

test.describe("short guest flow regressions", () => {
  test.use({ reducedMotion: "reduce" });
  test.setTimeout(90_000);
  for (const width of [360, 390, 430]) {
    test("long result keeps CTA reachable at " + width + "px", async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.route("**/api/age-gate/confirm", route => route.fulfill({ json: { ok: true, confirmed: true } }));
      let completions = 0;
      let savedCards: unknown;
      await page.route("**/api/guest-triplet/complete", route => {
        completions++;
        savedCards = route.request().postDataJSON().cards;
        return route.fulfill({ json: { ok: true } });
      });
      const longText = "Сравните свои ожидания с тем, что известно о ситуации. ".repeat(10).slice(0, 500);
      await page.route("**/api/guest-triplet/teaser", route => route.fulfill({ json: { text: longText } }));
      await startGuestQuestion(page, width === 430 ? "/" : "/?app=1", "Как мне прояснить ситуацию на работе и спокойно обсудить ожидания с коллегами? ".repeat(3), width === 430);
      const slots = page.locator("button.deck-pick__slot");
      await slots.nth(0).click();
      const firstName = await slots.nth(0).locator("img").first().getAttribute("alt");
      expect(firstName).toBeTruthy();
      await slots.nth(1).click();
      await slots.nth(2).click();
      await expect(page.locator(".guest-spread-teaser__text")).toHaveText(longText);
      expect(completions).toBe(1);
      expect(await page.evaluate(() => JSON.parse(localStorage.getItem("zovus_guest_resume_ui_v1")!).cards)).toEqual(savedCards);
      if (width === 360) await page.addStyleTag({ content: "html { font-size: 24px !important; }" });
      await expect(page.locator(".app-shell-splash")).toHaveCount(0, { timeout: 20000 });
      if (width !== 430) await expect(page.getByRole("navigation", { name: "Навигация приложения" })).toBeVisible();
      const cta = page.getByRole("button", { name: "Получить полный разбор", exact: true });
      await expect(cta).toBeInViewport();
      if (width === 430) await expect(page.getByRole("dialog", { name: "Уведомление о cookie" })).toBeVisible();
      // Check actual hit target before Playwright has an opportunity to scroll.
      expect(await cta.evaluate(el => { const r=el.getBoundingClientRect(); return [r.top + 3, r.y+r.height/2, r.bottom - 3].every(y => el.contains(document.elementFromPoint(r.x+r.width/2, y))); })).toBe(true);
      await expect.poll(() => page.locator("#guest-spread-picker img").evaluateAll(imgs => imgs.every(img => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0))).toBe(true);
      await page.screenshot({ path: "test-results/guest-result-" + width + ".png", fullPage: false });
      await cta.click();
      await expect(page.locator(AUTH_GATE)).toBeInViewport();
      await page.getByRole("button", { name: "Продолжить по email", exact: true }).click();
      await expect(page).toHaveURL(/method=email/);
      await expect(page.getByLabel("Имя *", { exact: true })).toBeVisible({ timeout: 20000 });
      await expect(page.getByRole("heading", { name: "Откройте полный разбор этих карт" })).toBeVisible();
      const order = await page.locator('input[id$="-name"], input[id$="-email"], input[id$="-password"], #terms-consent').evaluateAll(els => els.map(el => el.id));
      expect(order.slice(0, 3)).toEqual(["user-register-name", "user-register-email", "user-register-password"]);
      expect(await page.evaluate(() => JSON.parse(localStorage.getItem("zovus_guest_resume_ui_v1")!).cards)).toEqual(savedCards);
      await expect(page.locator(".app-shell-splash")).toHaveCount(0, { timeout: 20000 });
      await expect(page.getByText(/При первой регистрации — стартовые/).first()).toBeVisible({ timeout: 20000 });
      await page.screenshot({ path: "test-results/guest-register-" + width + ".png", fullPage: true });
    });
  }

  test("failed automatic save waits for retry and keeps the exact cards", async ({ page }) => {
    await page.route("**/api/age-gate/confirm", route => route.fulfill({ json: { ok: true, confirmed: true } }));
    const requests: unknown[] = [];
    await page.route("**/api/guest-triplet/complete", route => {
      requests.push(route.request().postDataJSON());
      return route.fulfill({ status: requests.length === 1 ? 503 : 200, json: { ok: requests.length > 1 } });
    });
    await page.route("**/api/guest-triplet/teaser", route => route.fulfill({ json: { text: "Результат после повторного сохранения." } }));
    await startGuestQuestion(page);
    await pickAndRevealTriplet(page);
    await expect(page.locator("#guest-spread-picker").getByRole("alert")).toContainText("Не удалось сохранить");
    await expect(page.getByRole("button", { name: "Получить полный разбор", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Повторить сохранение", exact: true })).toBeEnabled();
    expect(requests).toHaveLength(1);
    await page.getByRole("button", { name: "Повторить сохранение", exact: true }).click();
    await expect(page.locator(".guest-spread-teaser__text")).toBeVisible();
    expect(requests).toHaveLength(2);
    expect(requests[1]).toEqual(requests[0]);
  });

  test("leaving while saving cannot reopen the result", async ({ page }) => {
    await page.route("**/api/age-gate/confirm", route => route.fulfill({ json: { ok: true, confirmed: true } }));
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    await page.route("**/api/guest-triplet/complete", async route => { await pending; await route.fulfill({ json: { ok: true } }).catch(() => undefined); });
    await startGuestQuestion(page);
    const request = page.waitForRequest("**/api/guest-triplet/complete");
    await pickAndRevealTriplet(page);
    await request;
    await page.getByRole("button", { name: "На главную", exact: true }).click();
    release();
    await expect(page.locator(".editorial-hero")).toBeInViewport();
    await expect(page.locator(".guest-spread-teaser")).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem("zovus_guest_resume_ui_v1"))).toBeNull();
  });
});
