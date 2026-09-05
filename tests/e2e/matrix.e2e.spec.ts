import { expect, test, type Page, type Route } from "@playwright/test";

const DOB = "1990-08-15";
const SUBJECT_A = "11111111-1111-4111-8111-111111111111";
const SUBJECT_B = "22222222-2222-4222-8222-222222222222";
const REPORT_A = "33333333-3333-4333-8333-333333333333";
const JOB_A = "44444444-4444-4444-8444-444444444444";

const FROZEN = {
  asOf: { date: "2026-08-20", year: 2026, month: 8 },
  comfort: { number: 12, arcanaName: "Повешенный" },
  talents: { number: 20, arcanaName: "Суд" },
  purpose: { number: 21, arcanaName: "Мир" },
  version: "matrix-v5",
  calculationVersion: "matrix-v5",
  methodologyId: "zovus-matrix-22-v2",
  rendererVersion: "matrix-svg-v6",
};

async function confirmAge(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("aura_age_gate_v1", "1");
    } catch {
      /* ignore */
    }
  });
}

async function installMatrixBackend(page: Page) {
  let chargeCount = 0;
  let reportReady = false;
  let jobStatus: "pending" | "ready" = "pending";
  let deleted = false;
  let balance = 300;

  await page.route("**/api/**", async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();

    if (path === "/api/age-gate/confirm" && method === "POST") {
      return route.fulfill({ json: { ok: true } });
    }
    if (path === "/api/platform/features" || path === "/api/platform-features" || path === "/api/features") {
      return route.fulfill({
        json: {
          expertRegistrationEnabled: true,
          recaptcha: { configured: false, masterEnabled: false, scopes: {} },
        },
      });
    }
    if (path === "/api/auth/me") {
      return route.fulfill({
        json: {
          authenticated: true,
          needsProfile: false,
          needsBirthProfile: false,
          user: {
            sub: "user-a",
            role: "user",
            email: "matrix-a@example.invalid",
            name: "Матрица A",
            profileUserId: "user-a",
            ageConfirmed: true,
          },
        },
      });
    }
    if (path === "/api/numerology/matrix-guest" && method === "POST") {
      return route.fulfill({
        json: {
          ok: true,
          pending: {
            pendingId: "pending-e2e",
            birthDate: DOB,
            calculationVersion: "matrix-v5",
            personalNumbers: { talents: 20, comfort: 12 },
          },
        },
      });
    }
    if (path === "/api/numerology/matrix-snapshot") {
      if (method === "GET") {
        const subjectId = url.searchParams.get("subjectId");
        if (subjectId && subjectId !== SUBJECT_A) {
          return route.fulfill({ status: 404, json: { error: "not_found" } });
        }
        return route.fulfill({
          json: {
            ok: true,
            subjectId: SUBJECT_A,
            birthDate: DOB,
            asOfDate: "2026-08-20",
            calculationVersion: "matrix-v5",
            snapshot: FROZEN,
          },
        });
      }
      return route.fulfill({
        json: {
          ok: true,
          subjectId: SUBJECT_A,
          birthDate: DOB,
          asOfDate: "2026-08-20",
          calculationVersion: "matrix-v5",
          reused: true,
        },
      });
    }
    if (path === "/api/numerology/matrix-report") {
      if (method === "GET") {
        const foreign = url.searchParams.get("subjectId") === SUBJECT_B;
        if (foreign) {
          return route.fulfill({ status: 403, json: { error: "forbidden" } });
        }
        if (url.searchParams.get("list") === "1") {
          return route.fulfill({
            json: {
              reports: deleted
                ? []
                : reportReady
                  ? [
                      {
                        id: REPORT_A,
                        subjectId: SUBJECT_A,
                        birthDate: DOB,
                        calculationVersion: "matrix-v5",
                        hasContent: true,
                      },
                    ]
                  : [],
              sessionCost: 100,
            },
          });
        }
        return route.fulfill({
          json: {
            owned: reportReady && !deleted,
            report: reportReady && !deleted ? { id: REPORT_A, hasContent: true } : null,
            sessionCost: 100,
          },
        });
      }
      if (method === "DELETE") {
        const body = request.postDataJSON() as { subjectId?: string };
        if (body?.subjectId === SUBJECT_B) {
          return route.fulfill({ status: 403, json: { error: "forbidden" } });
        }
        deleted = true;
        reportReady = false;
        return route.fulfill({ json: { ok: true, deleted: 1 } });
      }
    }
    if (path === "/api/reading" && method === "POST") {
      const body = request.postDataJSON() as { matrixSubjectId?: string };
      if (body.matrixSubjectId === SUBJECT_B) {
        return route.fulfill({
          status: 403,
          json: { error: "Субъект матрицы не найден.", code: "matrix_subject_forbidden" },
        });
      }
      if (reportReady && !deleted) {
        return route.fulfill({
          json: {
            reading: "Готовый разбор.",
            reused: true,
            matrixOwned: true,
            reportId: REPORT_A,
            historyId: "hist-e2e",
          },
        });
      }
      if (chargeCount === 0) {
        chargeCount += 1;
        balance -= 100;
        jobStatus = "pending";
        return route.fulfill({
          status: 202,
          json: {
            jobId: JOB_A,
            status: "pending",
            async: true,
            kind: "numerology_reading",
            pollUrl: `/api/jobs/${JOB_A}`,
          },
        });
      }
      return route.fulfill({
        status: 202,
        json: {
          jobId: JOB_A,
          status: jobStatus === "ready" ? "completed" : "pending",
          deduped: true,
          async: true,
          kind: "numerology_reading",
        },
      });
    }
    if (path === `/api/jobs/${JOB_A}`) {
      if (jobStatus === "pending") {
        jobStatus = "ready";
        reportReady = true;
      }
      return route.fulfill({
        json: {
          jobId: JOB_A,
          status: reportReady ? "completed" : "pending",
          billingState: "charged",
          result: reportReady
            ? { reading: "Готовый разбор.", historyId: "hist-e2e", runeBalance: balance }
            : undefined,
        },
      });
    }
    if (path === "/api/jobs/active") {
      return route.fulfill({
        json: {
          jobs: reportReady
            ? []
            : [{ jobId: JOB_A, kind: "numerology_reading", status: "pending", billingState: "charged" }],
        },
      });
    }
    if (path === "/api/runes/balance") {
      return route.fulfill({ json: { balance, pending: false, newTransactions: [] } });
    }
    if (path === "/api/cabinet") {
      return route.fulfill({
        json: {
          sessions: reportReady && !deleted
            ? [
                {
                  id: REPORT_A,
                  sessionId: null,
                  characterKey: "numerolog",
                  sessionDate: "2026-08-21T00:00:00.000Z",
                  createdAt: "2026-08-21T00:00:00.000Z",
                  topicSummary: "Матрица судьбы",
                  spreadId: "numerolog:destiny_matrix",
                  matrixBirthDate: DOB,
                  matrixCalculationVersion: "matrix-v5",
                  matrixStructuredData: FROZEN,
                  matrixSubjectKind: "self",
                  prediction: "Готовый разбор.",
                  keyCards: [],
                },
              ]
            : [],
          sessionsTotal: reportReady && !deleted ? 1 : 0,
          runes: { enabled: true, balance },
        },
      });
    }

    return route.continue();
  });

  return {
    getChargeCount: () => chargeCount,
    markReady: () => {
      reportReady = true;
      jobStatus = "ready";
    },
    getBalance: () => balance,
    isDeleted: () => deleted,
  };
}

test.describe("Matrix E2E", () => {
  test.describe.configure({ mode: "serial" });

  test("guest calc, auth resume, history, report idempotency, mobile, ownership", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const backend = await installMatrixBackend(page);
    await confirmAge(page);

    await page.goto("/numerology/destiny-matrix");
    const dateInput = page.locator('input[type="date"]').first();
    await expect(dateInput).toBeVisible({ timeout: 20_000 });
    await dateInput.fill(DOB);
    const calc = page.getByRole("button", { name: /Рассчитать бесплатно|Пересчитать/i }).first();
    if (await calc.isVisible().catch(() => false)) {
      await calc.click();
    }
    await expect(page.locator("svg").getByText("20", { exact: true }).first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.locator("svg").getByText("12", { exact: true }).first()).toBeVisible();
    const hits = page.locator("[data-node-hit]");
    await expect(hits).toHaveCount(28);

    const resumed = await page.evaluate(async () => {
      const res = await fetch("/api/numerology/matrix-snapshot");
      return res.json();
    });
    expect(resumed.ok).toBe(true);
    expect(resumed.birthDate).toBe(DOB);
    expect(resumed.snapshot.talents.number).toBe(20);
    expect(resumed.snapshot.comfort.number).toBe(12);

    await page.reload();
    const dateAfterReload = page.locator('input[type="date"]').first();
    await expect(dateAfterReload).toBeVisible({ timeout: 20_000 });
    await dateAfterReload.fill(DOB);
    const recalc = page.getByRole("button", { name: /Рассчитать бесплатно|Пересчитать/i }).first();
    if (await recalc.isVisible().catch(() => false)) {
      await recalc.click();
    }
    await expect(page.locator("svg").getByText("20", { exact: true }).first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.locator("svg").getByText("12", { exact: true }).first()).toBeVisible();

    const first = await page.evaluate(async () => {
      const res = await fetch("/api/reading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          characterId: "numerolog",
          numerologToolId: "destiny_matrix",
          matrixSubjectId: "11111111-1111-4111-8111-111111111111",
          async: true,
          tarotCards: [],
        }),
      });
      return { status: res.status, body: await res.json() };
    });
    expect(first.status).toBe(202);
    expect(first.body.jobId).toBe(JOB_A);

    const pending = await page.evaluate(async () => {
      const res = await fetch("/api/jobs/active");
      return res.json();
    });
    expect(pending.jobs[0]?.status).toBe("pending");

    const retry = await page.evaluate(async () => {
      const res = await fetch("/api/reading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          characterId: "numerolog",
          numerologToolId: "destiny_matrix",
          matrixSubjectId: "11111111-1111-4111-8111-111111111111",
          async: true,
          tarotCards: [],
        }),
      });
      return { status: res.status, body: await res.json() };
    });
    expect(retry.body.deduped).toBe(true);
    expect(retry.body.jobId).toBe(JOB_A);
    expect(backend.getChargeCount()).toBe(1);

    const ready = await page.evaluate(async () => {
      const res = await fetch("/api/jobs/44444444-4444-4444-8444-444444444444");
      return res.json();
    });
    expect(ready.status).toBe("completed");

    const reopen = await page.evaluate(async () => {
      const res = await fetch("/api/reading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          characterId: "numerolog",
          numerologToolId: "destiny_matrix",
          matrixSubjectId: "11111111-1111-4111-8111-111111111111",
          async: true,
          tarotCards: [],
        }),
      });
      return { status: res.status, body: await res.json() };
    });
    expect(reopen.status).toBe(200);
    expect(reopen.body.reused).toBe(true);
    expect(backend.getChargeCount()).toBe(1);
    expect(backend.getBalance()).toBe(200);

    const ownership = await page.evaluate(async () => {
      const getSnap = await fetch(
        "/api/numerology/matrix-snapshot?subjectId=22222222-2222-4222-8222-222222222222"
      );
      const del = await fetch("/api/numerology/matrix-report", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subjectId: "22222222-2222-4222-8222-222222222222" }),
      });
      const retryForeign = await fetch("/api/reading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          characterId: "numerolog",
          numerologToolId: "destiny_matrix",
          matrixSubjectId: "22222222-2222-4222-8222-222222222222",
          async: true,
          tarotCards: [],
        }),
      });
      return {
        snap: getSnap.status,
        del: del.status,
        retry: retryForeign.status,
      };
    });
    expect(ownership.snap).toBe(404);
    expect(ownership.del).toBe(403);
    expect(ownership.retry).toBe(403);

    await page.goto("/cabinet");
    const history = await page.evaluate(async () => {
      const res = await fetch("/api/cabinet");
      return res.json();
    });
    expect(history.sessionsTotal).toBe(1);
    expect(history.sessions[0]?.spreadId).toContain("destiny_matrix");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/numerology/destiny-matrix");
    const mobileDate = page.locator('input[type="date"]').first();
    await expect(mobileDate).toBeVisible({ timeout: 20_000 });
    await mobileDate.fill(DOB);
    const mobileCalc = page.getByRole("button", { name: /Рассчитать бесплатно|Пересчитать/i }).first();
    if (await mobileCalc.isVisible().catch(() => false)) {
      await mobileCalc.click();
    }
    await expect(page.locator(".destiny-matrix svg, svg.destiny-matrix, [data-node-hit]").first()).toBeVisible({
      timeout: 20_000,
    });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2
    );
    expect(overflow).toBe(false);
  });

  test("ready-report tray performs a full navigation to the exact Matrix session", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await installMatrixBackend(page);
    await confirmAge(page);
    await page.setViewportSize({ width: 390, height: 844 });

    const destination =
      "/?master=numerolog&resume=chat&sessionId=55555555-5555-4555-8555-555555555555";
    await page.route("**/api/jobs/reports", async (route) => {
      await route.fulfill({
        json: {
          reports: [
            {
              jobId: JOB_A,
              kind: "numerology_reading",
              status: "completed",
              productTitle: "Разбор матрицы",
              etaRangeSec: null,
              destination,
              createdAt: "2026-09-05T07:00:00.000Z",
              startedAt: "2026-09-05T07:00:01.000Z",
              completedAt: "2026-09-05T07:05:00.000Z",
              heartbeatAt: "2026-09-05T07:05:00.000Z",
              attempts: 1,
              nextAttemptAt: null,
              billingState: "charged",
              refunded: false,
              queuePosition: null,
              notification: { in_app: "delivered" },
            },
          ],
        },
      });
    });

    await page.goto("/");
    const cookieChoice = page.getByRole("button", {
      name: "Только необходимые",
      exact: true,
    });
    if (await cookieChoice.isVisible()) await cookieChoice.click();
    await page.getByRole("button", { name: "Отчёт готов", exact: true }).click();
    const reportLink = page.getByRole("link", { name: /Разбор матрицы.*Открыть/i });
    await expect(reportLink).toHaveAttribute("href", destination);

    const documentNavigation = page.waitForRequest(
      (request) =>
        request.resourceType() === "document" &&
        request.url().includes("sessionId=55555555-5555-4555-8555-555555555555")
    );
    await reportLink.click();
    await documentNavigation;
  });
});
