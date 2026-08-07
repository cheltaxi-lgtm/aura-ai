import { getProPdfChromiumPath, isProPdfEnabled, getProPdfRenderSecret } from "../config";

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

  const executablePath =
    getProPdfChromiumPath() ||
    process.env.CHROME_PATH?.trim() ||
    process.env.PUPPETEER_EXECUTABLE_PATH?.trim() ||
    "/usr/bin/chromium-browser";

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

  const origins = [
    opts.origin.replace(/\/$/, ""),
    process.env.ASYNC_JOB_APP_URL?.trim()?.replace(/\/$/, "") || "",
    "http://127.0.0.1:3000",
    "http://localhost:3000",
  ].filter((v, i, a) => Boolean(v) && a.indexOf(v) === i);

  const browser = await launch({
    executablePath,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--font-render-hinting=none",
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({
      "x-pro-pdf-render-secret": secret,
    });
    let lastErr: unknown = null;
    for (const origin of origins) {
      try {
        const printUrl = new URL(`/r/${opts.token}/print`, origin);
        printUrl.searchParams.set("pdfRender", "1");
        await page.goto(printUrl.toString(), {
          waitUntil: "networkidle0",
          timeout: 90_000,
        });
        await page.waitForSelector(".pro-report-ready", { timeout: 45_000 });
        // Allow client charts a beat to paint
        await new Promise((r) => setTimeout(r, 1500));
        const pdf = await page.pdf({
          format: "A4",
          printBackground: true,
          margin: { top: "14mm", right: "12mm", bottom: "16mm", left: "12mm" },
        });
        return Buffer.from(pdf);
      } catch (e) {
        lastErr = e;
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
