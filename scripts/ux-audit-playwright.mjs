/**
 * Read-only UX smoke against production (no purchases, no destructive actions).
 * Usage: node scripts/ux-audit-playwright.mjs
 */
import { chromium } from "playwright";

const BASE = process.env.UX_AUDIT_BASE || "https://zovus.ru";

const pages = [
  { path: "/", expect: /Zovus|расклад|Таро|мастер/i },
  { path: "/auth", expect: /войти|регистр|практик|пользовател/i },
  { path: "/auth/user/login", expect: /войти|парол|email|почт/i },
  { path: "/auth/user/register", expect: /регистр|парол|email|почт/i },
  { path: "/dizayn-cheloveka", expect: /Дизайн|бодиграф|тип/i },
  { path: "/dizayn-cheloveka/rasschitat", expect: /Дата|время|место|расчёт/i },
  { path: "/dizayn-cheloveka/sovmestimost", expect: /совместим/i },
  { path: "/dizayn-cheloveka/sovmestimost/rasschitat", expect: /совместим|человек|дата/i },
  { path: "/dizayn-cheloveka/tipy", expect: /тип|генератор|проектор|манифестор/i },
  { path: "/numerology/destiny-matrix", expect: /матриц|судьб/i },
  { path: "/numerology", expect: /нумеролог/i },
  { path: "/numerology/pythagoras-square", expect: /квадрат|пифагор|числ/i },
  { path: "/numerology/compatibility", expect: /совместим|нумеролог/i },
  { path: "/natalnaya-karta", expect: /натал|астролог|карт/i },
  { path: "/obryady", expect: /обряд/i },
  { path: "/obryady/pritjazhenie", expect: /обряд|притяж|ритуал/i },
  { path: "/photo-rasklad", expect: /фото|расклад/i },
  { path: "/joint-reading", expect: /совместн|парн|расклад|два/i },
  { path: "/rasklady", expect: /расклад/i },
  { path: "/rasklady/lyubov", expect: /любов|расклад/i },
  { path: "/taro", expect: /таро|карт/i },
  { path: "/gadanie", expect: /гадан|расклад|карт/i },
  { path: "/gadanie/da-net", expect: /да|нет|гадан/i },
  { path: "/zovus-pro", expect: /Pro|практик|Zovus/i },
  { path: "/pro", expect: /Pro|практик|Zovus/i },
  { path: "/cabinet", expect: /вход|кабинет|логин|auth|войти/i },
  { path: "/faq", expect: /вопрос|FAQ|как/i },
  { path: "/partners", expect: /партнёр|партнер|сотруднич/i },
  { path: "/offer", expect: /оферт|услови|договор/i },
  { path: "/diary", expect: /дневник|вход|войти|кабинет/i },
  { path: "/session/intention", expect: /намер|вопрос|расклад|сесс/i },
  { path: "/runy", expect: /рун/i },
  { path: "/cards", expect: /карт|колод/i },
  { path: "/lenormand", expect: /ленорман|карт/i },
  { path: "/prognoz", expect: /прогноз|карт|день/i },
];

const findings = [];

function add(level, area, message, extra = {}) {
  findings.push({ level, area, message, ...extra });
  const mark = level === "PASS" ? "✓" : level === "FAIL" ? "✗" : "!";
  console.log(`${mark} [${level}] ${area}: ${message}`);
}

async function acceptAgeIfPresent(page) {
  const ageBtn = page.getByRole("button", { name: /мне есть 18|мне 18|подтверждаю|да, мне есть/i }).first();
  if (await ageBtn.count()) {
    await ageBtn.click().catch(() => undefined);
    await page.waitForTimeout(500);
  }
  // cookie/consent
  const ok = page.getByRole("button", { name: /принять|согласен|ок|хорошо/i }).first();
  if (await ok.count()) {
    await ok.click().catch(() => undefined);
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    locale: "ru-RU",
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(45000);

  const consoleErrors = [];
  page.on("pageerror", (err) => consoleErrors.push(String(err)));
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  for (const item of pages) {
    const url = `${BASE}${item.path}`;
    consoleErrors.length = 0;
    let status = null;
    try {
      const resp = await page.goto(url, { waitUntil: "domcontentloaded" });
      status = resp?.status() ?? null;
      await page.waitForTimeout(1000);
      await acceptAgeIfPresent(page);
      const title = await page.title();
      const body = (await page.locator("body").innerText().catch(() => "")) || "";
      const textOk = item.expect.test(`${title}\n${body}`);
      if (status && status >= 400) {
        add("FAIL", item.path, `HTTP ${status}`, { title });
      } else if (!textOk) {
        add("WARN", item.path, `Loaded but expected content missing (HTTP ${status})`, {
          title,
          sample: body.slice(0, 180).replace(/\s+/g, " "),
        });
      } else {
        add("PASS", item.path, `OK HTTP ${status}`, { title });
      }
      const fatal = consoleErrors.filter(
        (e) =>
          !/favicon|ResizeObserver|hydration|third-party|gtag|metrika|yandex|Failed to load resource|403|net::ERR/i.test(
            e
          )
      );
      if (fatal.length) {
        add("WARN", item.path, `Console errors: ${fatal.slice(0, 2).join(" | ").slice(0, 220)}`);
      }
    } catch (e) {
      add("FAIL", item.path, `Navigation failed: ${e.message}`);
    }
  }

  // --- HD calculator (guest free chart) ---
  try {
    await page.goto(`${BASE}/dizayn-cheloveka/rasschitat`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    await acceptAgeIfPresent(page);

    const date = page.locator('input[type="date"], #hd-date').first();
    if (await date.count()) await date.fill("1990-05-15");

    const timeUnknown = page.getByText(/не знаю время|время неизвестно/i).first();
    if (await timeUnknown.count()) {
      await timeUnknown.click().catch(() => undefined);
      const cb = page.locator('input[type="checkbox"]').first();
      if (await cb.count()) await cb.check().catch(() => undefined);
    }

    const place = page.locator("#hd-place, input[placeholder*='место' i]").first();
    if (await place.count()) {
      await place.fill("Москва");
      await page.waitForTimeout(900);
      const suggestion = page.locator(".hd-places__item, [role='option']").first();
      if (await suggestion.count()) await suggestion.click().catch(() => undefined);
    }

    const submit = page
      .getByRole("button", { name: /рассчитать|получить карту|посчитать/i })
      .first();
    if (await submit.count()) {
      await submit.click();
      await page.waitForTimeout(9000);
      const body = await page.locator("body").innerText();
      if (/Манифестор|Генератор|Проектор|Рефлектор|тип|стратег|авторитет|бодиграф/i.test(body)) {
        add("PASS", "HD calculator", "Chart result UI appeared after submit");
      } else {
        add("WARN", "HD calculator", "Submit done but result markers not found", {
          sample: body.slice(0, 240).replace(/\s+/g, " "),
        });
      }
    } else {
      add("WARN", "HD calculator", "Submit button not found");
    }
  } catch (e) {
    add("FAIL", "HD calculator", e.message);
  }

  // --- Destiny matrix calculate ---
  try {
    await page.goto(`${BASE}/numerology/destiny-matrix`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    await acceptAgeIfPresent(page);

    const date = page.locator('input[type="date"]').first();
    if (await date.count()) {
      await date.fill("1990-05-15");
      const btn = page
        .getByRole("button", { name: /рассчитать|показать|получить|построить|считать/i })
        .first();
      if (await btn.count()) {
        await btn.click();
        await page.waitForTimeout(5000);
      } else {
        // maybe auto-calc on date change
        await page.waitForTimeout(2000);
      }
      const body = await page.locator("body").innerText();
      const hasMatrix =
        /матриц/i.test(body) &&
        (/энерг|аркан|канал|зона|судьб|число|центр|предназнач/i.test(body) ||
          (await page.locator("svg, canvas, .destiny-matrix, [class*='matrix']").count()) > 0);
      if (hasMatrix) {
        add("PASS", "Destiny matrix calc", "Matrix preview/result visible after date");
      } else {
        add("WARN", "Destiny matrix calc", "Date filled but matrix markers weak", {
          sample: body.slice(0, 220).replace(/\s+/g, " "),
        });
      }
    } else {
      add("WARN", "Destiny matrix calc", "Date input not found");
    }
  } catch (e) {
    add("FAIL", "Destiny matrix calc", e.message);
  }

  // --- Pythagoras square ---
  try {
    await page.goto(`${BASE}/numerology/pythagoras-square`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);
    await acceptAgeIfPresent(page);
    const date = page.locator('input[type="date"]').first();
    if (await date.count()) {
      await date.fill("1990-05-15");
      const btn = page.getByRole("button", { name: /рассчитать|показать|посчитать|получить/i }).first();
      if (await btn.count()) await btn.click();
      await page.waitForTimeout(3000);
      const body = await page.locator("body").innerText();
      if (/квадрат|пифагор|характер|числ|\d/i.test(body)) {
        add("PASS", "Pythagoras", "Square UX responds to date");
      } else {
        add("WARN", "Pythagoras", "Weak result markers", {
          sample: body.slice(0, 180).replace(/\s+/g, " "),
        });
      }
    } else {
      add("WARN", "Pythagoras", "No date input");
    }
  } catch (e) {
    add("FAIL", "Pythagoras", e.message);
  }

  // --- Natal page shell + CTA ---
  try {
    await page.goto(`${BASE}/natalnaya-karta`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);
    await acceptAgeIfPresent(page);
    const body = await page.locator("body").innerText();
    const hasForm =
      (await page.locator('input[type="date"]').count()) > 0 ||
      /дата|время|место|натал/i.test(body);
    if (hasForm) add("PASS", "Natal page", "Form/shell present");
    else add("WARN", "Natal page", "Form markers missing");
  } catch (e) {
    add("FAIL", "Natal page", e.message);
  }

  // --- Rituals list + detail ---
  try {
    await page.goto(`${BASE}/obryady`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);
    const links = page.locator('a[href*="/obryady/"]');
    const n = await links.count();
    if (n > 0) {
      add("PASS", "Rituals list", `Found ${n} ritual links`);
      await links.first().click();
      await page.waitForTimeout(1500);
      const body = await page.locator("body").innerText();
      if (/обряд|руны|оплат|начать|стоимость|энерг/i.test(body)) {
        add("PASS", "Ritual detail", `Detail OK: ${page.url()}`);
      } else {
        add("WARN", "Ritual detail", "Detail content weak", { url: page.url() });
      }
    } else {
      add("WARN", "Rituals list", "No ritual detail links found");
    }
  } catch (e) {
    add("FAIL", "Rituals", e.message);
  }

  // --- Spreads / intention ---
  try {
    await page.goto(`${BASE}/rasklady`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);
    await acceptAgeIfPresent(page);
    const links = page.locator('a[href*="/rasklady/"], a[href*="/session"], a[href*="/gadanie"]');
    const n = await links.count();
    if (n > 0) add("PASS", "Spreads catalog", `${n} spread/session links`);
    else add("WARN", "Spreads catalog", "Few/no spread links");

    await page.goto(`${BASE}/session/intention`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    await acceptAgeIfPresent(page);
    const body = await page.locator("body").innerText();
    if (/намер|вопрос|карт|расклад|мастер|выбер/i.test(body)) {
      add("PASS", "Intention session", "Session flow shell present");
    } else {
      add("WARN", "Intention session", "Unexpected shell", {
        sample: body.slice(0, 180).replace(/\s+/g, " "),
        url: page.url(),
      });
    }
  } catch (e) {
    add("FAIL", "Spreads", e.message);
  }

  // --- Photo reading shell ---
  try {
    await page.goto(`${BASE}/photo-rasklad`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);
    await acceptAgeIfPresent(page);
    const body = await page.locator("body").innerText();
    const hasUpload =
      (await page.locator('input[type="file"]').count()) > 0 ||
      /загруз|фото|выбер|снимок/i.test(body);
    if (hasUpload) add("PASS", "Photo reading", "Upload/flow shell present");
    else add("WARN", "Photo reading", "Upload UI not obvious");
  } catch (e) {
    add("FAIL", "Photo reading", e.message);
  }

  // --- Joint reading ---
  try {
    await page.goto(`${BASE}/joint-reading`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);
    await acceptAgeIfPresent(page);
    const body = await page.locator("body").innerText();
    if (/совместн|партн|двое|оба|второ/i.test(body) || /вход|войти/i.test(body)) {
      add("PASS", "Joint reading", "Page/flow present (or auth gate)");
    } else {
      add("WARN", "Joint reading", "Weak markers", {
        sample: body.slice(0, 160).replace(/\s+/g, " "),
      });
    }
  } catch (e) {
    add("FAIL", "Joint reading", e.message);
  }

  // --- Paywall / runes packages visible somewhere ---
  try {
    const res = await page.request.get(`${BASE}/api/runes/packages`);
    const json = await res.json().catch(() => null);
    const pkgs = json?.packages || json?.items || (Array.isArray(json) ? json : null);
    if (res.ok() && (pkgs?.length || json)) {
      add("PASS", "Runes packages API", `HTTP ${res.status()}`, {
        count: Array.isArray(pkgs) ? pkgs.length : "object",
      });
    } else {
      add("WARN", "Runes packages API", `HTTP ${res.status()}`);
    }
  } catch (e) {
    add("FAIL", "Runes packages API", e.message);
  }

  // --- Cabinet gate ---
  try {
    await page.goto(`${BASE}/cabinet`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    const url = page.url();
    const text = await page.locator("body").innerText();
    if (/auth|login/i.test(url) || /войти|логин|вход|регистр/i.test(text)) {
      add("PASS", "Cabinet gate", `Unauth gated (${url})`);
    } else {
      add("WARN", "Cabinet gate", `Unexpected access: ${url}`);
    }
  } catch (e) {
    add("FAIL", "Cabinet gate", e.message);
  }

  // --- Pro landing ---
  try {
    await page.goto(`${BASE}/zovus-pro`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);
    const body = await page.locator("body").innerText();
    if (/Pro|практик|клиент|CRM|кабинет практика/i.test(body)) {
      add("PASS", "Zovus Pro", "Landing present");
    } else {
      add("WARN", "Zovus Pro", "Landing markers weak");
    }
  } catch (e) {
    add("FAIL", "Zovus Pro", e.message);
  }

  // --- HD compatibility calculator shell ---
  try {
    await page.goto(`${BASE}/dizayn-cheloveka/sovmestimost/rasschitat`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(1200);
    const dates = await page.locator('input[type="date"]').count();
    if (dates >= 1) {
      add("PASS", "HD compatibility", `Form with ${dates} date field(s)`);
    } else {
      add("WARN", "HD compatibility", "Date fields not found");
    }
  } catch (e) {
    add("FAIL", "HD compatibility", e.message);
  }

  // Features
  try {
    const res = await page.request.get(`${BASE}/api/platform/features`);
    const json = await res.json();
    add("PASS", "Features API", `HTTP ${res.status()}`, { sample: json });
  } catch (e) {
    add("FAIL", "Features API", e.message);
  }

  await browser.close();

  const summary = {
    pass: findings.filter((f) => f.level === "PASS").length,
    warn: findings.filter((f) => f.level === "WARN").length,
    fail: findings.filter((f) => f.level === "FAIL").length,
  };
  console.log("\n=== SUMMARY ===");
  console.log(JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ findings }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
