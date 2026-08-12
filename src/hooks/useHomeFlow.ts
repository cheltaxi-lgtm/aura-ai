"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { FlowStep } from "@/components/FlowStepper";
import { DEFAULT_DECK_SYSTEM } from "@/lib/decks";
import { loadGuestTriplet, clearGuestTriplet, GUEST_TRIPLET_KEY } from "@/lib/guest-triplet";
import { mergeGuestTripletIntoProfile } from "@/lib/guest-triplet";
import {
  clearGuestResumeUiCache,
  hasActiveGuestResumeIntent,
} from "@/lib/guest-resume-ui-cache";
import {
  POST_AUTH_RETURN_TO_KEY,
  PENDING_INTENT_KEY,
} from "@/lib/post-auth-return";
import { useAuraSession } from "@/lib/useSession";
import type { StoredProfile } from "@/types/stored-profile";
import {
  ACCOUNT_KEY,
  FLOW_STEP_KEY,
  LAST_MASTER_KEY,
  LAST_VISIT_KEY,
  PENDING_MASTER_KEY,
  PROFILE_KEY,
  NEEDS_PROFILE_KEY,
  clearNeedsServerProfile,
  clearOnboardingUrlParams,
  clearPendingMasterResume,
  hasGuestExplicitMasterResume,
  hasPendingServerProfile,
  isStoredChatResumeFresh,
  markNeedsServerProfile,
  persistProfileData,
  persistStep,
  readStoredProfile,
  resolveStoredFlowStep,
} from "@/lib/home-flow-storage";
import { APP_SHELL_QUERY, APP_SHELL_VALUE } from "@/lib/app-shell";
import { isJointSpreadStartUrl } from "@/lib/joint-reading-nav";
import { hasAuthPendingQuery, isAuthPending } from "@/lib/auth-pending";

export type { StoredProfile };

export interface UseHomeFlowOptions {
  referrerSlug?: string;
  isLoggedIn: boolean;
  authLoading: boolean;
  authUser: { sub: string; profileUserId?: string | null } | null | undefined;
  /** Clears chat selection and messages when leaving chat via browser history. */
  onPopStateLeaveChat?: () => void;
  /** Full reset when history returns to intro. */
  onPopStateReset?: () => void;
  /** Opens chat with saved master after step restore. */
  onRestoreChatMaster?: (masterId: string) => void;
  /** Extra cleanup when another account logs in on this device. */
  onAccountSwitch?: () => void;
  /** Redirect to chat after successful payment when master is known. */
  onPaymentChatReady?: (masterId: string) => void;
  setSelectedCharacter?: (id: string | null) => void;
}

export function useHomeFlow(options: UseHomeFlowOptions) {
  const {
    referrerSlug,
    isLoggedIn,
    authLoading,
    authUser,
    onPopStateLeaveChat,
    onPopStateReset,
    onRestoreChatMaster,
    onAccountSwitch,
    onPaymentChatReady,
    setSelectedCharacter,
  } = options;

  const { session, loading: sessionLoading, refresh, reconnectSession, spawnSession } =
    useAuraSession(referrerSlug);

  const [step, setStepState] = useState<FlowStep>("intro");
  const [flowBootstrapped, setFlowBootstrapped] = useState(false);
  const [profile, setProfile] = useState<StoredProfile | null>(readStoredProfile);
  const [showWelcomeBack, setShowWelcomeBack] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [paymentNotice, setPaymentNotice] = useState<string | null>(null);

  const persistProfile = useCallback((data: StoredProfile) => {
    persistProfileData(data);
    setProfile(data);
  }, []);

  const setStep = useCallback((next: FlowStep) => {
    setStepState(next);
    persistStep(next);
    if (typeof window === "undefined") return;
    // Chat is session state, not a shareable landing URL. Writing ?step=chat made
    // every later visit to "/" reopen the last reading (matrix) forever.
    if (next === "chat") {
      const url = new URL(window.location.href);
      if (url.searchParams.get("step") === "chat") {
        url.searchParams.delete("step");
        const qs = url.searchParams.toString();
        window.history.replaceState(
          { step: next },
          "",
          qs ? `${url.pathname}?${qs}` : url.pathname
        );
      }
      return;
    }
    if (next !== "intro") {
      const url = new URL(window.location.href);
      url.searchParams.set("step", next);
      window.history.pushState({ step: next }, "", `${url.pathname}?${url.searchParams.toString()}`);
    }
  }, []);

  const handleReconnectSession = useCallback(async () => {
    setReconnecting(true);
    try {
      const params = new URLSearchParams(window.location.search);
      const refToken = params.get("ref") ?? referrerSlug ?? null;
      await reconnectSession(refToken);
    } finally {
      setReconnecting(false);
    }
  }, [reconnectSession, referrerSlug]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const urlStep = params.get("step") as FlowStep | null;
    // Only honor explicit URL deep-links here; storage restore waits for auth bootstrap.
    // Bare ?step=chat is a leftover from older clients — ignore until bootstrap decides.
    if (urlStep && urlStep !== "intro" && urlStep !== "chat") {
      setStepState(urlStep);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onPopState = () => {
      const params = new URLSearchParams(window.location.search);
      const stepParam = params.get("step") as FlowStep | null;
      const saved = localStorage.getItem(FLOW_STEP_KEY) as FlowStep | null;
      const target = stepParam && stepParam !== "intro" ? stepParam : saved;
      if (target && target !== "intro") {
        setStepState(target);
        persistStep(target);
        if (target !== "chat") {
          setSelectedCharacter?.(null);
          onPopStateLeaveChat?.();
        }
      } else {
        setStepState("intro");
        persistStep("intro");
        setSelectedCharacter?.(null);
        onPopStateReset?.();
      }
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [onPopStateLeaveChat, onPopStateReset, setSelectedCharacter]);

  useEffect(() => {
    if (typeof window === "undefined" || !isLoggedIn) return;
    const last = localStorage.getItem(LAST_VISIT_KEY);
    const now = Date.now();
    if (last) {
      const days = (now - Number.parseInt(last, 10)) / (1000 * 60 * 60 * 24);
      if (days >= 1 && profile?.tarotCards?.length) {
        setShowWelcomeBack(true);
      }
    }
    localStorage.setItem(LAST_VISIT_KEY, String(now));
  }, [isLoggedIn, profile?.tarotCards?.length]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("paid") !== "1") return;
    const paySessionId = params.get("session");
    if (!paySessionId) return;

    let cancelled = false;
    let attempts = 0;

    const poll = async () => {
      if (cancelled) return;
      const updated = await refresh(paySessionId);
      attempts += 1;
      if (updated?.hasAccess) {
        window.history.replaceState(null, "", window.location.pathname);
        const master = localStorage.getItem(LAST_MASTER_KEY);
        if (master) {
          onPaymentChatReady?.(master);
          setStep("chat");
        } else {
          setStep("masters");
        }
        return;
      }
      if (attempts < 15) {
        window.setTimeout(poll, 2000);
      } else {
        window.history.replaceState(null, "", window.location.pathname);
        setPaymentNotice(
          "Оплата ещё обрабатывается. Обновите страницу через минуту или напишите в поддержку."
        );
      }
    };

    void poll();
    return () => {
      cancelled = true;
    };
  }, [refresh, setStep, onPaymentChatReady]);

  useEffect(() => {
    const stored = localStorage.getItem(PROFILE_KEY);
    if (!stored) return;

    try {
      setProfile(JSON.parse(stored) as StoredProfile);
    } catch {
      localStorage.removeItem(PROFILE_KEY);
    }
  }, []);

  // Re-running full step bootstrap when profileUserId arrives / auth refreshes
  // used to force FLOW_STEP=chat → masters and unmount ChatWindow mid-reading.
  // Guest↔user still re-bootstraps; late profileUserId bind must not eject chat.
  const bootstrappedAuthKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (authLoading) return;

    const authKey = !isLoggedIn
      ? "guest"
      : authUser?.profileUserId
        ? `user:${authUser.profileUserId}`
        : "user:pending";
    const prevAuthKey = bootstrappedAuthKeyRef.current;
    if (prevAuthKey === authKey) return;
    if (
      flowBootstrapped &&
      prevAuthKey?.startsWith("user:") &&
      authKey.startsWith("user:")
    ) {
      bootstrappedAuthKeyRef.current = authKey;
      if (authUser?.profileUserId) clearNeedsServerProfile();
      return;
    }
    bootstrappedAuthKeyRef.current = authKey;

    const finishBootstrap = () => setFlowBootstrapped(true);

    if (!isLoggedIn) {
      if (typeof window !== "undefined") {
        const params = new URLSearchParams(window.location.search);
        const urlStep = params.get("step") as FlowStep | null;
        // OAuth cookie lag: keep onboarding deep-link only. Do NOT treat guest
        // resume UI cache as "needs onboarding" — that blanks the marketing
        // landing after the free 3-card flip (step≠intro, !isLoggedIn → empty UI).
        if (urlStep === "onboarding" || isAuthPending() || hasAuthPendingQuery()) {
          setStepState("onboarding");
          persistStep("onboarding");
          finishBootstrap();
          return;
        }
        setStepState("intro");
        persistStep("intro");
        if (params.has("step")) {
          const url = new URL(window.location.href);
          url.searchParams.delete("step");
          const nextSearch = url.searchParams.toString();
          window.history.replaceState(
            null,
            "",
            nextSearch ? `${url.pathname}?${nextSearch}` : url.pathname
          );
        }
      } else {
        setStepState("intro");
        persistStep("intro");
      }
      finishBootstrap();
      return;
    }

    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("resume") === "chat" && params.get("master")) {
        finishBootstrap();
        return;
      }
      const urlStep = params.get("step") as FlowStep | null;
      if (urlStep === "onboarding") {
        const localProfile = readStoredProfile();
        const localBirthComplete = Boolean(String(localProfile?.birthDate ?? "").trim());
        if (localBirthComplete && !hasPendingServerProfile()) {
          const nextStep = resolveStoredFlowStep(
            localProfile,
            localStorage.getItem(FLOW_STEP_KEY) as FlowStep | null
          );
          clearOnboardingUrlParams();
          setStepState(nextStep);
          persistStep(nextStep);
          finishBootstrap();
          return;
        }
        setStepState("onboarding");
        persistStep("onboarding");
        finishBootstrap();
        return;
      }
    }

    if (!authUser?.profileUserId) {
      const localProfile = readStoredProfile();
      const localBirthComplete = Boolean(String(localProfile?.birthDate ?? "").trim());
      if (localBirthComplete && !hasPendingServerProfile()) {
        const nextStep = resolveStoredFlowStep(localProfile, localStorage.getItem(FLOW_STEP_KEY) as FlowStep | null);
        setStepState(nextStep);
        persistStep(nextStep);
        finishBootstrap();
        return;
      }
      markNeedsServerProfile();
      setStepState("onboarding");
      persistStep("onboarding");
      finishBootstrap();
      return;
    }
    clearNeedsServerProfile();

    const stored = localStorage.getItem(PROFILE_KEY);
    const params = new URLSearchParams(window.location.search);
    // Joint-reading spread deep links must not resurrect an old chat session under
    // the modal — force masters step until the spread flow finishes.
    if (isJointSpreadStartUrl(window.location.search)) {
      setStepState("masters");
      persistStep("masters");
      finishBootstrap();
      return;
    }
    const urlStep = params.get("step") as FlowStep | null;
    const savedStep = localStorage.getItem(FLOW_STEP_KEY) as FlowStep | null;
    const rawEffectiveStep = urlStep && urlStep !== "intro" ? urlStep : savedStep;
    const savedMaster = localStorage.getItem(LAST_MASTER_KEY);

    if (!stored) {
      const guest = loadGuestTriplet();
      if (guest && isLoggedIn) {
        const draft: StoredProfile = {
          name: "",
          gender: "female",
          birthDate: "",
          zodiac: "",
          tarotCards: guest.tarotCards,
          deckSystem: guest.deckSystem ?? DEFAULT_DECK_SYSTEM,
          teaser: guest.teaser,
        };
        localStorage.setItem(PROFILE_KEY, JSON.stringify(draft));
        setProfile(draft);
        // Guest Tarot resume: masters/claim coordinator — never birth onboarding.
        setStepState(guest.tarotCards.length >= 3 ? "masters" : "triplet");
        persistStep(guest.tarotCards.length >= 3 ? "masters" : "triplet");
      }
      finishBootstrap();
      return;
    }

    try {
      let parsed = JSON.parse(stored) as StoredProfile;
      if (isLoggedIn) {
        parsed = mergeGuestTripletIntoProfile(parsed) as StoredProfile;
        localStorage.setItem(PROFILE_KEY, JSON.stringify(parsed));
        setProfile(parsed);
      }

      const effectiveStep = resolveStoredFlowStep(parsed, rawEffectiveStep);

      // Missing birth is progressive profile completion — Tarot/chat stay available.
      if (!String(parsed.birthDate ?? "").trim()) {
        const nextStep =
          effectiveStep && effectiveStep !== "onboarding" && effectiveStep !== "intro"
            ? effectiveStep
            : "masters";
        setStepState(nextStep);
        persistStep(nextStep);
        finishBootstrap();
        return;
      }

      if (parsed.tarotCards?.length >= 3) {
        if (effectiveStep === "intention") {
          const pendingMaster = localStorage.getItem(PENDING_MASTER_KEY);
          if (pendingMaster) {
            const qs = new URLSearchParams({
              master: pendingMaster,
              [APP_SHELL_QUERY]: APP_SHELL_VALUE,
            });
            window.location.assign(`/session/intention?${qs.toString()}`);
            return;
          }
          clearPendingMasterResume();
          setStepState("masters");
          persistStep("masters");
        } else if (effectiveStep === "chat") {
          const restoreMaster =
            savedMaster ?? localStorage.getItem(PENDING_MASTER_KEY);
          // Session continuity: fresh stored chat (reload / brief leave) or
          // explicit ?resume=chat / ?step=chat. Stale chat must not hijack "/".
          const allowChatRestore =
            params.get("resume") === "chat" ||
            urlStep === "chat" ||
            isStoredChatResumeFresh();
          if (!allowChatRestore || !restoreMaster) {
            if (urlStep === "chat") {
              const cleaned = new URL(window.location.href);
              cleaned.searchParams.delete("step");
              const qs = cleaned.searchParams.toString();
              window.history.replaceState(
                null,
                "",
                qs ? `${cleaned.pathname}?${qs}` : cleaned.pathname
              );
            }
            setStepState("masters");
            persistStep("masters");
          } else {
            setStepState("chat");
            persistStep("chat");
            onRestoreChatMaster?.(restoreMaster);
          }
        } else if (effectiveStep === "intro") {
          if (!hasGuestExplicitMasterResume()) clearPendingMasterResume();
          setStepState("masters");
          persistStep("masters");
        } else {
          if (effectiveStep === "masters" && !hasGuestExplicitMasterResume()) {
            clearPendingMasterResume();
          }
          setStepState(effectiveStep ?? "masters");
          if (effectiveStep) persistStep(effectiveStep);
        }
      } else if (parsed.name || parsed.birthDate) {
        const next =
          effectiveStep === "intro" ? "masters" : effectiveStep ?? "triplet";
        setStepState(next);
        persistStep(next);
      } else if (effectiveStep && effectiveStep !== "intro") {
        setStepState(effectiveStep);
        persistStep(effectiveStep);
      }
    } catch {
      localStorage.removeItem(PROFILE_KEY);
    }

    finishBootstrap();
  }, [
    authLoading,
    isLoggedIn,
    authUser?.profileUserId,
    onRestoreChatMaster,
    flowBootstrapped,
  ]);

  useEffect(() => {
    if (authLoading || !isLoggedIn || !authUser?.sub) return;

    const prevAccount = localStorage.getItem(ACCOUNT_KEY);
    if (prevAccount && prevAccount !== authUser.sub) {
      const preserveGuestResume = hasActiveGuestResumeIntent();
      localStorage.removeItem(PROFILE_KEY);
      localStorage.removeItem(FLOW_STEP_KEY);
      localStorage.removeItem(LAST_MASTER_KEY);
      clearPendingMasterResume();
      localStorage.removeItem(NEEDS_PROFILE_KEY);
      localStorage.removeItem(POST_AUTH_RETURN_TO_KEY);
      localStorage.removeItem(PENDING_INTENT_KEY);
      if (!preserveGuestResume) {
        localStorage.removeItem(GUEST_TRIPLET_KEY);
        clearGuestTriplet();
        clearGuestResumeUiCache();
      }
      setProfile(null);
      setStepState("intro");
      onAccountSwitch?.();
    }
    localStorage.setItem(ACCOUNT_KEY, authUser.sub);
  }, [authLoading, isLoggedIn, authUser?.sub, onAccountSwitch]);

  return {
    step,
    setStepState,
    setStep,
    flowBootstrapped,
    profile,
    setProfile,
    persistProfile,
    session,
    sessionLoading,
    refresh,
    reconnectSession,
    spawnSession,
    showWelcomeBack,
    setShowWelcomeBack,
    reconnecting,
    handleReconnectSession,
    paymentNotice,
    setPaymentNotice,
  };
}
