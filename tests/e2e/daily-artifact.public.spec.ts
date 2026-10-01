import { expect, test, type Page } from "@playwright/test";

const exactCards = [
  { id: 0, name: "Шут", position: 0, reversed: true },
  { id: 1, name: "Маг", position: 1, reversed: false },
  { id: 2, name: "Жрица", position: 2, reversed: true },
];
const dailyCards = exactCards.map((card, index) => ({
  ...card,
  position: ["Утро", "День", "Вечер"][index],
}));

const historyId = "e2e-daily-history-1";
const sessionId = "e2e-daily-session-1";

async function installDailyMocks(page: Page, opts?: { hiddenKey?: string | null; dailyExists?: boolean; hasEmail?: boolean; masterReminder?: boolean; previousMatrixMaster?: boolean }) {
  let homeRecapHiddenKey: string | null = opts?.hiddenKey ?? null;
  let dailyExists = opts?.dailyExists ?? true;
  let cooldownAllowed = false;
  let masterReminder = opts?.masterReminder ?? true;

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (path === "/api/auth/me") {
      return route.fulfill({
        json: {
          authenticated: true,
          user: {
            sub: "e2e-daily",
            role: "user",
            email: "daily-e2e@example.invalid",
            name: "Ева",
            profileUserId: "e2e-profile",
          },
        },
      });
    }

    if (path === "/api/profile" && request.method() === "GET") {
      return route.fulfill({
        json: {
          profileUserId: "e2e-profile",
          needsProfile: false,
          profile: {
            name: "Ева",
            gender: "female",
            birthDate: null,
            zodiac: null,
            astroMeta: homeRecapHiddenKey ? { homeRecapHiddenKey } : {},
          },
          readings: dailyExists
            ? [
                {
                  id: historyId,
                  characterName: "triplet",
                  createdAt: new Date().toISOString(),
                  contextData: {
                    type: "daily_triplet",
                    spreadType: "daily",
                    tarotCards: exactCards,
                    masterId: "veronika",
                    deckSystem: "tarot-veronika",
                  },
                },
              ]
            : opts?.previousMatrixMaster ? [{
                id: "matrix-master-spread", characterName: "triplet", createdAt: new Date().toISOString(),
                contextData: { type: "intro_triplet", masterId: "numerolog", deckSystem: "numerology",
                  tarotCards: ["6", "9", "33"].map((name, id) => ({ id, name, position: id, reversed: false })) },
              }] : [],
          continueMasterIds: ["veronika"],
          tripletCooldown: {
            allowed: cooldownAllowed,
            nextAvailableAt: cooldownAllowed
              ? null
              : new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            lastTripletAt: new Date().toISOString(),
          },
          currentDailyReading: dailyExists
            ? {
                exists: true,
                historyId,
                sessionId,
                masterId: "veronika",
                deckSystem: "tarot-veronika",
                cards: exactCards,
                cardNames: exactCards.map((c) => c.name),
                cardsKey: exactCards.map((c) => c.name).join("|"),
                createdAt: new Date().toISOString(),
                recapKey: `history:${historyId}`,
              }
            : { exists: false },
          homeRecapHiddenKey,
          hasConsultationActivity: true,
        },
      });
    }

    if (path === "/api/profile/home-recap" && request.method() === "PATCH") {
      const body = request.postDataJSON() as { hiddenKey?: string };
      homeRecapHiddenKey = body.hiddenKey?.trim() || null;
      return route.fulfill({ json: { ok: true, homeRecapHiddenKey } });
    }

    if (path === "/api/profile/contact-email") {
      if (request.method() === "POST") return route.fulfill({ json: { ok: true } });
      return route.fulfill({ json: {
        hasEmail: opts?.hasEmail !== false,
        hasContactEmail: false,
        masterReminder,
        dailyCardsReminder: opts?.hasEmail !== false && masterReminder,
      } });
    }

    if (path === "/api/auth/daily-cards-reminder") {
      if (request.method() === "PATCH") {
        masterReminder = request.postDataJSON().dailyCardsReminder === true;
      }
      return route.fulfill({ json: { dailyCardsReminder: masterReminder } });
    }

    if (path === "/api/daily-reading" && request.method() === "GET") {
      return route.fulfill({
        json: {
          drawn: dailyExists,
          text: dailyExists ? "Ваш день раскрывается спокойно: утром выберите главное, днём сохраните фокус, вечером подведите итог." : null,
          cards: dailyExists ? dailyCards : [],
          system: dailyExists ? "tarot-veronika" : null,
          spreadId: dailyExists ? "triplet" : null,
          locked: false,
          purged: false,
        },
      });
    }

    if (path === "/api/daily-reading" && request.method() === "POST") {
      dailyExists = true;
      return route.fulfill({
        json: {
          drawn: true,
          text: "Ваш день раскрывается спокойно: утром выберите главное, днём сохраните фокус, вечером подведите итог.",
          cards: dailyCards,
          system: "tarot-veronika",
          spreadId: "triplet",
        },
      });
    }

    if (path === "/api/tarot/daily" && request.method() === "POST") {
      const body = request.postDataJSON() as { cards?: typeof exactCards };
      const cards = body.cards ?? exactCards;
      dailyExists = true;
      cooldownAllowed = false;
      return route.fulfill({
        json: {
          ok: true,
          daily: {
            exists: true,
            historyId,
            sessionId: null,
            masterId: "veronika",
            deckSystem: "tarot-veronika",
            cards,
            cardNames: cards.map((c) => c.name),
            cardsKey: cards.map((c) => c.name).join("|"),
            createdAt: new Date().toISOString(),
            recapKey: `history:${historyId}`,
          },
          nextAvailableAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        },
      });
    }

    if (path === "/api/masters") {
      return route.fulfill({
        json: {
          masters: [
            {
              id: "veronika",
              name: "Вероника",
              system: "tarot-veronika",
              role: "Таро",
            },
          ],
        },
      });
    }

    if (path === "/api/runes/balance") {
      return route.fulfill({ json: { balance: 30 } });
    }

    if (path.startsWith("/api/sessions")) {
      return route.fulfill({ json: { sessions: [] } });
    }

    return route.fulfill({ status: 200, json: {} });
  });
}

test.describe("daily artifact + landing copy", () => {
  test("Matrix master cannot replace daily Tarot cards or their images", async ({ page }, testInfo) => {
    await installDailyMocks(page, { dailyExists: false, previousMatrixMaster: true });
    await page.addInitScript(() => localStorage.setItem("aura_last_master", "numerolog"));
    await page.goto("/?app=1");
    await page.locator(".editorial-hero--logged-in").getByRole("button", { name: "Открыть бесплатно · расклад на сутки" }).click();
    const dialog = page.getByRole("dialog", { name: "Расклад на сутки" });
    const drawRequest = page.waitForRequest(request => new URL(request.url()).pathname === "/api/daily-reading" && request.method() === "POST");
    await dialog.getByRole("button", { name: "Начать бесплатный расклад · 0 рун" }).click();
    expect((await drawRequest).postDataJSON()).toMatchObject({ characterKey: "veronika" });
    for (let i = 0; i < exactCards.length; i++) await dialog.getByRole("button", { name: "Открыть карту" }).first().click();
    for (const card of exactCards) await expect(dialog).toContainText(card.name);
    const faces = dialog.locator('img[src*="/decks/tarot-veronika/"]');
    await expect(faces).toHaveCount(3);
    await expect.poll(() => faces.evaluateAll(images => images.every(img => (img as HTMLImageElement).naturalWidth > 0))).toBe(true);
    await page.setViewportSize({ width: 1280, height: 900 });
    await dialog.screenshot({ path: testInfo.outputPath("daily-matrix-tarot-desktop.png") });
    await page.setViewportSize({ width: 390, height: 844 });
    await dialog.screenshot({ path: testInfo.outputPath("daily-matrix-tarot-mobile.png") });
  });

  test("Scenario C: anonymous landing has premium copy without internal jargon", async ({
    page,
  }, testInfo) => {
    await page.route("**/api/runes/config", (route) => route.fulfill({
      json: { enabled: true, starterRunes: 100, rubPerRune: 2, freeQuestions: 2,
        costs: { VISION_ANALYSIS: 30, READING: 15, NUMEROLOGY_SESSION: 100 } },
    }));
    await page.goto("/?app=1");
    await expect(page.getByText(/не путать со стартовым раскладом/i)).toHaveCount(0);
    await expect(page.getByText(/^После входа$/i)).toHaveCount(0);
    await expect(page.getByRole("heading", { name: /Расклад на сутки — каждый день/i })).toBeVisible();
    await expect(page.locator(".app-shell-splash")).toHaveCount(0, { timeout: 20_000 });
    await expect(
      page.getByRole("button", { name: "Открыть 3 карты бесплатно" }).first()
    ).toBeVisible();
    // Before cards: starter must NOT promise full reading (that CTA is post-teaser only).
    const starter = page.locator(".editorial-starter-gift");
    await expect(starter).toBeVisible();
    await expect(starter.getByRole("link", { name: "Создать бесплатный аккаунт", exact: true })).toBeVisible();
    await expect(starter.getByRole("link", { name: /Получить полный разбор/i })).toHaveCount(0);
    await expect(starter.getByRole("button", { name: /Получить полный разбор/i })).toHaveCount(0);

    await page.setViewportSize({ width: 1440, height: 900 });
    const dailySection = page.locator("#карты-дня");
    await dailySection.scrollIntoViewIfNeeded();
    await expect(dailySection).toHaveClass(/salon-reveal--in/);
    await expect(dailySection).toHaveCSS("opacity", "1");
    await expect(dailySection.locator("h2")).toHaveCSS("opacity", "1");
    await dailySection.screenshot({
      path: testInfo.outputPath("daily-guest-desktop.png"),
    });
    await starter.screenshot({
      path: testInfo.outputPath("starter-guest-desktop.png"),
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await dailySection.screenshot({
      path: testInfo.outputPath("daily-guest-mobile.png"),
    });
    await starter.screenshot({
      path: testInfo.outputPath("starter-guest-mobile.png"),
    });
  });

  test("Scenario daily guest: daily CTA opens registration with a daily return", async ({ page }) => {
    await page.goto("/?app=1");
    const dailyCta = page.locator(".editorial-daily-ritual").getByRole("button", { name: "Открыть расклад на сутки" });
    await expect(dailyCta).toBeVisible();
    await dailyCta.click();
    await expect(page).toHaveURL(/\/auth\/user\/register\?returnTo=/);
    expect(new URL(new URL(page.url()).searchParams.get("returnTo")!, "https://zovus.ru").searchParams.get("daily")).toBe("1");
    await expect(page.getByRole("button", { name: /Получить полный разбор/i })).toHaveCount(0);
  });

  test("Scenario A: header reopens the exact existing daily artifact", async ({ page }) => {
    await installDailyMocks(page);
    await page.goto("/?app=1");
    await expect(page.getByRole("heading", { name: "С возвращением, Ева" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("button", { name: "Расклад Таро Продолжить с Вероника" })).toBeVisible();

    const viewBtn = page.getByRole("banner").getByRole("button", { name: "Расклад на сутки", exact: true });
    await expect(viewBtn).toBeVisible();
    await viewBtn.click();
    const dialog = page.getByRole("dialog", { name: "Расклад на сутки" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Ваш день раскрывается спокойно");
    for (const card of exactCards) await expect(dialog).toContainText(card.name);
  });

  test("logged-in header opens the daily reading directly from another page", async ({ page }) => {
    await installDailyMocks(page, { dailyExists: false });
    await page.goto("/about");
    await page.getByRole("banner").getByRole("button", { name: "Расклад на сутки", exact: true }).click();
    await expect(page).toHaveURL(/\?daily=1/);
    await expect(page.getByRole("dialog", { name: "Расклад на сутки" })).toBeVisible();
  });

  test("account without a usable mailbox can add one beside the daily reading", async ({ page }) => {
    await installDailyMocks(page, { hasEmail: false, dailyExists: false });
    await page.goto("/?app=1");
    const contact = page.getByRole("complementary", { name: "Напоминания о раскладе на сутки" });
    await expect(contact).toBeVisible({ timeout: 20_000 });
    await contact.getByText("Настроить письма и Telegram", { exact: true }).click();
    await contact.getByRole("textbox", { name: "Адрес для уведомлений" }).fill("reader@example.com");
    const sent = page.waitForRequest((request) => request.url().includes("/api/profile/contact-email") && request.method() === "POST");
    await contact.getByRole("button", { name: "Подтвердить почту и включить письмо" }).click();
    expect((await sent).postDataJSON()).toMatchObject({ email: "reader@example.com", dailyReminder: true });
    await expect(contact).toContainText("письмо с подтверждением отправлено");
  });

  test("daily status failure offers a retry and restores the existing reading", async ({ page }) => {
    await installDailyMocks(page);
    let statusReads = 0;
    let statusRecovered = false;
    await page.route("**/api/daily-reading?*", async (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      statusReads += 1;
      if (!statusRecovered) return route.fulfill({ status: 503, json: { error: "unavailable" } });
      return route.fallback();
    });
    await page.goto("/?app=1");
    const daily = page.locator(".ritual-cta-banner");
    await expect(daily.getByText("Не удалось проверить расклад.")).toBeVisible();
    statusRecovered = true;
    await daily.getByRole("button", { name: "Повторить" }).click();
    await expect(daily.getByRole("button", { name: "Смотреть" })).toBeVisible();
    expect(statusReads).toBeGreaterThanOrEqual(2);
  });

  test("a completed background reading stays visible when the status lookup fails", async ({ page }) => {
    await installDailyMocks(page, { dailyExists: false });
    const localDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Moscow", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date());
    await page.addInitScript(() => {
      localStorage.setItem("aura:daily-reading-active-job", "e2e-daily-job");
      localStorage.setItem("aura:daily-reading-active-job-started", String(Date.now()));
    });
    await page.route("**/api/daily-reading?*", (route) => route.fulfill({ status: 503, json: { error: "unavailable" } }));
    await page.route("**/api/jobs/e2e-daily-job", (route) => route.fulfill({ json: {
      status: "completed",
      result: { localDate, drawn: true, text: "Восстановленный расклад на сутки", cards: dailyCards,
        system: "tarot-veronika", spreadId: "triplet" },
    } }));
    await page.goto("/?app=1");
    const daily = page.locator(".ritual-cta-banner");
    await expect(daily.getByRole("button", { name: "Смотреть" })).toBeVisible();
    await daily.getByRole("button", { name: "Смотреть" }).click();
    await expect(page.getByRole("dialog", { name: "Расклад на сутки" })).toContainText("Восстановленный расклад на сутки");
  });

  test("a failing daily deep link leaves the page scrollable", async ({ page }) => {
    await installDailyMocks(page, { dailyExists: false });
    await page.route("**/api/daily-reading?*", (route) => route.fulfill({ status: 503, json: { error: "unavailable" } }));
    await page.goto("/?daily=1&app=1");
    await expect(page.locator(".ritual-cta-banner").getByRole("button", { name: "Повторить" })).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Расклад на сутки" })).toHaveCount(0);
    await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
  });

  test("a completed reading from the previous product day cannot replace today's reading", async ({ page }) => {
    await installDailyMocks(page, { dailyExists: false });
    const yesterday = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Moscow", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date(Date.now() - 86_400_000));
    await page.route("**/api/daily-reading", (route) => route.fulfill({ json: {
      localDate: yesterday, drawn: true, text: "Вчерашний расклад",
      cards: dailyCards, system: "tarot-veronika", spreadId: "triplet",
    } }));
    await page.goto("/?app=1");
    await page.locator(".editorial-hero--logged-in").getByRole("button", { name: "Открыть бесплатно · расклад на сутки" }).click();
    const dialog = page.getByRole("dialog", { name: "Расклад на сутки" });
    await dialog.getByRole("button", { name: "Начать бесплатный расклад · 0 рун" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText("Вчерашний расклад")).toHaveCount(0);
    await expect(page.locator(".ritual-cta-banner").getByRole("button", { name: "Разложить" })).toBeVisible();
  });

  test("email reminder card and home switch stay in sync", async ({ page }) => {
    await installDailyMocks(page, { masterReminder: false });
    await page.goto("/?app=1");
    const switcher = page.getByRole("checkbox", { name: "Напоминать о раскладе на сутки" });
    const contact = page.getByRole("complementary", { name: "Напоминания о раскладе на сутки" });
    await expect(switcher).not.toBeChecked();
    await contact.getByText("Настроить письма и Telegram", { exact: true }).click();
    await contact.getByRole("button", { name: "Включить письмо о раскладе" }).click();
    await expect(switcher).toBeChecked();
    await expect(contact.getByRole("button", { name: "Включить письмо о раскладе" })).toHaveCount(0);
    await switcher.uncheck();
    await contact.getByText("Настроить письма и Telegram", { exact: true }).click();
    await expect(contact.getByRole("button", { name: "Включить письмо о раскладе" })).toBeVisible();
  });

  test("free daily reading starts from the logged-in hero without showing a paid choice first", async ({ page }, testInfo) => {
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    await installDailyMocks(page, { dailyExists: false });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/?app=1");

    const hero = page.locator(".editorial-hero--logged-in");
    await expect(hero.getByRole("button", { name: "Открыть бесплатно · расклад на сутки" })).toBeVisible({ timeout: 20_000 });
    await expect(page.locator(".app-shell-splash")).toHaveCount(0, { timeout: 20_000 });
    await page.setViewportSize({ width: 1280, height: 800 });
    await hero.screenshot({ path: testInfo.outputPath("daily-free-hero-desktop.png") });
    await page.setViewportSize({ width: 390, height: 844 });
    await hero.screenshot({ path: testInfo.outputPath("daily-free-hero-mobile.png") });
    await hero.getByRole("button", { name: "Открыть бесплатно · расклад на сутки" }).click();

    const dialog = page.getByRole("dialog", { name: "Расклад на сутки" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Начать бесплатный расклад · 0 рун" })).toBeVisible();
    for (const position of ["Утро", "День", "Вечер"]) {
      await expect(dialog.getByText(position, { exact: true })).toHaveCount(1);
    }
    await expect(dialog.getByText("Прошлое", { exact: true })).toHaveCount(0);
    await expect(dialog.getByText("Настоящее", { exact: true })).toHaveCount(0);
    await expect(dialog.getByText("Будущее", { exact: true })).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: /Расширить до 7 карт/ })).toHaveCount(0);
    await dialog.getByRole("button", { name: "Начать бесплатный расклад · 0 рун" }).click();
    for (let i = 0; i < exactCards.length; i += 1) {
      await dialog.getByRole("button", { name: "Открыть карту" }).first().click();
    }
    await expect(dialog).toContainText("Ваш день раскрывается спокойно");
    await expect(dialog.getByRole("button", { name: /Расширить до 7 карт/ })).toBeVisible();
    await expect(dialog.getByRole("link", { name: "Открыть в истории" })).toHaveAttribute("href", "/cabinet?tab=history");
    await expect(dialog).toContainText("Новый бесплатный расклад будет доступен завтра.");
    const freeResult = dialog.getByText("Ваш день раскрывается спокойно", { exact: false });
    const upgrade = dialog.getByRole("button", { name: /Расширить до 7 карт/ });
    expect(await freeResult.evaluate((element) => element.getBoundingClientRect().top)).toBeLessThan(
      await upgrade.evaluate((element) => element.getBoundingClientRect().top)
    );
    await dialog.screenshot({ path: testInfo.outputPath("daily-free-result-mobile.png") });
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("Scenario B: a server-hidden recap stays absent after reload", async ({ page }) => {
    await installDailyMocks(page, { hiddenKey: `history:${historyId}` });
    await page.goto("/?app=1");
    await expect(page.getByRole("heading", { name: "С возвращением, Ева" })).toBeVisible();
    const recap = page.getByRole("button", { name: "Расклад Таро Продолжить с Вероника" });
    await expect(recap).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("heading", { name: "С возвращением, Ева" })).toBeVisible();
    await expect(recap).toHaveCount(0);
  });
});
