import { expect, test, type Page } from "@playwright/test";

const SNAPSHOT = { whichHand: "left", handShape: "water", verdict: "love", teaser: "Сохранённый гостевой снимок ладони" };

async function fixture(page: Page, options: { loggedIn?: boolean; paid?: boolean; memory?: boolean; unlimited?: boolean; claimFailure?: boolean } = {}) {
  const calls: string[] = [];
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    calls.push(`${route.request().method()} ${path}`);
    if (path === "/api/auth/me") return route.fulfill({ json: {
      authenticated: options.loggedIn ?? true,
      user: options.loggedIn === false ? null : { sub: "launch-test", role: "user", name: "Проверка", profileUserId: "launch-profile", ageConfirmed: true },
    } });
    if (path === "/api/platform/features") return route.fulfill({ json: {
      palmReadingEnabled: true, auraReadingEnabled: true, humanDesignEnabled: true,
      recaptcha: { configured: false, masterEnabled: false, scopes: {} },
    } });
    if (path === "/api/runes/config") return route.fulfill({ json: { enabled: true, starterRunes: 300, rubPerRune: 2, freeQuestions: 2, costs: { PALM_READING: 100 } } });
    if (path === "/api/runes/balance") return route.fulfill({ json: { balance: options.unlimited ? 0 : 300 } });
    if (path === "/api/age-gate/confirm") return route.fulfill({ json: { confirmed: true, ok: true } });
    if (path === "/api/palm/claim") return route.fulfill(options.claimFailure
      ? { status: 503, json: { error: "unavailable" } }
      : options.paid
        ? { status: 400, json: { code: "NO_CLAIM_TOKEN" } }
        : { json: { ok: true, snapshotId: "guest-left", snapshot: SNAPSHOT } });
    if (path === "/api/palm/today") {
      await new Promise((resolve) => setTimeout(resolve, 100));
      return route.fulfill({ json: options.paid
        ? { snapshotId: "paid-left", snapshot: SNAPSHOT, paid: true, claimed: true, report: "Уже оплаченный сохранённый разбор" }
        : { snapshotId: "older-right", snapshot: { ...SNAPSHOT, whichHand: "right", teaser: "Старый снимок" }, paid: true, claimed: true, report: "Старый разбор другой руки" } });
    }
    if (path === "/api/palm/pricing") return route.fulfill({ json: { baseCost: 100, effectiveCost: 50, firstPalmDiscount: true, unlimited: options.unlimited === true } });
    if (path === "/api/palm/readings") return route.fulfill({ json: { readings: [] } });
    if (path === "/api/memory/preferences") return route.fulfill({ json: { needsInitialChoice: options.memory === true } });
    return route.fulfill({ json: {} });
  });
  return calls;
}

test("palm restores the same guest hand after login ahead of an older paid hand", async ({ page }, testInfo) => {
  const calls = await fixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/gadanie-po-ladoni");
  await expect(page.getByText(SNAPSHOT.teaser, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Открыть полный разбор", exact: true })).toBeVisible();
  expect(calls).not.toContain("POST /api/palm/teaser");
  expect(calls).not.toContain("POST /api/palm/report");
  await page.screenshot({ path: testInfo.outputPath("palm-resumed-mobile.png"), fullPage: false });
});

test("palm reopens an already paid report without generation", async ({ page }) => {
  const calls = await fixture(page, { paid: true });
  await page.goto("/gadanie-po-ladoni");
  await page.getByText("Полный разбор", { exact: true }).first().click();
  await expect(page.getByText("Уже оплаченный сохранённый разбор")).toBeVisible();
  expect(calls).not.toContain("POST /api/palm/report");
});

test("unlimited palm access does not require topping up an empty balance", async ({ page }) => {
  await fixture(page, { unlimited: true });
  await page.goto("/gadanie-po-ladoni");
  await expect(page.getByRole("button", { name: "Открыть полный разбор", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Пополнить руны", exact: true })).toHaveCount(0);
});

test("a failed palm claim explains recovery instead of offering another registration", async ({ page }) => {
  await fixture(page, { claimFailure: true });
  await page.goto("/gadanie-po-ladoni");
  await expect(page.getByText(/Не удалось восстановить снимок/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Продолжить и получить разбор", exact: true })).toHaveCount(0);
});

test("password recovery reports network failure and allows retry", async ({ page }) => {
  await fixture(page, { loggedIn: false });
  await page.route("**/api/auth/user/forgot-password", (route) => route.abort("failed"));
  await page.goto("/auth/user/forgot-password");
  await page.getByLabel("Email", { exact: true }).fill("test@example.invalid");
  await page.getByRole("button", { name: "Отправить ссылку", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Не удалось связаться с сервером" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Отправить ссылку", exact: true })).toBeEnabled();
});

test("personal memory choice is scrollable and keyboard-contained on a landscape phone", async ({ page }, testInfo) => {
  await fixture(page, { memory: true });
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto("/?app=1");
  const dialog = page.getByRole("dialog", { name: "Персональная память" });
  await expect(dialog).toBeVisible();
  const decline = dialog.getByRole("button", { name: "Не включать", exact: true });
  await decline.scrollIntoViewIfNeeded();
  await expect(decline).toBeInViewport();
  const last = dialog.getByRole("link").last();
  await last.focus();
  await page.keyboard.press("Tab");
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await dialog.focus();
  await page.keyboard.press("Shift+Tab");
  await expect(last).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath("memory-landscape.png"), fullPage: false });
});

test("guest entry responds before an age lookup and ignores its response after closing", async ({ page }) => {
  await fixture(page, { loggedIn: false });
  let releaseLookup!: () => void;
  const lookup = new Promise<void>((resolve) => { releaseLookup = resolve; });
  await page.route("**/api/age-gate/confirm", async (route) => {
    await lookup;
    await route.fulfill({ json: { confirmed: true } }).catch(() => {});
  });
  await page.goto("/?app=1");
  await page.locator(".editorial-hero__actions").getByRole("button", { name: "Открыть 3 карты", exact: true }).click();
  await expect(page.locator("#guest-spread-picker")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Сервис только для взрослых 18+" })).toBeVisible();
  const abortedLookup = page.waitForEvent("requestfailed", {
    predicate: (request) => request.url().endsWith("/api/age-gate/confirm") && request.method() === "GET",
  });
  await page.getByRole("button", { name: "Вернуться", exact: true }).click();
  await abortedLookup;
  releaseLookup();
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(page.locator(".editorial-hero__actions")).toBeVisible();
  await expect(page.locator("#guest-spread-picker")).toHaveCount(0);
});

test("a late age confirmation cannot reopen a guest draw after returning to the landing", async ({ page }) => {
  await fixture(page, { loggedIn: false });
  let releaseConfirmation!: () => void;
  const confirmation = new Promise<void>((resolve) => { releaseConfirmation = resolve; });
  await page.route("**/api/age-gate/confirm", async (route) => {
    if (route.request().method() === "POST") await confirmation;
    await route.fulfill({ json: { confirmed: route.request().method() === "POST", ok: true } });
  });
  await page.goto("/?app=1");
  await page.locator(".editorial-hero__actions").getByRole("button", { name: "Открыть 3 карты", exact: true }).click();
  await page.getByRole("button", { name: "Мне есть 18 лет — открыть карты", exact: true }).click();
  await expect(page.getByRole("button", { name: "Подтверждаем…", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Вернуться", exact: true }).click();
  const responded = page.waitForResponse((response) => response.url().endsWith("/api/age-gate/confirm") && response.request().method() === "POST");
  releaseConfirmation();
  await (await responded).finished();
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(page.locator(".editorial-hero__actions")).toBeVisible();
  await expect(page.locator("#guest-spread-picker")).toHaveCount(0);
});

test("late analytics consent records the current landing exactly once and tracks SPA navigation", async ({ page }) => {
  await fixture(page, { loggedIn: false });
  await page.route("https://mc.yandex.ru/**", (route) => route.fulfill({ body: "", contentType: "application/javascript" }));
  await page.goto("/gadanie-po-ladoni");
  await expect(page.getByRole("button", { name: "Принять аналитику", exact: true })).toBeVisible();
  expect(await page.evaluate(() => typeof window.ym)).toBe("undefined");
  await page.getByRole("button", { name: "Принять аналитику", exact: true }).click();
  const viewCount = () => page.evaluate(() => {
    const queue = (window.ym as unknown as { a?: unknown[][] })?.a ?? [];
    return queue.filter((item) => item[1] === "reachGoal" && item[2] === "palm_landing_view").length;
  });
  await expect.poll(viewCount).toBe(1);
  await page.evaluate(() => window.dispatchEvent(new Event("aura:metrika-ready")));
  expect(await viewCount()).toBe(1);
  await page.getByRole("link", { name: "Главные линии", exact: true }).click();
  await expect(page).toHaveURL(/\/gadanie-po-ladoni\/linii/);
  await expect.poll(() => page.evaluate(() => ((window.ym as unknown as { a?: unknown[][] })?.a ?? []).some((item) => item[1] === "hit" && String(item[2]).endsWith("/gadanie-po-ladoni/linii")))).toBe(true);
});
