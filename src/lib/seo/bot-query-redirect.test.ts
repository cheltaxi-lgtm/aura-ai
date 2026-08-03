import { describe, expect, it } from "vitest";
import { resolveBotHomeQueryRedirect } from "./bot-query-redirect";

describe("resolveBotHomeQueryRedirect", () => {
  it("sends photo deep-links to /photo-rasklad", () => {
    expect(resolveBotHomeQueryRedirect(new URLSearchParams("photo=1&mode=mark"))).toBe(
      "/photo-rasklad"
    );
  });

  it("sends indexable intents to /rasklady/{slug}", () => {
    expect(resolveBotHomeQueryRedirect(new URLSearchParams("intent=na-vernost"))).toBe(
      "/rasklady/na-vernost"
    );
  });

  it("collapses other app junk to /", () => {
    expect(resolveBotHomeQueryRedirect(new URLSearchParams("step=onboarding&welcome=1"))).toBe(
      "/"
    );
  });

  it("ignores marketing-only params (Clean-param territory)", () => {
    expect(resolveBotHomeQueryRedirect(new URLSearchParams("utm_source=yandex&yclid=1"))).toBe(
      null
    );
  });
});
