import { afterEach, expect, it, vi } from "vitest";
import { fetchRuneConfig, invalidateRuneConfigCache } from "@/lib/useRuneConfig";

afterEach(() => {
  invalidateRuneConfigCache();
  vi.unstubAllGlobals();
});

it("preserves a server-disabled starter grant so the photo offer cannot promise fallback runes", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ enabled: true, starterRunes: 0, costs: { VISION_ANALYSIS: 30 } }),
  }));
  expect((await fetchRuneConfig()).starterRunes).toBe(0);
});
