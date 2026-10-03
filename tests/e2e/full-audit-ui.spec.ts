import { expect, test, type Page } from "@playwright/test";
import { calculateHdChart } from "../../src/lib/human-design/calculate";

test("support ignores a late ticket after selecting another and handles an offline create", async ({ page, baseURL }) => {
  test.setTimeout(90_000);
  await installAuthenticatedMocks(page, baseURL!);
  const tickets = ["Альфа", "Бета"].map((subject, i) => ({id:`ticket-${i}`,subject,category:"general",status:"open",unread_by_user:false,last_message_at:"2026-10-03T00:00:00Z"}));
  let release!: () => void;
  let requested = false;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let settleLate!: () => void;
  const lateSettled = new Promise<void>(resolve => { settleLate = resolve; });
  await page.route("**/api/support/tickets", (route) => route.request().method() === "POST"
    ? route.abort("failed") : route.fulfill({json:{tickets,labels:{categories:{},statuses:{}}}}));
  await page.route("**/api/support/tickets/*", async (route) => {
    const first = route.request().url().endsWith("ticket-0");
    if (first) { requested = true; await gate; }
    await route.fulfill({json:{ticket:tickets[first ? 0 : 1],messages:[{id:first ? "a" : "b",sender_type:"user",content:first ? "Старое обращение" : "Текущее обращение",created_at:"2026-10-03T00:00:00Z"}]}}).catch(() => {});
    if (first) settleLate();
  });
  await page.goto("/cabinet/support");
  await page.getByRole("button", {name:/Альфа/}).click();
  await expect.poll(() => requested).toBe(true);
  await page.getByRole("button", {name:"← Все обращения"}).click();
  await page.getByRole("button", {name:/Бета/}).click();
  await expect(page.getByRole("heading", {name:"Бета",exact:true})).toBeVisible();
  release();
  await lateSettled;
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(page.getByText("Текущее обращение", {exact:true})).toBeVisible();
  await expect(page.getByText("Старое обращение", {exact:true})).toHaveCount(0);
  await page.getByRole("button", {name:"← Все обращения"}).click();
  await page.getByRole("button", {name:"Новое обращение",exact:true}).click();
  await page.getByPlaceholder("Кратко опишите проблему").fill("Нет связи");
  await page.getByPlaceholder("Опишите ситуацию подробнее…").fill("Проверка восстановления соединения");
  await page.getByRole("button", {name:"Отправить",exact:true}).click();
  await expect(page.getByText("Не удалось создать обращение. Проверьте соединение и попробуйте ещё раз.", {exact:true})).toBeVisible();
  await expect(page.getByRole("button", {name:"Отправить",exact:true})).toBeEnabled();
});

test("ritual ignores a late load after closing A and opening B", async ({ page, baseURL }) => {
  test.setTimeout(90_000);
  await installAuthenticatedMocks(page, baseURL!);
  const rituals = ["Альфа-карта", "Бета-карта"].map((name, index) => ({
    id:ids[index],characterKey:"ragnar",ritualType:"protection",status:"payment",cards:[{name,position:"Опора"}],runeCost:50,
    moonPhase:"Растущая",moonSign:"Рак",ritualTime:null,ritualPlace:null,ritualItems:[],ritualSteps:[],ritualWords:null,
    ritualWordOfPower:null,ritualForbids:[],ritualSigns:[],createdAt:"2026-10-03T00:00:00Z",
  }));
  let release!: () => void;
  let requested = false;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let settleLate!: () => void;
  const lateSettled = new Promise<void>(resolve => { settleLate = resolve; });
  await page.route("**/api/ritual/list", (route) => route.fulfill({json:{rituals}}));
  await page.route(`**/api/ritual/${ids[0]}`, async (route) => {
    requested = true; await gate;
    await route.fulfill({json:{ritual:rituals[0]}}).catch(() => {});
    settleLate();
  });
  await page.route(`**/api/ritual/${ids[1]}`, (route) => route.fulfill({json:{ritual:rituals[1]}}));
  await page.goto("/cabinet?tab=rituals");
  await page.getByRole("button", {name:"Продолжить обряд →",exact:true}).nth(0).click();
  await expect.poll(() => requested).toBe(true);
  await page.getByRole("dialog").locator('button[aria-label="Закрыть"]').first().click({position:{x:10,y:10}});
  await page.getByRole("button", {name:"Продолжить обряд →",exact:true}).nth(1).click();
  await expect(page.getByRole("dialog")).toContainText("Бета-карта");
  release();
  await lateSettled;
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(page.getByRole("dialog")).not.toContainText("Альфа-карта");
  await expect(page.getByRole("dialog")).toContainText("Бета-карта");
});

const ids = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
];

const charts = ids.map((id, index) => ({
  id,
  subjectKind: index ? "other" : "self",
  subjectName: index === 1 ? "Алексей" : index === 2 ? "Мария" : null,
  relationToSelf: index ? "partner" : null,
  gender: index ? "male" : null,
  birthDate: "1990-08-15",
  birthTime: "12:00",
  timezone: "Europe/Moscow",
  placeName: "Москва",
  lat: 55.75,
  lon: 37.62,
  timeUnknown: false,
  createdAt: "2026-09-01T12:00:00Z",
  chart: calculateHdChart({
    birthDate: index === 2 ? "1985-04-03" : "1990-08-15",
    birthTime: "12:00",
    timezone: "Europe/Moscow",
  }),
}));

async function installAuthenticatedMocks(page: Page, baseURL: string) {
  expect(["127.0.0.1", "localhost"]).toContain(new URL(baseURL).hostname);
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/me") {
      return route.fulfill({ json: {
        authenticated: true,
        needsProfile: false,
        needsBirthProfile: false,
        user: {
          sub: "qa",
          role: "user",
          profileUserId: "qa",
          name: "Анна",
          ageConfirmed: true,
        },
      } });
    }
    if (path === "/api/platform/features") {
      return route.fulfill({ json: {
        humanDesignEnabled: true,
        natalChartEnabled: true,
        palmReadingEnabled: true,
        auraReadingEnabled: true,
      } });
    }
    if (path === "/api/human-design/mine") {
      return route.fulfill({ json: { enabled: true, charts } });
    }
    if (path === "/api/runes/config") {
      return route.fulfill({ json: {
        enabled: true,
        costs: { HD_REPORT: 100, HD_COMPOSITE_REPORT: 100 },
        starterRunes: 100,
        rubPerRune: 2,
      } });
    }
    if (path === "/api/memory/preferences") {
      return route.fulfill({ json: {
        needsInitialChoice: false,
        preferences: { memoryEnabled: true, autoCaptureEnabled: true },
      } });
    }
    if (path === "/api/cabinet") {
      return route.fulfill({ json: {
        profile: { name: "Анна", runeBalance: 300 },
        stats: { totalSessions: 0, totalCards: 0, daysWithUs: 1 },
        achievements: { earned: [], locked: [] },
        sessions: [],
        runes: { enabled: true, balance: 300, transactions: [] },
        photoSpreads: [],
        auraReadings: [],
        palmReadings: [],
        dailyReadings: [],
      } });
    }
    if (path === "/api/human-design/report" || path === "/api/human-design/composite-report") {
      return route.fulfill({ json: { report: null } });
    }
    return route.fulfill({ json: {} });
  });
}

for (const mode of ["personal", "composite"] as const) {
  test(`HD ${mode} ignores a late result after switching person`, async ({ page, baseURL }) => {
    await installAuthenticatedMocks(page, baseURL!);
    await page.setViewportSize({ width: 390, height: 844 });

    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let requested = false;
    const endpoint = mode === "personal"
      ? "/api/human-design/report"
      : "/api/human-design/composite-report";

    await page.route(`**${endpoint}`, async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      requested = true;
      await gate;
      await route.fulfill({ json: {
        report: {
          id: "old-report-a",
          status: "done",
          reportText: "Чужой запоздавший отчёт А. Содержимое предыдущей карты.",
        },
      } });
    });

    await page.goto("/cabinet/human-design");
    if (mode === "composite") {
      await page.getByRole("button", { name: /Связь с Алексей/ }).click();
    } else {
      await page.getByRole("tab", { name: /Другие/ }).click();
    }

    const consent = page.getByRole("checkbox", { name: /Подтверждаю передачу/ });
    await consent.check();
    await page.getByRole("button", {
      name: mode === "composite" ? /Получить разбор связи/ : /Получить полный разбор/,
    }).click();
    await expect.poll(() => requested).toBe(true);

    if (mode === "composite") {
      await page.getByRole("button", { name: /Связь с Мария/ }).click();
    } else {
      await page.getByRole("button", { name: /Мария/ }).first().click();
    }
    await expect(page.getByRole("checkbox", { name: /Подтверждаю передачу/ })).not.toBeChecked();

    const response = page.waitForResponse((item) =>
      new URL(item.url()).pathname === endpoint && item.request().method() === "POST"
    );
    release();
    await response;
    await page.evaluate(() => new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    ));
    await expect(page.getByText(/Чужой запоздавший отчёт А/)).toHaveCount(0);
    await expect(page.locator('a[href*="old-report-a"]')).toHaveCount(0);
    expect(await page.locator("body").evaluate((element) =>
      element.scrollWidth <= window.innerWidth
    )).toBe(true);
  });
}

test("memory preference failure keeps facts visible and blocks writes", async ({ page, baseURL }) => {
  await installAuthenticatedMocks(page, baseURL!);
  let failed = true;
  let mutations = 0;
  await page.route("**/api/memory/preferences", (route) => {
    if (route.request().method() !== "GET") mutations += 1;
    return route.fulfill(failed
      ? { status: 503, json: { error: "unavailable" } }
      : { json: {
          needsInitialChoice: false,
          preferences: { memoryEnabled: true, autoCaptureEnabled: true },
        } });
  });
  await page.route("**/api/memory/facts?*", (route) => route.fulfill({ json: { facts: [{
    id: ids[0],
    fact: "Важная сохранённая запись",
    category: null,
    eventDate: null,
    sourceType: "user",
    status: "active",
    salience: 4,
    addedByUser: true,
  }] } }));

  await page.goto("/cabinet?tab=memory");
  await expect(page.getByText("Важная сохранённая запись", { exact: true })).toBeVisible();
  await expect(page.getByText("Настройки недоступны", { exact: true })).toBeVisible();
  const toggle = page.getByRole("checkbox", { name: /Использовать память/ });
  await expect(toggle).toBeDisabled();
  expect(mutations).toBe(0);

  failed = false;
  await page.getByRole("button", { name: "Повторить", exact: true }).click();
  await expect(page.getByText("Важное остаётся с вами")).toBeVisible();
  await expect(toggle).toBeEnabled();
  expect(mutations).toBe(0);
});
