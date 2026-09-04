import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearGuestTriplet, saveGuestTriplet } from "@/lib/guest-triplet";
import { saveGuestResumeUiCache } from "@/lib/guest-resume-ui-cache";
import { runGuestTripletResume } from "@/lib/guest-triplet-resume";
import { trackGuestClaim } from "@/lib/seo/metrika";

vi.mock("@/lib/seo/metrika", () => ({
  trackGuestClaim: vi.fn(),
  trackGuestTripletResumeCompleted: vi.fn(),
  trackGuestTripletResumeDetected: vi.fn(),
  trackGuestTripletResumeFailed: vi.fn(),
  trackGuestTripletResumeStarted: vi.fn(),
}));

const cards = [0, 1, 2].map((id) => ({ id, name: `Card ${id}`, position: id, reversed: false }));

describe("mobile guest recovery", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    };
    vi.stubGlobal("window", { localStorage: storage });
    vi.stubGlobal("localStorage", storage);
    vi.clearAllMocks();
    saveGuestResumeUiCache({ version: 1, origin: "guest", masterId: "veronika", system: "tarot-veronika", spreadId: "triplet", question: "Test", teaser: "", cards, completedAt: new Date().toISOString(), phase: "receipt_pending_auth" });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("optional cache write and cleanup errors do not abort the result flow", () => {
    vi.stubGlobal("localStorage", {
      setItem: () => { throw new DOMException("full", "QuotaExceededError"); },
      removeItem: () => { throw new DOMException("blocked", "SecurityError"); },
    });
    expect(() => saveGuestTriplet({ tarotCards: [], teaser: "", completedAt: new Date().toISOString() })).not.toThrow();
    expect(() => clearGuestTriplet()).not.toThrow();
  });

  it("failed server claim never reports successful saving", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 500 })));
    const result = await runGuestTripletResume();
    expect(result).toMatchObject({ ok: false, stage: "claim" });
    expect(trackGuestClaim).not.toHaveBeenCalled();
  });

  it("reports claim only after a validated server response, before reading", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, sessionId: "owned-session", masterId: "veronika", question: "Test", system: "tarot-veronika", cards })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, status: "reading_consumed", sessionId: "owned-session", readingId: "reading" }))));
    const result = await runGuestTripletResume({ loadReading: async () => {
      expect(trackGuestClaim).toHaveBeenCalledTimes(1);
      return "full";
    } });
    expect(result.ok).toBe(true);
    expect(trackGuestClaim).toHaveBeenCalledTimes(1);
  });
});
