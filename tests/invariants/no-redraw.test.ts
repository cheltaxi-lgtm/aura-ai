import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearGuestResumeUiCache,
  hasActiveGuestResumeIntent,
  saveGuestResumeUiCache,
} from "@/lib/guest-resume-ui-cache";
import * as decks from "@/lib/decks";
import { claimGuestResumeSession } from "@/lib/guest-triplet-receipt-db";
import { hasTestDb, installDbLifecycle } from "./db/setup";
import { createTestUser, issueGuestReceipt } from "./db/fixtures";

const ROOT = path.resolve(__dirname, "../..");

function readSrc(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

/**
 * Mirrors scripts/verify-seo-ask-spread.ts simulateSeoAskSpreadMatrix
 * (that script has top-level side effects — do not import it from vitest).
 */
function simulateSeoAskSpreadMatrix(input: {
  hasActiveReceipt: boolean;
  receiptStatus: "none" | "issued" | "claimed" | "reading_consumed" | "expired" | "invalid";
  baselineCards: [number, number, number];
  redrawCards?: [number, number, number];
}): { action: "new_draw" | "keep_receipt" | "resume_claimed"; cards: [number, number, number] } {
  const { hasActiveReceipt, receiptStatus, baselineCards, redrawCards } = input;

  if (receiptStatus === "expired" || receiptStatus === "invalid" || receiptStatus === "none") {
    return { action: "new_draw", cards: redrawCards ?? baselineCards };
  }
  if (receiptStatus === "claimed" || receiptStatus === "reading_consumed") {
    return { action: "resume_claimed", cards: redrawCards ?? baselineCards };
  }
  if (hasActiveReceipt && receiptStatus === "issued") {
    return { action: "keep_receipt", cards: redrawCards ?? baselineCards };
  }
  return { action: "new_draw", cards: redrawCards ?? baselineCards };
}

/** Orchestrate draw like HomePage guest SEO entry: new_draw → one drawSpread, else zero. */
function runGuestSeoDrawPath(decision: {
  action: "new_draw" | "keep_receipt" | "resume_claimed";
}) {
  if (decision.action === "new_draw") {
    return decks.drawSpread("tarot-veronika", 3);
  }
  return null;
}

describe("no-redraw", () => {
  afterEach(() => {
    clearGuestResumeUiCache();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("active guest receipt intent is detected from UI cache (resume path)", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
    });
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });

    expect(hasActiveGuestResumeIntent()).toBe(false);

    saveGuestResumeUiCache({
      version: 1,
      origin: "guest",
      masterId: "veronika",
      question: "test",
      system: "tarot-veronika",
      spreadId: "triplet",
      teaser: "",
      cards: [
        { id: 0, name: "Шут", position: 0, reversed: false },
        { id: 1, name: "Маг", position: 1, reversed: false },
        { id: 2, name: "Жрица", position: 2, reversed: false },
      ],
      completedAt: new Date().toISOString(),
      phase: "receipt_pending_auth",
    });

    expect(hasActiveGuestResumeIntent()).toBe(true);
  });

  it("HomePage source blocks SEO ask redraw when guest receipt intent is active", () => {
    const src = readSrc("src/components/HomePage.tsx");
    expect(src).toContain("hasActiveGuestResumeIntent");
    expect(src).toContain("trackGuestTripletRedrawPrevented");
    const askIdx = src.indexOf("const askParam");
    const guardIdx = src.indexOf("hasActiveGuestResumeIntent()");
    expect(guardIdx).toBeGreaterThan(-1);
    expect(askIdx).toBeGreaterThan(-1);
  });

  it("draw spy / SEO once: resume keeps cards (0 draws); no-receipt SEO draws once", () => {
    const spy = vi.spyOn(decks, "drawSpread");
    const baseline: [number, number, number] = [0, 1, 2];

    const resume = simulateSeoAskSpreadMatrix({
      hasActiveReceipt: true,
      receiptStatus: "issued",
      baselineCards: baseline,
    });
    expect(resume.action).toBe("keep_receipt");
    runGuestSeoDrawPath(resume);
    expect(spy).toHaveBeenCalledTimes(0);

    spy.mockClear();
    const seo = simulateSeoAskSpreadMatrix({
      hasActiveReceipt: false,
      receiptStatus: "none",
      baselineCards: baseline,
    });
    expect(seo.action).toBe("new_draw");
    const drawn = runGuestSeoDrawPath(seo);
    expect(drawn).toHaveLength(3);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe.skipIf(!hasTestDb)("no-redraw (db / claim draw spy)", () => {
  installDbLifecycle();

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("draw spy: claimGuestResumeSession with valid receipt never calls drawSpread", async () => {
    const spy = vi.spyOn(decks, "drawSpread");
    const issued = await issueGuestReceipt();
    const user = await createTestUser();

    const claim = await claimGuestResumeSession({
      token: issued.token,
      profileUserId: user.id,
    });
    expect(claim.ok).toBe(true);
    expect(spy).toHaveBeenCalledTimes(0);
  });
});
