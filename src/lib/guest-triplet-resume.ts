"use client";

import { clearGuestResumeUiCache, loadGuestResumeUiCache } from "@/lib/guest-resume-ui-cache";
import {
  trackGuestTripletResumeCompleted,
  trackGuestTripletResumeDetected,
  trackGuestTripletResumeFailed,
  trackGuestTripletResumeStarted,
} from "@/lib/seo/metrika";

export type GuestResumeStage =
  | "idle"
  | "claiming"
  | "reading"
  | "done"
  | "failed"
  | "capacitor_recovery";

export type GuestResumeClaimResult = {
  sessionId: string;
  masterId: string;
  question: string;
  system: string;
  cards: Array<{ id: number; name: string; position: number; reversed: boolean }>;
  alreadyClaimed: boolean;
};

let inFlight: Promise<GuestResumeOrchestrationResult> | null = null;

export type GuestResumeOrchestrationResult =
  | { ok: true; claim: GuestResumeClaimResult; readingMode: "full" | "existing" }
  | {
      ok: false;
      stage: "receipt" | "claim" | "session" | "reading" | "expired";
      capacitorRecovery?: boolean;
    };

function detectCapacitorPlatform(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const cap = (
      window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }
    ).Capacitor;
    return Boolean(cap?.isNativePlatform?.());
  } catch {
    return false;
  }
}

/**
 * Single client orchestrator for guest triplet resume.
 * Claim uses HttpOnly cookies only — never sends token from JS storage.
 */
export async function runGuestTripletResume(opts?: {
  authMethod?: string;
  loadReading?: (args: {
    sessionId: string;
    masterId: string;
    question: string;
    cards: GuestResumeClaimResult["cards"];
  }) => Promise<"full" | "existing" | "failed">;
}): Promise<GuestResumeOrchestrationResult> {
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const cache = loadGuestResumeUiCache();
    if (!cache) {
      trackGuestTripletResumeFailed("receipt");
      return { ok: false, stage: "receipt" as const };
    }

    trackGuestTripletResumeDetected({
      has_question: Boolean(cache.question.trim()),
      master_id: cache.masterId,
      cards_count: cache.cards.length,
      auth_method: opts?.authMethod,
    });

    trackGuestTripletResumeStarted({
      master_id: cache.masterId,
      cards_count: cache.cards.length,
      has_question: Boolean(cache.question.trim()),
    });

    let claimRes: Response;
    try {
      claimRes = await fetch("/api/guest-triplet/claim", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
    } catch {
      trackGuestTripletResumeFailed("claim");
      return { ok: false, stage: "claim" as const };
    }

    if (!claimRes.ok) {
      if (detectCapacitorPlatform()) {
        trackGuestTripletResumeFailed("claim");
        return { ok: false, stage: "claim" as const, capacitorRecovery: true };
      }
      trackGuestTripletResumeFailed(claimRes.status === 404 ? "expired" : "claim");
      return {
        ok: false,
        stage: claimRes.status === 404 ? ("expired" as const) : ("claim" as const),
      };
    }

    let claimData: {
      ok?: boolean;
      sessionId?: string;
      masterId?: string;
      question?: string;
      system?: string;
      cards?: GuestResumeClaimResult["cards"];
      alreadyClaimed?: boolean;
    };
    try {
      claimData = (await claimRes.json()) as typeof claimData;
    } catch {
      trackGuestTripletResumeFailed("claim");
      return { ok: false, stage: "claim" as const };
    }

    if (
      !claimData.ok ||
      !claimData.sessionId ||
      !claimData.masterId ||
      !Array.isArray(claimData.cards) ||
      claimData.cards.length !== 3
    ) {
      trackGuestTripletResumeFailed("session");
      return { ok: false, stage: "session" as const };
    }

    const claim: GuestResumeClaimResult = {
      sessionId: claimData.sessionId,
      masterId: claimData.masterId,
      question: claimData.question ?? cache.question,
      system: claimData.system ?? cache.system,
      cards: claimData.cards,
      alreadyClaimed: Boolean(claimData.alreadyClaimed),
    };

    let readingMode: "full" | "existing" = "full";
    if (opts?.loadReading) {
      const outcome = await opts.loadReading({
        sessionId: claim.sessionId,
        masterId: claim.masterId,
        question: claim.question,
        cards: claim.cards,
      });
      if (outcome === "failed") {
        trackGuestTripletResumeFailed("reading");
        return { ok: false, stage: "reading" as const };
      }
      readingMode = outcome;
    }

    trackGuestTripletResumeCompleted({
      master_id: claim.masterId,
      reading_mode: readingMode,
      has_question: Boolean(claim.question.trim()),
    });

    // Variant A: clear UI cache after successful claim+reading path acknowledgement.
    clearGuestResumeUiCache();

    return { ok: true, claim, readingMode };
  })();

  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

export const GUEST_RESUME_TRANSITION_TITLE = "Ваш расклад сохранён";
export const GUEST_RESUME_TRANSITION_SUBTITLE =
  "Вероника готовит полную трактовку…";
export const GUEST_RESUME_RETRY_TITLE =
  "Не удалось подготовить трактовку. Ваш расклад сохранён.";
export const GUEST_RESUME_RETRY_CTA = "Повторить";
export const GUEST_RESUME_CAPACITOR_RECOVERY =
  "Не удалось безопасно восстановить расклад после входа. Ваш аккаунт создан, но для нового разбора откройте новый расклад.";
