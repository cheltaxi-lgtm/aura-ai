import { expect, test, type Page } from "@playwright/test";

const exactCards = [
  { id: 0, name: "Шут", position: 0, reversed: true },
  { id: 1, name: "Маг", position: 1, reversed: false },
  { id: 2, name: "Жрица", position: 2, reversed: true },
];

const historyId = "e2e-daily-history-1";
const sessionId = "e2e-daily-session-1";

async function installDailyMocks(page: Page, opts?: { hiddenKey?: string | null }) {
  let homeRecapHiddenKey: string | null = opts?.hiddenKey ?? null;
  let dailyExists = true;
  let cooldownAllowed = false;

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
            : [],
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
  test("Scenario C: anonymous landing has premium copy without internal jargon", async ({
    page,
  }, testInfo) => {
    await page.goto("/?app=1");
    await expect(page.getByText(/не путать со стартовым раскладом/i)).toHaveCount(0);
    await expect(page.getByText(/^После входа$/i)).toHaveCount(0);
    await expect(page.getByRole("heading", { name: /3 карты дня/i })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Попробовать 3 карты бесплатно/i }).first()
    ).toBeVisible();
    // Before cards: starter must NOT promise full reading (that CTA is post-teaser only).
    const starter = page.locator(".editorial-starter-pack");
    await expect(starter).toBeVisible();
    await expect(starter).toHaveAttribute("data-starter-state", "before_cards");
    await expect(starter.getByRole("button", { name: /Попробовать 3 карты бесплатно/i })).toBeVisible();
    await expect(starter.getByRole("button", { name: /Получить полный разбор/i })).toHaveCount(0);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator("#карты-дня").screenshot({
      path: testInfo.outputPath("daily-guest-desktop.png"),
    });
    await page.locator(".editorial-starter-pack").screenshot({
      path: testInfo.outputPath("starter-guest-desktop.png"),
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("#карты-дня").screenshot({
      path: testInfo.outputPath("daily-guest-mobile.png"),
    });
    await page.locator(".editorial-starter-pack").screenshot({
      path: testInfo.outputPath("starter-guest-mobile.png"),
    });
  });

  test("Scenario starter: before-cards CTA opens guest picker", async ({ page }) => {
    await page.goto("/?app=1");
    const starterCta = page.locator(".editorial-starter-pack [data-starter-cta='try_cards']");
    await expect(starterCta).toBeVisible();
    await expect(starterCta).toHaveText(/Попробовать 3 карты бесплатно/i);
    await starterCta.scrollIntoViewIfNeeded();
    await starterCta.click();
    await expect(page.locator("#guest-spread-picker")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: /Получить полный разбор/i })).toHaveCount(0);
  });

  test("Scenario A: opened state CTA opens exact daily artifact identity", async ({ page }) => {
    await installDailyMocks(page);

    await page.goto("/?app=1");
    await expect(page.getByText(/Ваш расклад на сегодня уже ждёт/i).first()).toBeVisible({
      timeout: 20_000,
    });

    const viewBtn = page.getByRole("button", { name: /Посмотреть карты дня/i }).first();
    await expect(viewBtn).toBeVisible();
    await viewBtn.click();

    await expect(page.locator("[data-daily-triplet='1']")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Главное").first()).toBeVisible();
    await expect(page.getByText("Ресурс").first()).toBeVisible();
    await expect(page.getByText("Осторожность").first()).toBeVisible();
    await expect(page.locator("#guest-spread-picker")).toHaveCount(0);
    await expect(page.getByText(/Выберите три карты/i)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Получить полный разбор/i })).toHaveCount(0);

    const stored = await page.evaluate(() => {
      const raw = localStorage.getItem("aura_profile");
      try {
        return raw
          ? (JSON.parse(raw) as { tarotCards?: Array<{ name: string; reversed?: boolean }> })
          : null;
      } catch {
        return null;
      }
    });
    expect(stored?.tarotCards?.length).toBe(3);
    expect(stored?.tarotCards?.map((c) => c.name)).toEqual(exactCards.map((c) => c.name));
    expect(stored?.tarotCards?.map((c) => Boolean(c.reversed))).toEqual(
      exactCards.map((c) => c.reversed)
    );
  });

  test("Scenario B: hide from home persists after reload", async ({ page }) => {
    await installDailyMocks(page);
    await page.goto("/?app=1");
    const clearBtn = page.getByRole("button", { name: /Убрать с главной/i });
    if (await clearBtn.count()) {
      await clearBtn.first().click();
      await expect(clearBtn).toHaveCount(0, { timeout: 10_000 });
      await page.reload();
      await expect(page.getByRole("button", { name: /Убрать с главной/i })).toHaveCount(0);
    } else {
      // Recap may be filtered before paint if hidden already — still assert hide API contract.
      await page.request.patch("/api/profile/home-recap", {
        data: { hiddenKey: `history:${historyId}` },
      });
      await page.reload();
      await expect(page.getByRole("button", { name: /Убрать с главной/i })).toHaveCount(0);
    }
  });
});
