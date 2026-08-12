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
      stage: "receipt" | "claim" | "session" | "reading" | "expired" | "already_used";
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

async function fetchExactOwnedResumeStatus(
  sessionId?: string
): Promise<StatusPayload | null> {
  try {
    const params = new URLSearchParams();
    if (sessionId?.trim()) params.set("sessionId", sessionId.trim());
    const qs = params.toString();
    const res = await fetch(
      qs ? `/api/guest-triplet/status?${qs}` : "/api/guest-triplet/status",
      {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      }
    );
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
    try {
    let cache = loadGuestResumeUiCache();

    if (!cache) {
      trackGuestTripletResumeFailed("receipt");
      return { ok: false, stage: "receipt" as const, phase: "idle" };
    }

    if (cache.claimedSessionId) {
      const exact = await fetchExactOwnedResumeStatus(cache.claimedSessionId);
      const exactOwned =
        exact?.ok &&
        (exact.status === "claimed" || exact.status === "reading_consumed") &&
        exact.sessionId === cache.claimedSessionId;
      const exactCardsOk =
        Array.isArray(exact?.cards) && (exact?.cards.length ?? 0) === 3;
      if (!exactOwned) {
        // Stale claimedSessionId (or status parse lag) — drop id and re-claim via cookie.
        patchGuestResumeUiCache({ claimedSessionId: undefined, phase: "claiming" });
        cache = { ...cache, claimedSessionId: undefined, phase: "claiming" };
      } else {
        cache = {
          ...cache,
          masterId: exact.masterId || cache.masterId,
          system: exact.system || cache.system,
          question: exact.question ?? cache.question,
          // Prefer server cards; keep UI-cache cards if server payload was corrupted.
          cards: exactCardsOk ? exact.cards! : cache.cards,
          phase: "resuming_reading",
        };
        saveGuestResumeUiCache(cache);
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

      if (claimRes.ok) {
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
      } else if (claimRes.status === 403) {
        // Age / legal gates — never birth onboarding. Retry or recovery UI.
        setPhase("recoverable_error");
        trackGuestTripletResumeFailed("claim");
        return {
          ok: false,
          stage: "claim" as const,
          phase: "recoverable_error",
        };
      } else if (claimRes.status === 409) {
        setPhase("idle");
        trackGuestTripletResumeFailed("claim");
        try {
          const { trackGuestIntroAlreadyUsed, trackGuestIntroClaimRejected } =
            await import("@/lib/seo/metrika");
          trackGuestIntroAlreadyUsed("claim");
          trackGuestIntroClaimRejected("already_used");
        } catch {
          /* analytics optional */
        }
        return {
          ok: false,
          stage: "already_used" as const,
          phase: "idle",
        };
      } else if (claimRes.status === 404) {
        // Cookie lost / binding race — recover latest owned claimed session.
        const owned = await fetchExactOwnedResumeStatus();
        const ownedCardsOk =
          Array.isArray(owned?.cards) && (owned?.cards.length ?? 0) === 3;
        if (
          owned?.ok &&
          owned.sessionId &&
          (owned.status === "claimed" || owned.status === "reading_consumed") &&
          ownedCardsOk
        ) {
          claim = {
            sessionId: owned.sessionId,
            masterId: owned.masterId || cache?.masterId || "veronika",
            question: owned.question ?? cache?.question ?? "",
            system: owned.system || cache?.system || "tarot-veronika",
            cards: owned.cards!,
            alreadyClaimed: true,
          };
          patchGuestResumeUiCache({
            claimedSessionId: claim.sessionId,
            masterId: claim.masterId,
            question: claim.question,
            system: claim.system,
            cards: claim.cards,
            phase: "resuming_reading",
          });
        } else if (detectCapacitorPlatform()) {
          setPhase("safe_recovery");
          trackGuestTripletResumeFailed("claim");
          return {
            ok: false,
            stage: "claim" as const,
            capacitorRecovery: true,
            phase: "safe_recovery",
          };
        } else {
          setPhase("idle");
          trackGuestTripletResumeFailed("expired");
          return { ok: false, stage: "expired" as const, phase: "idle" };
        }
      } else if (detectCapacitorPlatform()) {
        setPhase("safe_recovery");
        trackGuestTripletResumeFailed("claim");
        return {
          ok: false,
          stage: "claim" as const,
          capacitorRecovery: true,
          phase: "safe_recovery",
        };
      } else {
        setPhase("recoverable_error");
        trackGuestTripletResumeFailed("claim");
        return { ok: false, stage: "claim" as const, phase: "recoverable_error" };
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
        const phaseAfter = loadGuestResumeUiCache()?.phase;
        if (phaseAfter === "onboarding_required") {
          trackGuestTripletResumeFailed("reading");
          return {
            ok: false,
            stage: "reading" as const,
            phase: "onboarding_required",
          };
        }
        setPhase("recoverable_error");
        trackGuestTripletResumeFailed("reading");
        return { ok: false, stage: "reading" as const, phase: "recoverable_error" };
      }
      readingMode = outcome;
    }

    const persisted = await fetchExactOwnedResumeStatus(claim.sessionId);
    const consumedOk =
      persisted?.ok &&
      persisted.status === "reading_consumed" &&
      persisted.sessionId === claim.sessionId &&
      Boolean(persisted.readingId);

    // If loadReading already painted the chat, do not fail closed on a laggy
    // reading_consumed mark — that was bouncing users back to the homepage.
    if (!consumedOk) {
      if (opts?.loadReading) {
        trackGuestTripletResumeCompleted({
          master_id: claim.masterId,
          reading_mode: readingMode,
          has_question: Boolean(claim.question.trim()),
        });
        setPhase("reading_ready");
        clearGuestResumeUiCache();
        return { ok: true, claim, readingMode };
      }
      setPhase("recoverable_error");
      trackGuestTripletResumeFailed("reading");
      return { ok: false, stage: "reading" as const, phase: "recoverable_error" };
    }

    trackGuestTripletResumeCompleted({
      master_id: claim.masterId,
      reading_mode: readingMode,
      has_question: Boolean(claim.question.trim()),
    });

    setPhase("reading_ready");
    clearGuestResumeUiCache();

    return { ok: true, claim, readingMode };
    } catch {
      setPhase("recoverable_error");
      trackGuestTripletResumeFailed("reading");
      return { ok: false, stage: "reading" as const, phase: "recoverable_error" };
    }
  })();

  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

export const GUEST_RESUME_TRANSITION_TITLE = "Восстанавливаем Ваш расклад…";
export const GUEST_RESUME_TRANSITION_SUBTITLE =
  "Карты уже выбраны — повторно выбирать ничего не нужно.";
export const GUEST_RESUME_RETRY_TITLE =
  "Не удалось восстановить расклад. Аккаунт создан, но предыдущий расклад не удалось открыть автоматически.";
export const GUEST_RESUME_RETRY_CTA = "Попробовать восстановить";
export const GUEST_RESUME_CAPACITOR_RECOVERY =
  "Не удалось восстановить расклад. Аккаунт создан, но предыдущий расклад не удалось открыть автоматически. Вы можете попробовать снова или открыть новый расклад.";
export const GUEST_RESUME_ALREADY_USED =
  "Стартовый бесплатный расклад уже использован. Он доступен один раз для знакомства с Zovus. У Вас есть 3 карты дня бесплатно — раз в сутки.";
export const GUEST_RESUME_ALREADY_USED_DAILY_CTA = "Открыть 3 карты дня";
export const GUEST_RESUME_ALREADY_USED_NEW_CTA = "Выбрать новый расклад";
export const GUEST_RESUME_ALREADY_USED_CABINET_CTA = "Перейти в кабинет";
