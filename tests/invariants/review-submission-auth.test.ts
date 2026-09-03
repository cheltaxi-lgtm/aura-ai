import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), create: vi.fn(), rate: vi.fn(), pending: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getAuth: mocks.auth }));
vi.mock("@/lib/db", () => ({ ensureDb: vi.fn() }));
vi.mock("@/lib/api-guards", () => ({ clientIp: () => "127.0.0.1" }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: mocks.rate, rateLimitKey: () => "review" }));
vi.mock("@/lib/recaptcha-guard", () => ({ enforceRecaptchaScope: async () => null }));
vi.mock("@/lib/landing-reviews", () => ({
  landingReviewsEnabled: () => true,
  createUserReview: mocks.create,
  hasRecentPendingReview: mocks.pending,
  hashReviewIp: () => "hashed-ip",
  sanitizeReviewCity: (value: unknown) => value,
  parseReviewRating: (value: unknown) => value,
  validateReviewSubmission: (value: object) => ({ ok: true, ...value }),
}));
import { POST } from "@/app/api/reviews/route";

const request = () => new NextRequest("http://localhost/api/reviews", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: "Анна", body: "Спасибо за подробный разбор моего вопроса.", rating: 5, product: "tarot", userAccountId: "forged" }),
});

describe("review submission access", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.rate.mockResolvedValue({ allowed: true });
    mocks.pending.mockResolvedValue(false);
    mocks.create.mockResolvedValue({ id: "review" });
  });
  it.each([null, { sub: "expert", role: "expert" }, { sub: "admin", role: "admin" }])("rejects requests without a consumer account: %j", async (auth) => {
    mocks.auth.mockResolvedValue(auth);
    expect((await POST(request())).status).toBe(401);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.rate).not.toHaveBeenCalled();
  });
  it("accepts a user review for moderation with the session account", async () => {
    mocks.auth.mockResolvedValue({ sub: "real-account", role: "user" });
    const response = await POST(request());
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ pending: true });
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ userAccountId: "real-account" }));
  });
});
