import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/maintenance-mode", () => ({
  fetchMaintenanceModeActive: async () => false,
  isMaintenanceBypassPath: () => false,
  isSearchEngineBot: () => false,
  MAINTENANCE_BOT_RETRY_AFTER_SEC: 60,
  MAINTENANCE_PAGE_PATH: "/maintenance",
}));

import { middleware } from "@/middleware";

beforeEach(() => vi.stubEnv("AUTH_SECRET", "rasklady-price-test-secret"));
afterEach(() => vi.unstubAllEnvs());

it("allows anonymous price reads but keeps mutation and private APIs gated", async () => {
  for (const route of ["/api/rasklady/prices", "/api/photo-reading/pricing"]) {
    for (const method of ["GET", "HEAD"]) {
      const response = await middleware(new NextRequest(`https://zovus.ru${route}`, { method }));
      expect(response.headers.get("x-middleware-next")).toBe("1");
    }
    const write = await middleware(new NextRequest(`https://zovus.ru${route}`, { method: "POST" }));
    expect(write.status).toBe(401);
  }
  const privateApi = await middleware(new NextRequest("https://zovus.ru/api/rasklady/private"));
  expect(privateApi.status).toBe(401);
});
