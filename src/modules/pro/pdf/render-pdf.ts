import { existsSync } from "node:fs";
import { getProPdfChromiumPath, isProPdfEnabled, getProPdfRenderSecret } from "../config";

function resolveChromiumExecutable(): string {
  const configured = getProPdfChromiumPath();
  // Debian/Ubuntu wrapper shells out to snap and often breaks headless PDF.
  const normalizedConfigured =
    configured === "/usr/bin/chromium-browser" && existsSync("/snap/bin/chromium")
      ? "/snap/bin/chromium"
      : configured;

  const candidates = [
    normalizedConfigured,
    process.env.CHROME_PATH?.trim(),
    process.env.PUPPETEER_EXECUTABLE_PATH?.trim(),
    "/snap/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/usr/bin/google-chrome",
  ].filter((v): v is string => Boolean(v && v.trim()));

  for (const path of candidates) {
    if (existsSync(path)) return path;
  }
  return candidates[0] || "/usr/bin/chromium-browser";
}

export async function renderProReportPdf(opts: {
  token: string;
  origin: string;
}): Promise<Buffer> {
  if (!isProPdfEnabled()) {
    throw Object.assign(new Error("pdf_disabled"), { status: 503 });
  }

  const secret = getProPdfRenderSecret();
  if (!secret) {
    throw Object.assign(new Error("pdf_secret_missing"), { status: 503 });
  }

  const executablePath = resolveChromiumExecutable();

  let launch: typeof import("puppeteer-core").launch;
  try {
    const mod = await import("puppeteer-core");
    launch = mod.default?.launch ?? mod.launch;
  } catch {
    throw Object.assign(new Error("puppeteer_not_installed"), { status: 503 });
  }
  if (!launch) {
    throw Object.assign(new Error("puppeteer_launch_missing"), { status: 503 });
  }

  // Prefer loopback first — public HTTPS can hang Chromium behind Caddy/CSP.
  const origins = [
    process.env.ASYNC_JOB_APP_URL?.trim()?.replace(/\/$/, "") || "",
    "http://127.0.0.1:3000",
    "http://localhost:3000",
    opts.origin.replace(/\/$/, ""),
  ].filter((v, i, a) => Boolean(v) && a.indexOf(v) === i);

  const browser = await launch({
    executablePath,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--font-render-hinting=none",
      "--single-process",
    ],
  });

  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(120_000);
    page.setDefaultNavigationTimeout(120_000);
    await page.setExtraHTTPHeaders({
      "x-pro-pdf-render-secret": secret,
    });
    let lastErr: unknown = null;
    for (const origin of origins) {
      try {
        const printUrl = new URL(`/r/${opts.token}/print`, origin);
        printUrl.searchParams.set("pdfRender", "1");
        // networkidle0 never settles on pages with analytics/chunk polling.
        await page.goto(printUrl.toString(), {
          waitUntil: "domcontentloaded",
          timeout: 90_000,
        });
        await page.waitForSelector(".pro-report-ready[data-pro-report-loaded='1']", {
          timeout: 60_000,
        });
        // Allow client charts a beat to paint
        await new Promise((r) => setTimeout(r, 2000));
        const pdf = await page.pdf({
          format: "A4",
          printBackground: true,
          margin: { top: "14mm", right: "12mm", bottom: "16mm", left: "12mm" },
        });
        return Buffer.from(pdf);
      } catch (e) {
        lastErr = e;
        console.warn(
          `[pro-pdf] origin failed origin=${origin}`,
          e instanceof Error ? e.message : e
        );
      }
    }
    throw Object.assign(
      new Error(
        lastErr instanceof Error
          ? `pdf_render_failed: ${lastErr.message}`
          : "pdf_render_failed"
      ),
      { status: 502 }
    );
  } finally {
    await browser.close().catch(() => undefined);
  }
}
