import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), profile: vi.fn(), rate: vi.fn(), normalize: vi.fn(), persist: vi.fn() }));
vi.mock("@/lib/require-auth", () => ({ requireUserAuth: mocks.auth }));
vi.mock("@/lib/accounts", () => ({ getProfileUserIdForAccount: mocks.profile }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: mocks.rate, rateLimitKey: (...parts: string[]) => parts.join(":") }));
vi.mock("@/lib/scene-image-store", () => ({ normalizeSceneImageUrl: mocks.normalize }));
vi.mock("@/lib/users", () => ({ canPersistSceneUrl: () => true, persistSceneArtForSpread: mocks.persist }));
vi.mock("@/lib/chat-sanitize", () => ({ resolveApiCharacterId: vi.fn() }));
import { POST } from "@/app/api/image/persist/route";
const request = () => new NextRequest("http://localhost/api/image/persist", { method: "POST", body: JSON.stringify({ scene: "zodiac_avatar", imageUrl: "test-only" }), headers: { "Content-Type": "application/json" } });
describe("scene image persistence guards", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.auth.mockResolvedValue({ sub: "account" });
    mocks.profile.mockResolvedValue("profile");
    mocks.rate.mockResolvedValue({ allowed: true });
  });
  it("does not write an image without a linked profile", async () => {
    mocks.profile.mockResolvedValue(null);
    expect((await POST(request())).status).toBe(404);
    expect(mocks.normalize).not.toHaveBeenCalled();
    expect(mocks.persist).not.toHaveBeenCalled();
  });
  it("stops storage work before decoding when the account reaches its rate limit", async () => {
    mocks.rate.mockResolvedValue({ allowed: false, retryAfterSec: 120 });
    const response = await POST(request());
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("120");
    expect(mocks.normalize).not.toHaveBeenCalled();
  });
  it.each([["scene_art_too_large", 413], ["unsupported_scene_art_mime", 415]])("returns a useful response for %s", async (reason, status) => {
    mocks.normalize.mockRejectedValue(new Error(String(reason)));
    expect((await POST(request())).status).toBe(status);
    expect(mocks.persist).not.toHaveBeenCalled();
  });
});
