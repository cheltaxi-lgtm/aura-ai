import { expect, it, vi } from "vitest";

const settings = vi.hoisted(() => ({ multiplier: 4 }));

vi.mock("@/lib/db", () => ({ ensureDb: async () => true }));
vi.mock("@/lib/settings", () => ({
  getSetting: async () => ({ spreadOverrides: { "year-ahead": { costMultiplier: settings.multiplier } } }),
}));
vi.mock("@/lib/rune-settings", () => ({
  getRuneSettings: async () => ({ costs: { INTENTION_SPREAD: 30 } }),
  runeCostFromSettings: (value: { costs: Record<string, number> }, action: string) => value.costs[action],
}));

import { GET } from "@/app/api/rasklady/prices/route";

it("publishes the server charge with current admin multiplier and refreshes it", async () => {
  const now = Date.now();
  const clock = vi.spyOn(Date, "now").mockReturnValue(now);
  const first = await GET();
  expect(first.status).toBe(200);
  expect((await first.json()).prices["year-ahead"]).toBe(120);
  expect(first.headers.get("Cache-Control")).toBe("private, no-store");

  settings.multiplier = 2;
  clock.mockReturnValue(now + 6_000);
  const updated = await GET();
  expect((await updated.json()).prices["year-ahead"]).toBe(60);
  clock.mockRestore();
});
