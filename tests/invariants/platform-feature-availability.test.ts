import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/maintenance-mode", () => ({
  fetchMaintenanceModeActive: async () => false,
  isMaintenanceBypassPath: () => false,
  isSearchEngineBot: () => false,
  MAINTENANCE_BOT_RETRY_AFTER_SEC: 60,
  MAINTENANCE_PAGE_PATH: "/maintenance",
}));

const enabled = {
  humanDesignEnabled: true, natalChartEnabled: true, jointReadingEnabled: true,
  ritualsEnabled: true, photoReadingEnabled: true, auraReadingEnabled: true,
  palmReadingEnabled: true,
};
const request = () => new NextRequest("https://fixture.invalid/gadanie-po-ladoni/linii");

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("AUTH_SECRET", "feature-availability-local-fake-secret");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("feature availability is distinct from an explicit product kill switch", () => {
  for (const failure of ["timeout", "http", "invalid-json", "incomplete-flags"] as const) {
    it(`${failure} returns a retryable 503 and recovers without a negative cache`, async () => {
      const fetcher = vi.fn();
      if (failure === "timeout") fetcher.mockRejectedValueOnce(new DOMException("Timed out", "TimeoutError"));
      else if (failure === "http") fetcher.mockResolvedValueOnce(Response.json(enabled, { status: 503 }));
      else if (failure === "invalid-json") fetcher.mockResolvedValueOnce(new Response("not-json"));
      else fetcher.mockResolvedValueOnce(Response.json({ palmReadingEnabled: true }));
      fetcher.mockResolvedValue(Response.json(enabled));
      vi.stubGlobal("fetch", fetcher);
      const { middleware } = await import("@/middleware");
      const unavailable = await middleware(request());
      expect(unavailable.status).toBe(503);
      expect(unavailable.headers.get("retry-after")).toBe("5");
      expect(unavailable.headers.get("cache-control")).toContain("no-store");
      expect(await unavailable.text()).not.toContain("Страница не найдена");
      expect((await middleware(request())).headers.get("x-middleware-next")).toBe("1");
      expect(fetcher).toHaveBeenCalledTimes(2);
      // Public feature availability never opens an unrelated private API.
      expect((await middleware(new NextRequest("https://fixture.invalid/api/notifications"))).status).toBe(401);
    });
  }

  it("keeps a confirmed disabled product at 404 and caches the valid response", async () => {
    const fetcher = vi.fn(async () => Response.json({ ...enabled, palmReadingEnabled: false }));
    vi.stubGlobal("fetch", fetcher);
    const { middleware } = await import("@/middleware");
    expect((await middleware(request())).status).toBe(404);
    expect((await middleware(request())).status).toBe(404);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("does not reuse expired enabled flags when the backend is unavailable", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json(enabled))
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(Response.json({ ...enabled, palmReadingEnabled: false }));
    vi.stubGlobal("fetch", fetcher);
    const { middleware } = await import("@/middleware");
    expect((await middleware(request())).headers.get("x-middleware-next")).toBe("1");
    vi.setSystemTime(Date.now() + 16_000);
    expect((await middleware(request())).status).toBe(503);
    expect((await middleware(request())).status).toBe(404);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("coalesces simultaneous feature checks while preserving explicit flags", async () => {
    let resolve!: (response: Response) => void;
    const pending = new Promise<Response>(done => { resolve = done; });
    const fetcher = vi.fn(() => pending);
    vi.stubGlobal("fetch", fetcher);
    const { fetchPlatformFeatureState } = await import("@/lib/platform-feature-gate");
    const first = fetchPlatformFeatureState();
    const second = fetchPlatformFeatureState();
    expect(fetcher).toHaveBeenCalledTimes(1);
    resolve(Response.json({ ...enabled, auraReadingEnabled: false }));
    expect(await first).toEqual({ available: true, flags: { ...enabled, auraReadingEnabled: false } });
    expect(await second).toEqual(await first);
  });
});
