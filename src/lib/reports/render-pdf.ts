import { existsSync } from "node:fs";
import { allowPdfRequest, pdfOrigin, printPathKind } from "./pdf-policy";
import type { Browser } from "puppeteer-core";

export class PdfError extends Error {
  constructor(public readonly status: number, public readonly code: string) { super(code); }
}

const runtime = globalThis as typeof globalThis & { __zovusPdfActive?: number };
function executable(): string {
  const paths = [process.env.PRO_PDF_CHROMIUM_PATH, process.env.CHROME_PATH, process.env.PUPPETEER_EXECUTABLE_PATH,
    "/snap/bin/chromium", "/usr/bin/chromium", "/usr/bin/google-chrome", "/usr/bin/chromium-browser",
    "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"];
  const found = paths.find(p => p && existsSync(p));
  if (!found) throw new PdfError(503, "pdf_unavailable");
  if (found === "/usr/bin/chromium-browser" && existsSync("/snap/bin/chromium")) return "/snap/bin/chromium";
  return found;
}

export async function closePdfBrowser(browser: Browser | undefined): Promise<void> {
  if (!browser) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([browser.close(), new Promise<void>(resolve => {
      timer = setTimeout(() => { browser.process()?.kill("SIGKILL"); resolve(); }, 3000);
    })]);
  } catch { browser.process()?.kill("SIGKILL"); }
  finally { if (timer) clearTimeout(timer); }
}

/** Render only existing reports. Does not generate AI content or bypass page access. */
export async function renderReportPdf(options: { path: string; authCookie?: string }): Promise<Buffer> {
  const kind = printPathKind(options.path);
  if (!kind) throw new PdfError(400, "invalid_report_path");
  if (kind === "private" && !options.authCookie) throw new PdfError(401, "auth_required");
  if ((runtime.__zovusPdfActive ?? 0) >= 2) throw new PdfError(503, "pdf_busy");
  runtime.__zovusPdfActive = (runtime.__zovusPdfActive ?? 0) + 1;
  let browser: Browser | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const target = new URL(options.path, pdfOrigin(process.env.ASYNC_JOB_APP_URL));
    const { default: puppeteer } = await import("puppeteer-core");
    browser = await puppeteer.launch({ executablePath: executable(), headless: true, timeout: 15_000,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"] });
    const activeBrowser = browser;
    const work = async () => {
      const page = await activeBrowser.newPage();
      page.setDefaultTimeout(25_000);
      page.setDefaultNavigationTimeout(25_000);
      await page.setViewport({ width: 1100, height: 900, deviceScaleFactor: 1 });
      await page.emulateMediaType("print");
      await page.setRequestInterception(true);
      page.on("request", request => {
        if (request.method() !== "GET" || !allowPdfRequest(request.url(), request.resourceType(), target)) {
          void request.abort().catch(() => undefined);
        } else { void request.continue().catch(() => undefined); }
      });
      if (options.authCookie) await page.setCookie({ name: "aura_auth", value: options.authCookie,
        url: target.origin, httpOnly: true, secure: false, sameSite: "Lax" });
      const response = await page.goto(target.href, { waitUntil: "domcontentloaded" });
      if (!response?.ok()) throw new PdfError(response?.status() === 404 ? 404 : 502, "report_unavailable");
      await page.waitForFunction(() => Boolean(document.querySelector("[data-pdf-ready='true'],[data-pdf-error]")));
      if (await page.$("[data-pdf-error]")) throw new PdfError(422, "report_not_ready");
      await page.evaluate(async () => {
        await document.fonts.ready;
        const images = Array.from(document.querySelectorAll<HTMLImageElement>("[data-pdf-ready] img"));
        for (const img of images) { img.loading = "eager"; await img.decode(); }
        const svgImages = Array.from(document.querySelectorAll<SVGImageElement>("[data-pdf-ready] svg image"));
        for (const image of svgImages) {
          const img = new Image(); img.src = image.href.baseVal;
          await img.decode();
        }
      });
      const content = await page.$eval("[data-pdf-ready]", el => el.textContent?.trim() ?? "");
      if (content.length < 80) throw new PdfError(422, "report_not_ready");
      const bytes = await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true,
        displayHeaderFooter: true, headerTemplate: "<span></span>",
        footerTemplate: '<div style="font-family:Arial,sans-serif;font-size:9px;color:#786e60;width:100%;margin:0 17mm;display:flex;justify-content:space-between"><span>ZOVUS · Личный отчёт</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
        margin: { top: "16mm", bottom: "20mm", left: "17mm", right: "17mm" }, timeout: 20_000 });
      if (bytes.length > 30 * 1024 * 1024) throw new PdfError(413, "pdf_too_large");
      return Buffer.from(bytes);
    };
    return await Promise.race([work(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new PdfError(504, "pdf_timeout")), 70_000);
    })]);
  } catch (error) {
    if (error instanceof PdfError) throw error;
    // Browser errors can contain private tokens/URLs. Never return or log them.
    throw new PdfError(502, "pdf_render_failed");
  } finally {
    if (timer) clearTimeout(timer);
    try { await closePdfBrowser(browser); }
    finally { runtime.__zovusPdfActive = Math.max(0, (runtime.__zovusPdfActive ?? 1) - 1); }
  }
}
