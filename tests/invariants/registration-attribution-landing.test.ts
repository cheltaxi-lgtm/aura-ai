import { afterEach, describe, expect, it, vi } from "vitest";
import {
  captureUtmFromLocation,
  readUtmAttribution,
  utmParamsForMetrika,
} from "@/lib/utm/attribution";
import { sanitizeRegistrationAttribution } from "@/lib/registration-attribution";
import { persistRegistrationAttribution } from "@/lib/persist-registration-attribution";

afterEach(() => vi.unstubAllGlobals());

describe("first landing attribution", () => {
  it("keeps a direct landing path through registration without inventing a campaign", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("window", { location: { search: "", pathname: "/aura" } });
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    });

    captureUtmFromLocation();
    expect(sanitizeRegistrationAttribution(readUtmAttribution())).toMatchObject({
      landingPath: "/aura",
    });
    expect(readUtmAttribution()?.utm_source).toBeUndefined();

    captureUtmFromLocation("?utm_source=yandex&utm_campaign=photo", "/photo-rasklad");
    expect(readUtmAttribution()).toMatchObject({
      landingPath: "/aura",
      utm_source: "yandex",
      utm_campaign: "photo",
    });
    captureUtmFromLocation("?utm_source=vk", "/taro");
    expect(readUtmAttribution()?.utm_source).toBe("yandex");
  });

  it("rejects timestamps without a landing or campaign", () => {
    expect(sanitizeRegistrationAttribution({ capturedAt: "2026-09-28T00:00:00Z" })).toBeNull();
  });

  it("persists a direct landing through the post-auth fallback", async () => {
    const values = new Map<string, string>();
    const fetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("window", { location: { search: "", pathname: "/partners" } });
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    });
    vi.stubGlobal("fetch", fetch);

    captureUtmFromLocation();
    await persistRegistrationAttribution();
    expect(fetch).toHaveBeenCalledWith("/api/profile/registration-attribution", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ attribution: { landingPath: "/partners", capturedAt: readUtmAttribution()?.capturedAt } }),
    }));
  });

  it("redacts private and token-bearing paths before storage or analytics", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("window", { location: { search: "", pathname: "/share/secret-token" } });
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    });

    expect(captureUtmFromLocation()).toBeNull();
    expect(values.size).toBe(0);
    expect(sanitizeRegistrationAttribution({ landingPath: "/reports/shared/secret-token" })).toBeNull();

    captureUtmFromLocation("?utm_source=email", "/joint-reading/secret-token");
    expect(readUtmAttribution()).toMatchObject({ utm_source: "email" });
    expect(readUtmAttribution()?.landingPath).toBeUndefined();
    expect(utmParamsForMetrika().landing_path).toBeUndefined();
    expect(sanitizeRegistrationAttribution({ landingPath: "/statyi/private-article" })).toMatchObject({ landingPath: "/statyi" });
  });
});
