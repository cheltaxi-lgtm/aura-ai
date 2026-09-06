import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { readFileSync } from "node:fs";
import path from "node:path";

const m = vi.hoisted(() => ({
  auth: vi.fn(),
  ageConfirmed: vi.fn(),
  rateLimit: vi.fn(),
  generate: vi.fn(),
  profileId: vi.fn(),
  balance: vi.fn(),
}));

vi.mock("@/lib/settings", () => ({ isPhotoReadingEnabled: async () => true }));
vi.mock("@/lib/require-auth", () => ({ requireUserAuth: m.auth }));
vi.mock("@/lib/age-gate", () => ({
  AGE_REQUIRED_ERROR: { error: "Подтвердите возраст", code: "age_required" },
  isUserAgeEligible: () => true,
}));
vi.mock("@/lib/age-gate-cookie", () => ({ isAgeGateCookieConfirmed: m.ageConfirmed }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: m.rateLimit,
  rateLimitKey: (prefix: string, id: string) => `${prefix}:${id}`,
}));
vi.mock("@/lib/api-guards", () => ({
  clientIp: () => "203.0.113.5",
  enforcePaidRouteRateLimit: async () => null,
  MAX_IMAGE_BYTES: 64,
  validateImageMime: () => null,
  validateImageBase64Payload: () => null,
}));
vi.mock("@/lib/photo-reading-prompts", () => ({
  resolvePhotoRecognitionPrompt: async () => "recognize",
  generatePhotoRecognition: m.generate,
  parsePhotoReadingResponse: () => ({
    deckType: "Таро",
    spreadType: "Одна карта",
    detectedCards: ["Шут"],
    cardConfidences: ["high"],
  }),
}));
vi.mock("@/lib/image-dimensions", () => ({
  getImageDimensionsFromBase64: () => ({ width: 800, height: 1200 }),
  isLandscapePhotoBase64: () => false,
  isWideOrSquarePhotoBase64: () => false,
}));
vi.mock("@/lib/accounts", () => ({
  getProfileUserIdForAccount: m.profileId,
  resolveUnlimitedAccess: async () => false,
}));
vi.mock("@/lib/users", () => ({
  getUserById: async () => ({ id: "profile" }),
  serializeUserProfile: () => ({ name: "Test" }),
}));
vi.mock("@/lib/photo-reading-billing", () => ({ resolvePhotoReadingPricing: async () => ({ effectiveCost: 30 }) }));
vi.mock("@/lib/rune-service", () => ({
  getRuneBalance: m.balance,
  isRuneBillingActive: () => true,
}));
vi.mock("@/lib/rune-settings", () => ({ getRuneSettings: async () => ({ enabled: true }) }));
vi.mock("@/lib/insufficient-runes", () => ({ insufficientRunesResponse: () => new Response(null, { status: 402 }) }));
vi.mock("@/lib/error-report", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/chat-sanitize", () => ({
  resolveApiCharacterId: async () => "veronika",
  sanitizeTextField: (value: unknown) => typeof value === "string" ? value : undefined,
}));
vi.mock("@/lib/photo-spread-redraw", () => ({
  isRecognizedSpread: () => ({ ok: true }),
  isUnrecognizedCardLabel: () => false,
  mapDetectedToRedrawSpread: () => ({
    system: "tarot-veronika",
    deckType: "Таро",
    spreadType: "Одна карта",
    cards: [{ name: "Шут", originalName: "Шут", reversed: false, position: "Суть", imagePath: "/fool.webp", shortMeaning: "", placeholder: false, order: 0 }],
  }),
  normalizeRedrawSpreadForMaster: (spread: unknown) => spread,
  redrawSpreadToTarotCards: () => [{ name: "Шут", meaning: "" }],
}));
vi.mock("@/lib/decks", () => ({ resolveMasterDeckSystem: () => "tarot-veronika" }));

import { POST } from "@/app/api/photo-reading/recognize/route";

function request() {
  return new NextRequest("http://localhost/api/photo-reading/recognize", {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "test-browser" },
    body: JSON.stringify({
      imageBase64: "/9j/YWJj",
      mimeType: "image/jpeg",
      question: "Что важно увидеть?",
      characterId: "veronika",
    }),
  });
}

function rawRequest(body: string, headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/photo-reading/recognize", {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "test-browser", ...headers },
    body,
  });
}

function stalledRequest() {
  const stream = new ReadableStream<Uint8Array>({ start: () => undefined });
  return new NextRequest("http://localhost/api/photo-reading/recognize", {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "slow-browser" },
    body: stream,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

describe("guest photo recognition hook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.auth.mockResolvedValue(null);
    m.ageConfirmed.mockResolvedValue(true);
    m.rateLimit.mockResolvedValue({ allowed: true });
    m.generate.mockResolvedValue("recognized");
    m.profileId.mockResolvedValue("profile");
    m.balance.mockResolvedValue(300);
    delete process.env.PHOTO_RECOGNITION_BODY_TIMEOUT_MS;
  });

  it("shows a real recognized spread before registration without touching account billing", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      guest: true,
      detectedCards: ["Шут"],
      confidence: "unknown",
    });
    expect(m.generate).toHaveBeenCalledTimes(1);
    expect(m.rateLimit).toHaveBeenCalledTimes(6);
    expect(m.profileId).not.toHaveBeenCalled();
    expect(m.balance).not.toHaveBeenCalled();
  });

  it("requires the signed 18+ cookie and fails before vision", async () => {
    m.ageConfirmed.mockResolvedValue(false);
    const response = await POST(request());
    expect(response.status).toBe(403);
    expect(m.generate).not.toHaveBeenCalled();
  });

  it("caps free vision before calling the model", async () => {
    m.rateLimit
      .mockResolvedValueOnce({ allowed: true })
      .mockResolvedValueOnce({ allowed: true })
      .mockResolvedValueOnce({ allowed: false, retryAfterSec: 3600 });
    const response = await POST(request());
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("3600");
    expect(m.generate).not.toHaveBeenCalled();
    expect(m.rateLimit).toHaveBeenCalledTimes(3);
  });

  it("is explicitly middleware-public while paid photo routes stay private", () => {
    const middleware = readFileSync(path.join(process.cwd(), "src/middleware.ts"), "utf8");
    expect(middleware).toContain('"/api/photo-reading/recognize"');
    expect(middleware).not.toContain('"/api/photo-reading/stream"');
  });

  it("rejects malformed field types after ingress protection without consuming the vision quota", async () => {
    const response = await POST(rawRequest(JSON.stringify({ imageBase64: { nested: true }, mimeType: 7 })));
    expect(response.status).toBe(400);
    expect(m.rateLimit).toHaveBeenCalledTimes(2);
    expect(m.generate).not.toHaveBeenCalled();
  });

  it("rejects an oversized declared body before parsing or vision", async () => {
    const response = await POST(rawRequest("{}", { "content-length": String(9 * 1024 * 1024) }));
    expect(response.status).toBe(413);
    expect(m.rateLimit).toHaveBeenCalledTimes(2);
    expect(m.generate).not.toHaveBeenCalled();
  });

  it("stops an oversized chunked body even without Content-Length", async () => {
    const response = await POST(rawRequest(JSON.stringify({ imageBase64: "A".repeat(400_000) })));
    expect(response.status).toBe(413);
    expect(m.rateLimit).toHaveBeenCalledTimes(2);
    expect(m.generate).not.toHaveBeenCalled();
  });

  it("times out stalled uploads, releases every guest slot and accepts the next request", async () => {
    process.env.PHOTO_RECOGNITION_BODY_TIMEOUT_MS = "50";
    const stalled = Array.from({ length: 4 }, () => POST(stalledRequest()));
    await vi.waitFor(() => expect(m.rateLimit).toHaveBeenCalledTimes(8));

    const whileBusy = await POST(stalledRequest());
    expect(whileBusy.status).toBe(429);

    const timedOut = await Promise.all(stalled);
    expect(timedOut.map((response) => response.status)).toEqual([408, 408, 408, 408]);

    const afterRelease = await POST(request());
    expect(afterRelease.status).toBe(200);
  });
});
