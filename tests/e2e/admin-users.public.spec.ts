import { expect, test, type Page } from "@playwright/test";
import { SignJWT } from "jose";

async function authenticateSyntheticAdmin(page: Page, baseURL: string) {
  test.skip(!/^(127\.0\.0\.1|localhost)$/.test(new URL(baseURL).hostname), "Synthetic admin cookie is local-only");
  const token = await new SignJWT({ role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("synthetic-admin")
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(process.env.AUTH_SECRET || "dev-secret-change-in-production"));
  await page.context().addCookies([{ name: "aura_auth", value: token, url: baseURL }]);
  await page.route("**/api/auth/me", (route) => route.fulfill({
    json: { authenticated: true, user: { role: "admin", email: "admin@example.test", name: "Админ" } },
  }));
}

test("admin can reach every account and profile page", async ({ page, baseURL }) => {
  await authenticateSyntheticAdmin(page, baseURL!);
  await page.route("**/api/admin/users?*", (route) => {
    const url = new URL(route.request().url());
    const type = url.searchParams.get("type");
    const offset = Number(url.searchParams.get("offset"));
    const limit = Number(url.searchParams.get("limit"));
    const includeTest = url.searchParams.get("includeTest") === "1";
    const total = type === "accounts" ? (includeTest ? 66 : 65) : (includeTest ? 3 : 2);
    const items = Array.from({ length: Math.max(0, Math.min(limit, total - offset)) }, (_, index) => {
      const number = offset + index + 1;
      return type === "accounts" ? {
        id: `account-${number}`, email: `client-${number}@example.test`, name: `Клиент ${number}`,
        profile_user_id: null, created_at: "2026-09-28T10:00:00Z", activation_stage: "not_started",
      } : {
        id: `profile-${number}`, name: `Профиль ${number}`, account_email: `client-${number}@example.test`,
        created_at: "2026-09-28T10:00:00Z",
      };
    });
    return route.fulfill({ json: { items, total, limit, offset, activation: { stages: [], events: [] } } });
  });

  await page.goto("/admin/users");
  await expect(page.getByRole("status")).toContainText("Показано 1–50 из 65 аккаунтов");
  await page.getByRole("button", { name: "Далее" }).click();
  await expect(page.getByRole("status")).toContainText("Показано 51–65 из 65 аккаунтов");
  await expect(page.getByText("client-65@example.test")).toBeVisible();

  await page.getByRole("button", { name: "Профили" }).click();
  await expect(page.getByRole("status")).toContainText("Показано 1–2 из 2 профилей");
  await page.getByRole("checkbox", { name: "Включая тестовые записи" }).check();
  await expect(page.getByRole("status")).toContainText("Показано 1–3 из 3 профилей");
});

test("a completed account change refreshes the currently selected tab", async ({ page, baseURL }) => {
  await authenticateSyntheticAdmin(page, baseURL!);
  let profileLoads = 0;
  await page.route("**/api/admin/users?*", (route) => {
    const type = new URL(route.request().url()).searchParams.get("type");
    if (type === "profiles") profileLoads += 1;
    const items = type === "profiles"
      ? [{ id: "profile-1", name: "Профиль", created_at: "2026-09-28T10:00:00Z" }]
      : [{ id: "account-1", email: "client-1@example.test", name: "Клиент", created_at: "2026-09-28T10:00:00Z" }];
    return route.fulfill({ json: { items, total: 1, activation: { stages: [], events: [] } } });
  });
  let releasePatch!: () => void;
  const patchGate = new Promise<void>((resolve) => { releasePatch = resolve; });
  let patchStarted!: () => void;
  const started = new Promise<void>((resolve) => { patchStarted = resolve; });
  await page.route("**/api/admin/users", async (route) => {
    if (route.request().method() !== "PATCH") return route.continue();
    patchStarted();
    await patchGate;
    return route.fulfill({ json: { ok: true } });
  });

  await page.goto("/admin/users");
  await expect(page.getByRole("status")).toContainText("из 1 аккаунтов");
  await page.getByRole("button", { name: "Выкл" }).first().click();
  await started;
  await page.getByRole("button", { name: "Профили" }).click();
  await expect(page.getByRole("status")).toContainText("из 1 профилей");
  releasePatch();
  await expect.poll(() => profileLoads).toBe(2);
  await expect(page.getByText("Профиль", { exact: true })).toBeVisible();
  await expect(page.getByText("client-1@example.test")).toHaveCount(0);
});
