/**
 * Privacy invariant: logout / activity purge must wipe every HD guest trace
 * from the browser. Otherwise the next visitor (or a different account on the
 * same device) sees the previous person's chart auto-restored, and pending
 * claim tokens would attach those charts to the WRONG account on next login.
 *
 * Repro of the reported bug: log out, open /dizayn-cheloveka/rasschitat —
 * the last computed chart (e.g. a partner's) popped up again.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/chat-cache", () => ({ clearChatCache: vi.fn() }));
vi.mock("@/lib/guest-triplet", () => ({ clearGuestTriplet: vi.fn() }));
vi.mock("@/lib/guest-resume-ui-cache", () => ({ clearGuestResumeUiCache: vi.fn() }));
vi.mock("@/lib/landing-offer", () => ({ GUEST_SPREAD_DRAFT_KEY: "test:spread-draft" }));
vi.mock("@/lib/post-auth-return", () => ({
  POST_AUTH_RETURN_TO_KEY: "test:post-auth-return",
  PENDING_INTENT_KEY: "test:pending-intent",
}));
vi.mock("@/lib/rune-purchase-client", () => ({ RUNE_PENDING_PAYMENT_KEY: "test:rune-pay" }));
vi.mock("@/lib/fetch-with-timeout", () => ({ fetchWithTimeout: vi.fn() }));
vi.mock("@/lib/client-auth-session", () => ({ waitUntilLoggedOut: vi.fn() }));
vi.mock("@/lib/auth-pending", () => ({ clearAuthPending: vi.fn() }));
vi.mock("@/lib/webview-cookies", () => ({ flushWebViewCookies: vi.fn() }));

class StorageMock implements Storage {
  private map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
}

const local = new StorageMock();
const session = new StorageMock();

Object.defineProperty(globalThis, "localStorage", { value: local, configurable: true });
Object.defineProperty(globalThis, "sessionStorage", { value: session, configurable: true });
Object.defineProperty(globalThis, "window", {
  value: { localStorage: local, sessionStorage: session },
  configurable: true,
});

const {
  HD_LAST_FINGERPRINT_KEY,
  clearAllHdClaimTokens,
  clearHdGuestBrowserState,
  hdClaimTokenKey,
  storeHdClaimToken,
} = await import("@/components/human-design/hd-claim");
const { clearClientAuthState, clearClientActivityState } = await import("@/lib/client-logout");

function seedHdTraces(): void {
  local.setItem(HD_LAST_FINGERPRINT_KEY, "fp-last-chart");
  storeHdClaimToken("fp-a", "token-a");
  storeHdClaimToken("fp-b", "token-b");
  local.setItem("aura:natal-active-job", "job-123");
  local.setItem("aura:natal-active-job-started", "1700000000000");
}

describe("HD guest traces vs logout", () => {
  beforeEach(() => {
    local.clear();
    session.clear();
  });

  it("storage key constant stays in sync with the calculator", () => {
    // The wipe targets this exact key; a silent rename reopens the leak.
    expect(HD_LAST_FINGERPRINT_KEY).toBe("hd:last-fingerprint");
  });

  it("clearClientAuthState removes last-chart fingerprint, claim tokens and natal job", () => {
    seedHdTraces();
    local.setItem("hd-mandala", "1"); // pure UI preference — must survive

    clearClientAuthState();

    expect(local.getItem(HD_LAST_FINGERPRINT_KEY)).toBeNull();
    expect(local.getItem(hdClaimTokenKey("fp-a"))).toBeNull();
    expect(local.getItem(hdClaimTokenKey("fp-b"))).toBeNull();
    expect(local.getItem("aura:natal-active-job")).toBeNull();
    expect(local.getItem("aura:natal-active-job-started")).toBeNull();
    expect(local.getItem("hd-mandala")).toBe("1");
  });

  it("clearClientActivityState removes the same HD traces", () => {
    seedHdTraces();

    clearClientActivityState();

    expect(local.getItem(HD_LAST_FINGERPRINT_KEY)).toBeNull();
    expect(local.getItem(hdClaimTokenKey("fp-a"))).toBeNull();
    expect(local.getItem("aura:natal-active-job")).toBeNull();
  });

  it("clearAllHdClaimTokens removes only claim-prefixed keys", () => {
    seedHdTraces();
    local.setItem("hd:unrelated", "keep");

    clearAllHdClaimTokens();

    expect(local.getItem(hdClaimTokenKey("fp-a"))).toBeNull();
    expect(local.getItem(hdClaimTokenKey("fp-b"))).toBeNull();
    expect(local.getItem("hd:unrelated")).toBe("keep");
    expect(local.getItem(HD_LAST_FINGERPRINT_KEY)).toBe("fp-last-chart");
  });

  it("clearHdGuestBrowserState is idempotent on empty storage", () => {
    expect(() => clearHdGuestBrowserState()).not.toThrow();
  });
});
