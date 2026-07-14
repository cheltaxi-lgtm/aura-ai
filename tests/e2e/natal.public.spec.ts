import { expect, test } from "@playwright/test";

test.describe("natal public and authentication boundaries", () => {
  test("cabinet astrology preserves a safe return path", async ({ page }) => {
    await page.goto("/cabinet/astrology");

    await expect(page).toHaveURL((url) =>
      url.pathname === "/auth/user/login"
      && url.searchParams.get("returnTo") === "/cabinet/astrology"
    );
    await expect(page.getByRole("heading", { name: "Вход", exact: true })).toBeVisible();
  });

  for (const entry of [
    {
      name: "natal report",
      path: "/cabinet/astrology/reports/report-e2e/print",
    },
    {
      name: "relationship report",
      path: "/joint-reading/relationship-e2e/print",
    },
  ]) {
    test(`${entry.name} print view requires authentication`, async ({ page }) => {
      await page.goto(entry.path);

      await expect(page).toHaveURL((url) =>
        url.pathname === "/auth/user/login"
        && url.searchParams.get("returnTo") === entry.path
      );
      await expect(page.getByRole("heading", { name: "Вход", exact: true })).toBeVisible();
    });
  }

  test("invalid public report is a non-sensitive 404", async ({ page }) => {
    const token = "invalid-token";
    const response = await page.goto(`/reports/shared/${token}`);

    expect(response?.status()).toBe(404);
    await expect(page.getByText(/404|страница не найдена/i).first()).toBeVisible();
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/DATABASE_URL|aura_auth|birthFingerprint|stack trace/i);
    expect(body).not.toContain(token);
  });

  test("invalid public report API is reachable without authentication", async ({ request }) => {
    const token = "invalid-token";
    const response = await request.get(`/api/public/reports/${token}`);
    const body = await response.text();

    expect(response.status()).toBe(404);
    expect(body).toBe('{"error":"not_found"}');
    expect(response.headers()["cache-control"]).toContain("no-store");
    expect(response.headers()["x-robots-tag"]).toBe("noindex, nofollow");
    expect(body).not.toMatch(/Unauthorized|DATABASE_URL|aura_auth|birthFingerprint|stack trace/i);
    expect(body).not.toContain(token);
  });

  test("mobile login and legal navigation remain usable", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/auth/user/login?returnTo=%2Fcabinet%2Fastrology");

    await expect(page.getByRole("heading", { name: "Вход", exact: true })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Email *" })).toBeVisible();
    await expect(page.getByLabel("Пароль *")).toBeVisible();
    await expect(page.getByRole("button", { name: "Войти", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "← Выбор аккаунта" })).toBeVisible();

    const legalNavigation = page.getByRole("contentinfo")
      .getByRole("navigation", { name: "Юридические документы" });
    await expect(legalNavigation).toBeVisible();
    await expect(legalNavigation.getByRole("link", { name: "ПДн" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  });
});
