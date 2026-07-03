"use client";

import { useState, useEffect, useCallback } from "react";
import type { FlowStep } from "@/components/FlowStepper";
import { DEFAULT_DECK_SYSTEM } from "@/lib/decks";
import { loadGuestTriplet } from "@/lib/guest-triplet";
import { mergeGuestTripletIntoProfile } from "@/lib/guest-triplet";
import { useAuraSession } from "@/lib/useSession";
import type { StoredProfile } from "@/types/stored-profile";
import {
  ACCOUNT_KEY,
  FLOW_STEP_KEY,
  LAST_MASTER_KEY,
  LAST_VISIT_KEY,
  PENDING_MASTER_KEY,
  PROFILE_KEY,
  persistProfileData,
  persistStep,
  readStoredProfile,
} from "@/lib/home-flow-storage";
import { APP_SHELL_QUERY, APP_SHELL_VALUE } from "@/lib/app-shell";

export type { StoredProfile };

export interface UseHomeFlowOptions {
  referrerSlug?: string;
  isLoggedIn: boolean;
  authLoading: boolean;
  authUser: { sub: string } | null | undefined;
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
    if (typeof window !== "undefined" && next !== "intro") {
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

  useEffect(() => {
    if (authLoading) return;

    if (!isLoggedIn) {
      setStepState("intro");
      return;
    }

    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("resume") === "chat" && params.get("master")) {
        return;
      }
    }

    const stored = localStorage.getItem(PROFILE_KEY);
    const savedStep = localStorage.getItem(FLOW_STEP_KEY) as FlowStep | null;
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
        setStepState(guest.tarotCards.length >= 3 ? "onboarding" : "triplet");
      }
      return;
    }

    try {
      let parsed = JSON.parse(stored) as StoredProfile;
      if (isLoggedIn) {
        parsed = mergeGuestTripletIntoProfile(parsed) as StoredProfile;
        localStorage.setItem(PROFILE_KEY, JSON.stringify(parsed));
        setProfile(parsed);
      }

      if (parsed.tarotCards?.length >= 3) {
        if (savedStep === "intention") {
          const pendingMaster = localStorage.getItem(PENDING_MASTER_KEY);
          if (pendingMaster) {
            const qs = new URLSearchParams({
              master: pendingMaster,
              [APP_SHELL_QUERY]: APP_SHELL_VALUE,
            });
            window.location.assign(`/session/intention?${qs.toString()}`);
            return;
          }
          localStorage.removeItem(PENDING_MASTER_KEY);
          setStepState("masters");
          persistStep("masters");
        } else if (savedStep === "chat" && savedMaster) {
          setStepState("chat");
          onRestoreChatMaster?.(savedMaster);
        } else if (savedStep === "chat") {
          setStepState("masters");
          persistStep("masters");
        } else if (savedStep === "intro") {
          setStepState("masters");
          persistStep("masters");
        } else {
          setStepState(savedStep ?? "masters");
        }
      } else if (parsed.name || parsed.birthDate) {
        setStepState(savedStep === "intro" ? "masters" : savedStep ?? "triplet");
      } else if (savedStep && savedStep !== "intro") {
        setStepState(savedStep);
      }
    } catch {
      localStorage.removeItem(PROFILE_KEY);
    }
  }, [authLoading, isLoggedIn, onRestoreChatMaster]);

  useEffect(() => {
    if (authLoading || !isLoggedIn || !authUser?.sub) return;

    const prevAccount = localStorage.getItem(ACCOUNT_KEY);
    if (prevAccount && prevAccount !== authUser.sub) {
      localStorage.removeItem(PROFILE_KEY);
      localStorage.removeItem(FLOW_STEP_KEY);
      localStorage.removeItem(LAST_MASTER_KEY);
      localStorage.removeItem(PENDING_MASTER_KEY);
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
