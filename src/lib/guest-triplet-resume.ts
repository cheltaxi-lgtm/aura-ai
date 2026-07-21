"use client";

import {
  clearGuestResumeUiCache,
  loadGuestResumeUiCache,
  patchGuestResumeUiCache,
  saveGuestResumeUiCache,
  type GuestResumeUiPhase,
} from "@/lib/guest-resume-ui-cache";
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
      phase?: GuestResumeUiPhase;
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

function setPhase(phase: GuestResumeUiPhase): void {
  patchGuestResumeUiCache({ phase });
}

type StatusPayload = {
  ok?: boolean;
  status?: "none" | "claimed" | "reading_consumed";
  sessionId?: string;
  masterId?: string;
  question?: string;
  system?: string;
  cards?: GuestResumeClaimResult["cards"];
  readingId?: string | null;
  alreadyClaimed?: boolean;
};

async function fetchOwnedResumeStatus(): Promise<StatusPayload | null> {
  try {
    const res = await fetch("/api/guest-triplet/status", {
      method: "GET",
      credentials: "include",
    });
    if (!res.ok) return null;
    return (await res.json()) as StatusPayload;
  } catch {
    return null;
  }
}

/**
 * Single client orchestrator for guest triplet resume.
 * Claim uses HttpOnly cookies only — never sends token from JS storage.
 * After claim, claimedSessionId is stored in UI cache so reading retry works
 * even after receipt cookies are cleared.
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
    let cache = loadGuestResumeUiCache();

    if (!cache) {
      const owned = await fetchOwnedResumeStatus();
      if (
        owned?.ok &&
        (owned.status === "claimed" || owned.status === "reading_consumed") &&
        owned.sessionId &&
        Array.isArray(owned.cards) &&
        owned.cards.length === 3
      ) {
        cache = {
          version: 1,
          origin: "guest",
          masterId: owned.masterId || "veronika",
          system: owned.system || "tarot-veronika",
          spreadId: "triplet",
          question: owned.question || "",
          teaser: "",
          cards: owned.cards,
          completedAt: new Date().toISOString(),
          claimedSessionId: owned.sessionId,
          phase: "resuming_reading",
        };
        saveGuestResumeUiCache(cache);
      } else {
        trackGuestTripletResumeFailed("receipt");
        return { ok: false, stage: "receipt" as const, phase: "idle" };
      }
    }

    trackGuestTripletResumeDetected({
      has_question: Boolean((cache?.question ?? "").trim()),
      master_id: cache?.masterId || "veronika",
      cards_count: cache?.cards?.length ?? 0,
      auth_method: opts?.authMethod,
    });

    trackGuestTripletResumeStarted({
      master_id: cache?.masterId || "veronika",
      cards_count: cache?.cards?.length ?? 0,
      has_question: Boolean((cache?.question ?? "").trim()),
    });

    setPhase("claiming");

    let claim: GuestResumeClaimResult | null = null;

    if (cache?.claimedSessionId && cache.cards?.length === 3) {
      claim = {
        sessionId: cache.claimedSessionId,
        masterId: cache.masterId,
        question: cache.question,
        system: cache.system,
        cards: cache.cards,
        alreadyClaimed: true,
      };
    } else {
      let claimRes: Response;
      try {
        claimRes = await fetch("/api/guest-triplet/claim", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
      } catch {
        setPhase("recoverable_error");
        trackGuestTripletResumeFailed("claim");
        return { ok: false, stage: "claim" as const, phase: "recoverable_error" };
      }

      if (!claimRes.ok) {
        const owned = await fetchOwnedResumeStatus();
        if (
          owned?.ok &&
          (owned.status === "claimed" || owned.status === "reading_consumed") &&
          owned.sessionId &&
          Array.isArray(owned.cards) &&
          owned.cards.length === 3
        ) {
          claim = {
            sessionId: owned.sessionId,
            masterId: owned.masterId || cache?.masterId || "veronika",
            question: owned.question ?? cache?.question ?? "",
            system: owned.system ?? cache?.system ?? "tarot-veronika",
            cards: owned.cards,
            alreadyClaimed: true,
          };
          if (cache) {
            patchGuestResumeUiCache({
              claimedSessionId: claim.sessionId,
              masterId: claim.masterId,
              question: claim.question,
              system: claim.system,
              cards: claim.cards,
              phase: "resuming_reading",
            });
            cache = loadGuestResumeUiCache();
          }
        } else {
          if (detectCapacitorPlatform()) {
            setPhase("safe_recovery");
            clearGuestResumeUiCache();
            trackGuestTripletResumeFailed("claim");
            return {
              ok: false,
              stage: "claim" as const,
              capacitorRecovery: true,
              phase: "safe_recovery",
            };
          }
          const expired = claimRes.status === 404;
          setPhase(expired ? "idle" : "recoverable_error");
          if (expired) clearGuestResumeUiCache();
          trackGuestTripletResumeFailed(expired ? "expired" : "claim");
          return {
            ok: false,
            stage: expired ? ("expired" as const) : ("claim" as const),
            phase: expired ? "idle" : "recoverable_error",
          };
        }
      } else {
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
          setPhase("recoverable_error");
          trackGuestTripletResumeFailed("claim");
          return { ok: false, stage: "claim" as const, phase: "recoverable_error" };
        }

        if (
          !claimData.ok ||
          !claimData.sessionId ||
          !claimData.masterId ||
          !Array.isArray(claimData.cards) ||
          claimData.cards.length !== 3
        ) {
          setPhase("recoverable_error");
          trackGuestTripletResumeFailed("session");
          return { ok: false, stage: "session" as const, phase: "recoverable_error" };
        }

        claim = {
          sessionId: claimData.sessionId,
          masterId: claimData.masterId,
          question: claimData.question ?? cache?.question ?? "",
          system: claimData.system ?? cache?.system ?? "tarot-veronika",
          cards: claimData.cards,
          alreadyClaimed: Boolean(claimData.alreadyClaimed),
        };

        // Persist claimed session before reading so cookie loss / retry still works.
        if (cache) {
          patchGuestResumeUiCache({
            claimedSessionId: claim.sessionId,
            masterId: claim.masterId,
            question: claim.question,
            system: claim.system,
            cards: claim.cards,
            phase: "resuming_reading",
          });
        }
      }
    }

    if (!claim) {
      setPhase("recoverable_error");
      trackGuestTripletResumeFailed("session");
      return { ok: false, stage: "session" as const, phase: "recoverable_error" };
    }

    setPhase("resuming_reading");

    let readingMode: "full" | "existing" = "full";
    if (opts?.loadReading) {
      const outcome = await opts.loadReading({
        sessionId: claim.sessionId,
        masterId: claim.masterId,
        question: claim.question,
        cards: claim.cards,
      });
      if (outcome === "failed") {
        setPhase("recoverable_error");
        trackGuestTripletResumeFailed("reading");
        return { ok: false, stage: "reading" as const, phase: "recoverable_error" };
      }
      readingMode = outcome;
    }

    trackGuestTripletResumeCompleted({
      master_id: claim.masterId,
      reading_mode: readingMode,
      has_question: Boolean(claim.question.trim()),
    });

    setPhase("reading_ready");
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
