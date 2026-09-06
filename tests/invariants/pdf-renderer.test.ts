import { describe, expect, it, vi } from "vitest";
import type { Browser } from "puppeteer-core";
import { closePdfBrowser, renderReportPdf } from "@/lib/reports/render-pdf";
describe("PDF renderer cleanup", () => {
  it("kills its own hung browser after the cleanup deadline", async () => {
    vi.useFakeTimers();
    const kill=vi.fn();
    const browser={close:()=>new Promise(()=>{}),process:()=>({kill})} as unknown as Browser;
    const closed=closePdfBrowser(browser);
    await vi.advanceTimersByTimeAsync(3001); await closed;
    expect(kill).toHaveBeenCalledWith("SIGKILL"); vi.useRealTimers();
  });
  it("rejects unauthenticated private rendering before starting a browser", async () => {
    await expect(renderReportPdf({path:"/cabinet/readings/11111111-1111-4111-8111-111111111111/print"})).rejects.toMatchObject({status:401});
  });
});
