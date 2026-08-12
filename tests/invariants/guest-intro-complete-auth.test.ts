import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Authenticated users must not mint acquisition guest receipts.
 * Route-level unit check without full Next request plumbing.
 */
describe("guest-intro complete authenticated gate", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("TEST6: complete route exports authenticated rejection contract", async () => {
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile(
        new URL("../../src/app/api/guest-triplet/complete/route.ts", import.meta.url),
        "utf8"
      )
    );
    expect(source).toContain("GUEST_INTRO_NOT_AVAILABLE_AUTHENTICATED");
    expect(source).toContain('auth?.role === "user"');
  });
});
