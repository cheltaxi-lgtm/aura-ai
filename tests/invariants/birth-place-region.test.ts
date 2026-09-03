import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/natal/geonames", () => ({ resolveGeonamesCity: () => null, searchGeonames: () => [] }));
import { resolveBirthPlace } from "@/lib/natal/geocode";

describe("birth place region preservation", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("filters online primary-name fallback using the requested country and region", async () => {
    const lookup = vi.fn(async (input: string) => {
      const query = new URL(input).searchParams.get("name");
      return new Response(JSON.stringify({ results: query === "London" ? [
        { name: "London", admin1: "England", country: "United Kingdom", latitude: 51.5, longitude: -0.1, timezone: "Europe/London" },
        { name: "London", admin1: "Ontario", country: "Canada", latitude: 42.98, longitude: -81.24, timezone: "America/Toronto" },
      ] : [] }));
    });
    vi.stubGlobal("fetch", lookup);
    expect((await resolveBirthPlace("London, Ontario, Canada"))?.timezone).toBe("America/Toronto");
  });

  it("returns no match when a qualified place cannot be verified", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ results: [
      { name: "Moscow", admin1: "Moscow", country: "Russia", latitude: 55.75, longitude: 37.61, timezone: "Europe/Moscow" },
    ] }))));
    expect(await resolveBirthPlace("Moscow, Idaho, United States")).toBeNull();
  });
});
