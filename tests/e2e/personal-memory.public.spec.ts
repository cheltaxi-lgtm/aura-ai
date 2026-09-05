import { expect, test } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { SignJWT } from "jose";
import { randomUUID } from "node:crypto";

for (const width of [390, 1280]) {
  test(`memory works visibly: source, search, correction, failure and deletion (${width})`, async ({ page, baseURL }, testInfo) => {
    test.skip(!baseURL || !["127.0.0.1", "localhost"].includes(new URL(baseURL).hostname), "Synthetic identity is local-only");
    loadEnvConfig(process.cwd(), true);
    const token = await new SignJWT({ role: "user", tv: 0 }).setSubject(randomUUID())
      .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("5m")
      .sign(new TextEncoder().encode(process.env.AUTH_SECRET || "dev-secret-change-in-production"));
    await page.context().addCookies([{ name: "aura_auth", value: token, url: baseURL!, httpOnly: true, sameSite: "Lax" }]);
    await page.route("**/*", route => new URL(route.request().url()).origin === new URL(baseURL!).origin ? route.continue() : route.abort());
    await page.setViewportSize({ width, height: 900 });
    let fact = { id: "10000000-0000-4000-8000-000000000001", fact: "Клиент ищет работу дизайнером", category: "work", status: "active", salience: 4,
      sourceType: "chat", sourceCapturedAt: "2026-09-05T12:00:00Z", evidenceQuote: "Я ищу работу дизайнером", addedByUser: false };
    let removed = false;
    let failEdit = true;
    await page.route("**/api/**", async route => {
      const path = new URL(route.request().url()).pathname;
      const method = route.request().method();
      if (path === "/api/auth/me") return route.fulfill({ json: { authenticated: true, user: { sub: "memory-ui", role: "user", name: "Анна", profileUserId: "memory-ui-profile", ageConfirmed: true } } });
      if (path === "/api/cabinet") return route.fulfill({ json: {
        profile: { id: "memory-ui-profile", name: "Анна", email: "memory@example.test", runeBalance: 300 },
        stats: { totalSessions: 2, favoriteMaster: null, daysWithUs: 10, totalCards: 6 },
        achievements: { earned: [], locked: [] }, sessions: [], sessionsTotal: 0, sessionsHasMore: false,
        runes: { enabled: true, balance: 300, transactions: [] }, legacyAccess: null, photoSpreads: [], auraReadings: [], palmReadings: [], dailyReadings: [],
      } });
      if (path === "/api/memory/preferences") return route.fulfill({ json: { needsInitialChoice: false, preferences: { memoryEnabled: true, autoCaptureEnabled: true, momentsMode: "active", cabinetMode: "simple" } } });
      if (path === "/api/memory/context") return route.fulfill({ json: { receipts: removed ? [] : [{ id: "context", product: "natal", preparedAt: "2026-09-05T12:01:00Z", facts: [fact] }] } });
      if (path === "/api/memory/facts") {
        if (method === "PATCH") {
          if (failEdit) { failEdit = false; return route.fulfill({ status: 503, json: { message: "Не удалось обновить факт. Попробуйте ещё раз." } }); }
          fact = { ...fact, fact: route.request().postDataJSON().fact };
          return route.fulfill({ json: { ok: true, fact } });
        }
        if (method === "DELETE") { removed = true; return route.fulfill({ json: { ok: true } }); }
        return route.fulfill({ json: { facts: removed ? [] : [fact] } });
      }
      if (path === "/api/runes/config") return route.fulfill({ json: { enabled: true, costs: {}, freeQuestions: 2 } });
      return route.fulfill({ json: {} });
    });
    await page.goto("/cabinet?tab=memory");
    await expect(page.getByText("Важное остаётся с вами")).toBeVisible();
    await expect(page.getByText("Запоминать важное из обращений")).toBeVisible();
    await page.getByText("Что передано из вашей памяти", { exact: true }).click();
    await expect(page.getByText(/Натальная карта ·/)).toBeVisible();
    await page.getByText("Что передано из вашей памяти", { exact: true }).click();
    await page.getByLabel("Найти в памяти").fill("несуществующий запрос");
    await expect(page.getByText("Ничего не найдено")).toBeVisible();
    await page.getByLabel("Найти в памяти").fill("");
    await page.getByText("Из ваших слов", { exact: true }).click();
    await expect(page.getByText("Я ищу работу дизайнером", { exact: true }).last()).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`memory-${width}.png`), fullPage: true });
    await page.getByRole("button", { name: "Редактировать факт" }).click();
    await page.getByLabel("Текст факта").fill("Я работаю дизайнером в студии");
    await page.getByRole("button", { name: "Сохранить", exact: true }).click();
    await expect(page.getByText("Не удалось обновить факт. Попробуйте ещё раз.")).toBeVisible();
    await expect(page.getByLabel("Текст факта")).toHaveValue("Я работаю дизайнером в студии");
    await page.getByRole("button", { name: "Сохранить", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Изменить факт" })).toHaveCount(0);
    page.on("dialog", dialog => void dialog.accept());
    await page.getByRole("button", { name: "Удалить факт" }).click();
    await expect(page.getByText("Начнём с того, что важно вам")).toBeVisible();
  });
}

test("personal memory explainer is public and transparent", async ({ page }) => {
  await page.goto("/about/personal-memory");

  await expect(page.getByRole("heading", { level: 1 })).toContainText("Персональная память");
  await expect(page.getByText("Черновики не подставляются в консультации")).toBeVisible();
  await expect(page.getByText(/Чистого листа|Свежий сеанс/).first()).toBeVisible();
  await expect(page.getByText(/полная очистка памяти/i)).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Политике обработки персональных данных" })
  ).toHaveAttribute("href", "/privacy");
});
