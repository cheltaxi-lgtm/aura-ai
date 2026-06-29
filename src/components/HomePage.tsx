"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { createPortal, flushSync } from "react-dom";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import OnboardingForm from "@/components/OnboardingForm";
import TarotTriplet from "@/components/TarotTriplet";
import MasterSelect from "@/components/MasterSelect";
import ChatWindow from "@/components/ChatWindow";
import SessionList, { type SessionListItem } from "@/components/SessionList";
import { NAVIGATE_CABINET_EVENT } from "@/components/AuthHeader";
import AppTopHeader from "@/components/AppTopHeader";
import { emitRuneBalanceUpdate } from "@/components/RuneBalance";
import DailyBonusClaimer from "@/components/DailyBonusClaimer";
import { usePaywall } from "@/contexts/PaywallContext";
import { parseInsufficientRunes } from "@/lib/api-errors";
import IntentionPicker from "@/components/IntentionPicker";
import PremiumEnergyBlock from "@/components/PremiumEnergyBlock";
import MasterSessionFlow from "@/components/MasterSessionFlow";
import RitualFlow from "@/components/ritual/RitualFlow";
import { RITUAL_MASTERS } from "@/lib/ritual-config";
import FlowStepper from "@/components/FlowStepper";
import AuraSellingLanding from "@/components/AuraSellingLanding";
import DeckGallery from "@/components/DeckGallery";
import MasterDecksModal from "@/components/MasterDecksModal";
import PhotoReadingFlow, { type PhotoReadingChatPayload } from "@/components/PhotoReadingFlow";
import { buildPhotoReadingChatMessages, mergePhotoReadingIntoChat } from "@/lib/photo-chat";
import { useRuneConfig } from "@/lib/useRuneConfig";
import { useAuth } from "@/lib/useAuth";
import {
  findShowcaseMaster,
  getAiMasters,
  isAiMasterId,
  type ShowcaseMaster,
} from "@/lib/showcase-masters";
import { getCharacterById } from "@/lib/characters";
import {
  APP_SHELL_SECTIONS,
  consumeOpenDecksModalFlag,
  navigateToAppSection,
  navigateToDecksModal,
  navigateToPhotoReading as navigateToPhotoReadingHard,
} from "@/lib/app-shell-nav";
import RegisterGate from "@/components/RegisterGate";
import WelcomeBackBanner from "@/components/WelcomeBackBanner";
import AppBootstrapScreen from "@/components/AppBootstrapScreen";
import SpreadRitualLoader from "@/components/SpreadRitualLoader";
import {
  persistSessionIntention,
  persistIntentionSpreadState,
  type SessionIntention,
  type SessionTopicId,
} from "@/lib/intention";
import { pollIntentionSpreadReading } from "@/lib/intention-spread-client";
import { waitForSpreadReadingRitual } from "@/components/SpreadReadingRitualPanel";
import { generateId } from "@/lib/id";
import {
  loadChatCache,
  loadChatCacheAny,
  clearChatCache,
  saveChatCache,
  chatHasSpreadReading,
  SESSION_ONLY_CACHE_KEY,
  MIN_SPREAD_READING_CHARS,
  type CachedChatSpread,
} from "@/lib/chat-cache";
import { resolveClientReadingText } from "@/lib/chat-reply-sanitize";
import { type StoredReadingRow } from "@/lib/reading-progress";
import type { SpreadSymbol } from "@/lib/decks/types";
import type { DeckSystem } from "@/lib/decks/types";
import { DEFAULT_DECK_SYSTEM, resolveMasterDeckSystem, spreadKey } from "@/lib/decks";
import { resolveSpreadSymbols } from "@/lib/intention-draw";
import { getSpreadForSystem, resolveMasterSpread } from "@/lib/spread-context";
import { redrawSpreadToDeckCards, redrawSpreadToTarotCards } from "@/lib/photo-spread-redraw";
import type { DeckCardInput } from "@/lib/deck-card-utils";
import { tarotCardsKey } from "@/lib/tarot";
import { requestSceneImage, tarotCardNames } from "@/lib/scene-images-client";
import type { Message } from "@/types";
import { useHomeFlow } from "@/hooks/useHomeFlow";
import { useChatSession } from "@/hooks/useChatSession";
import { useChatReadingLoading, useChatActions } from "@/hooks/useChatActions";
import {
  useOnboardingFlow,
  masterVisualKey,
  type ChatSessionDeps,
} from "@/hooks/useOnboardingFlow";
import { clearPendingReading } from "@/lib/chat-reading-helpers";
import {
  mergeActiveProfile,
  readStoredProfileSpread,
} from "@/lib/onboarding-flow-helpers";
import {
  FLOW_STEP_KEY,
  LAST_MASTER_KEY,
  readStoredProfile,
} from "@/lib/home-flow-storage";
import type { StoredProfile } from "@/types/stored-profile";

export type { StoredProfile };

export interface HomePageProps {
  referrerSlug?: string;
}

function resolveDestinyCardUrl(
  readings: StoredReadingRow[],
  cardsKey: string,
  characterId: string
): string | null {
  if (!cardsKey || !characterId) return null;

  for (const row of readings) {
    if (row.characterName !== characterId) continue;
    if (spreadKey(row.contextData?.tarotCards) !== cardsKey) continue;
    const url = row.contextData?.sceneArt?.destiny_card;
    if (url) return url;
  }

  return null;
}

export default function HomePage({ referrerSlug }: HomePageProps) {
  const { config: runeConfig, cost: runeCost, formatRunes } = useRuneConfig();
  const { isLoggedIn, loading: authLoading, user: authUser } = useAuth();
  const { openPaywall, showRateLimit } = usePaywall();

  const [selectedCharacter, setSelectedCharacter] = useState<string | null>(null);
  const [lastMasterId, setLastMasterId] = useState<string | null>(null);
  const [photoChatSpread, setPhotoChatSpread] = useState<{
    masterId: string;
    cards: DeckCardInput[];
    system: DeckSystem;
  } | null>(null);
  /** Overrides MasterSessionFlow preselection when opening from PremiumEnergyBlock CTAs. */
  const [energyFlowMasterId, setEnergyFlowMasterId] = useState<string | null>(null);
  /** Pending deep-link auto-reading (from a notification CTA): open chat + auto-ask. */
  const [autoAsk, setAutoAsk] = useState<{ master: string; question: string } | null>(null);
  const autoAskParsedRef = useRef(false);
  const autoAskOpenedRef = useRef(false);
  const autoAskSentRef = useRef(false);
  const autoAskMasterRef = useRef<string | null>(null);
  const exitToLandingForNavRef = useRef<(() => void) | null>(null);
  const [pendingNav, setPendingNav] = useState<
    { type: "section"; id: string } | { type: "decks" } | null
  >(null);

  const {
    isLoading,
    setIsLoading,
    readingInFlightRef,
    applyRestoredChatSpreadRef,
    onApplyRestoredSpread,
  } = useChatReadingLoading();

  const loadReadingRef = useRef<
    (
      characterId: string,
      profileOverride?: StoredProfile,
      loadOptions?: {
        force?: boolean;
        replaceExisting?: boolean;
        preserveChat?: boolean;
        sessionId?: string;
      }
    ) => Promise<void>
  >(async () => {});
  const openChatWithCharacterRef = useRef<
    (
      characterId: string,
      openOptions?: {
        forceNew?: boolean;
        sessionOnly?: boolean;
        intention?: SessionIntention | null;
      }
    ) => Promise<void>
  >(async () => {});
  const applyHistorySessionMetaRef = useRef<
    (
      data: {
        sessionId?: string | null;
        intention?: string | null;
        spreadType?: string | null;
        cards?: string[] | null;
        spread?: {
          cards: { name: string; meaning?: string }[];
          system: DeckSystem;
          type: string;
          cardsKey: string;
          intention?: string | null;
        } | null;
      },
      characterId: string
    ) => void
  >(() => {});
  const chatDepsRef = useRef<ChatSessionDeps | null>(null);
  const handleOpenPaywallRef = useRef<
    (opts?: { balance?: number; requiredRunes?: number; shortage?: number }) => void
  >(() => {});
  const resetSpreadOnAccountSwitchRef = useRef<() => void>(() => {});
  const sendingRef = useRef(false);
  const skipNextReadingRef = useRef(false);
  const pendingNewChatThreadRef = useRef(false);
  const selectedCharacterRef = useRef<string | null>(null);
  const chatClearRef = useRef<() => void>(() => {});
  const accountSwitchCleanupRef = useRef<() => void>(() => {});
  const pendingReadingMasterRef = useRef<string | null>(null);
  const destinyBackfillRef = useRef<string | null>(null);
  const destinyGenRef = useRef<Set<string>>(new Set());

  const {
    step,
    setStepState,
    setStep,
    profile,
    setProfile,
    persistProfile,
    session,
    sessionLoading,
    refresh,
    reconnectSession: reconnectSessionRaw,
    spawnSession: spawnSessionRaw,
    showWelcomeBack,
    setShowWelcomeBack,
    reconnecting,
    handleReconnectSession,
    paymentNotice,
    setPaymentNotice,
  } = useHomeFlow({
    referrerSlug,
    isLoggedIn,
    authLoading,
    authUser,
    setSelectedCharacter,
    onPopStateLeaveChat: () => chatClearRef.current(),
    onPopStateReset: () => chatClearRef.current(),
    onRestoreChatMaster: (masterId) => setSelectedCharacter(masterId),
    onPaymentChatReady: (masterId) => setSelectedCharacter(masterId),
    onAccountSwitch: () => {
      clearChatCache();
      localStorage.removeItem("aura_session_id");
      setSelectedCharacter(null);
      resetSpreadOnAccountSwitchRef.current();
      accountSwitchCleanupRef.current();
    },
  });

  const [deckGalleryOpen, setDeckGalleryOpen] = useState(false);
  const [browseDeckMaster, setBrowseDeckMaster] = useState<ShowcaseMaster | null>(null);
  const [showDecksModal, setShowDecksModal] = useState(false);
  const [insufficientRunes, setInsufficientRunes] = useState<{
    balance: number;
    required: number;
  } | null>(null);
  const [runeBalance, setRuneBalance] = useState(0);

  const applyRuneBalancePayload = useCallback(
    (data: {
      balance?: number;
      newTransactions?: Array<{ id: string; amount: number; description?: string }>;
    } | null) => {
      if (!data) return;
      if (typeof data.balance === "number") {
        setRuneBalance(data.balance);
        emitRuneBalanceUpdate(data.balance);
      }
      const txs = data.newTransactions;
      if (txs?.length) {
        const total = txs.reduce((sum, t) => sum + (t.amount ?? 0), 0);
        const description = txs[0]?.description ?? "Пополнение баланса";
        setRuneReceiptPopup({ total, description });
        setTimeout(() => setRuneReceiptPopup(null), 5000);
        void fetch("/api/runes/balance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: txs.map((t) => t.id) }),
          credentials: "include",
        });
      }
    },
    []
  );

  const [photoReadingOpen, setPhotoReadingOpen] = useState(false);
  const [showRitualFlow, setShowRitualFlow] = useState(false);
  const [ritualFlowMaster, setRitualFlowMaster] = useState<string>("ragnar");
  const [openRitualId, setOpenRitualId] = useState<string | null>(null);
  const [achievementPopup, setAchievementPopup] = useState<{
    label: string;
    description: string;
    bonus: number;
    phrase: string;
  } | null>(null);
  const [runeReceiptPopup, setRuneReceiptPopup] = useState<{
    total: number;
    description: string;
  } | null>(null);

  const syncPhotoSessionForMaster = useCallback(
    async (masterId: string, historyId?: string): Promise<string | undefined> => {
      try {
        const res = await fetch("/api/photo-reading/sync-session", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ characterId: masterId, historyId }),
        });
        if (!res.ok) return undefined;
        const data = (await res.json()) as { sessionId?: string };
        return data.sessionId;
      } catch {
        return undefined;
      }
    },
    []
  );

  const reconnectSession = useCallback(
    async (refToken: string | null) => {
      const next = await reconnectSessionRaw(refToken);
      return { sessionId: next.sessionId };
    },
    [reconnectSessionRaw]
  );

  const spawnSession = useCallback(
    async (refToken: string | null) => {
      const next = await spawnSessionRaw(refToken);
      return { sessionId: next.sessionId };
    },
    [spawnSessionRaw]
  );

  const refreshSession = useCallback(
    async (sessionId: string) => {
      await refresh(sessionId);
    },
    [refresh]
  );

  const onboarding = useOnboardingFlow({
    referrerSlug,
    isLoggedIn,
    authLoading,
    authUser,
    step,
    setStep,
    setStepState,
    profile,
    setProfile,
    persistProfile,
    session,
    sessionLoading,
    refresh: refreshSession,
    reconnectSession,
    spawnSession,
    selectedCharacter,
    setSelectedCharacter,
    lastMasterId,
    setLastMasterId,
    readingInFlightRef,
    handleOpenPaywallRef,
    loadReadingRef,
    openChatWithCharacterRef,
    applyRestoredChatSpreadRef,
    applyHistorySessionMetaRef,
    chatDepsRef,
    photoChatSpread,
    pendingReadingMasterRef,
    syncPhotoSessionForMaster,
    onRuneBalancePayload: applyRuneBalancePayload,
  });

  resetSpreadOnAccountSwitchRef.current = onboarding.resetSpreadOnAccountSwitch;

  const {
    masters,
    tripletSystem,
    setTripletSystem,
    tripletMasterId,
    setTripletMasterId,
    newTripletDraft,
    tripletNotice,
    setTripletNotice,
    tripletCooldown,
    spreadRitual,
    setSpreadRitual,
    sessionIntention,
    setSessionIntention,
    intentionSpread,
    setIntentionSpread,
    intentionSpreadLoading,
    setIntentionSpreadLoading,
    intentionHighlight,
    setIntentionHighlight,
    chatSessionSpread,
    setChatSessionSpread,
    spreadFlipped,
    setSpreadFlipped,
    hideChatSpread,
    setHideChatSpread,
    pendingMasterId,
    readingRitualActive,
    setReadingRitualActive,
    readingRitualCountdownDone,
    setReadingRitualCountdownDone,
    setSpreadReadingRitualOpen,
    showSessionFlow,
    setShowSessionFlow,
    savedReadings,
    serverContinueIds,
    pendingChatOptsRef,
    sessionListBackMasterRef,
    sessionSpreadMetaRef,
    displayTarotCards,
    displayDeckSystem,
    tripletOwnerMasterId,
    continueMasterIds,
    spreadReadingDone,
    recapContinueMasterId,
    canChangeTripletMaster,
    tripletCooldownHint,
    spreadCardsKey,
    chatSpread,
    activeSpreadCardsKey,
    shouldAutoLoadSpreadReading,
    needsSpreadFlip,
    allSpreadFlipped,
    recommendedId,
    dailyEnergyMasterId,
    tripletMasterName,
    chatDisplaySpread,
    spreadReadingPending,
    getActiveProfile,
    refreshSavedReadings,
    handleOnboardingComplete,
    handleTripletComplete,
    handleTripletBack,
    startPersonalFlow,
    handleTripletMasterChange,
    handleTripletDraft,
    beginChatAfterIntention,
    openChatWithSessionParams,
    bindSessionToMaster,
    handleSelectCharacter,
    handleMasterPick,
    handleContinueListedSession,
    handleSessionListBack,
    handleSpreadReadingRitualComplete,
  } = onboarding;

  useEffect(() => {
    selectedCharacterRef.current = selectedCharacter;
  }, [selectedCharacter]);

  useEffect(() => {
    const savedMaster = localStorage.getItem(LAST_MASTER_KEY);
    if (savedMaster) setLastMasterId(savedMaster);
  }, [setLastMasterId]);

  const scrollToSection = useCallback((sectionId: string) => {
    if (typeof window !== "undefined" && window.location.pathname !== "/") {
      navigateToAppSection(sectionId);
      return;
    }
    exitToLandingForNavRef.current?.();
    setPendingNav({ type: "section", id: sectionId });
  }, []);

  const openPhotoReading = useCallback(() => {
    if (typeof window !== "undefined" && window.location.pathname !== "/") {
      navigateToPhotoReadingHard();
      return;
    }
    exitToLandingForNavRef.current?.();
    setPhotoReadingOpen(true);
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  const photoNavLabel = runeConfig.enabled
    ? `Фото · ${formatRunes(runeCost("VISION_ANALYSIS"))}`
    : "Фото расклад";

  const closePhotoReading = useCallback(() => {
    setPhotoReadingOpen(false);
    setSpreadRitual({ active: false });
  }, [setSpreadRitual]);

  const handleBrowseDeck = useCallback((master: ShowcaseMaster) => {
    setBrowseDeckMaster(master);
    setDeckGalleryOpen(true);
    setShowDecksModal(false);
    requestAnimationFrame(() => {
      document.getElementById("колода")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  const openDecksModal = useCallback(() => {
    if (typeof window !== "undefined" && window.location.pathname !== "/") {
      navigateToDecksModal();
      return;
    }
    exitToLandingForNavRef.current?.();
    setPendingNav({ type: "decks" });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const hash = decodeURIComponent(window.location.hash.slice(1));
    if (params.get("photo") === "1" || hash === "фото-расклад") {
      setPhotoReadingOpen(true);
      window.history.replaceState(null, "", window.location.pathname);
    }
    if (params.get("runeShop") === "1") {
      openPaywall({ currentBalance: runeBalance });
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [openPaywall, runeBalance]);

  // Deep link from a notification CTA: /?ask=<question>&master=<id>. Parse once,
  // then open a session chat with the master and auto-send the question.
  useEffect(() => {
    if (typeof window === "undefined" || autoAskParsedRef.current) return;
    autoAskParsedRef.current = true;
    const params = new URLSearchParams(window.location.search);
    const ask = params.get("ask")?.trim();
    if (!ask) return;
    setAutoAsk({ master: params.get("master")?.trim() ?? "", question: ask });
    const url = new URL(window.location.href);
    url.searchParams.delete("ask");
    url.searchParams.delete("master");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !window.location.hash) return;

    const scrollToHash = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (id === "фото-расклад") return;
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    const timer = window.setTimeout(scrollToHash, 150);
    return () => window.clearTimeout(timer);
  }, [step, selectedCharacter, isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn || !runeConfig.enabled) return;
    fetch("/api/runes/balance")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => applyRuneBalancePayload(d))
      .catch(() => undefined);
  }, [isLoggedIn, runeConfig.enabled, step, applyRuneBalancePayload]);

  useEffect(() => {
    if (!isLoggedIn || (step !== "masters" && step !== "chat")) return;
    refreshSavedReadings();
  }, [isLoggedIn, step, selectedCharacter, refreshSavedReadings]);

  const {
    messages,
    setMessages,
    isLoadingHistory,
    setIsLoadingHistory,
    loadingMoreHistory,
    historyHasMore,
    setHistoryHasMore,
    retryDraft,
    setRetryDraft,
    chatHeaderImage,
    setChatHeaderImage,
    sessionOnlyChat,
    setSessionOnlyChat,
    sessionListMaster,
    setSessionListMaster,
    sessionsListData,
    setSessionsListData,
    sessionsListLoading,
    setSessionsListLoading,
    sessionListActionId,
    setSessionListActionId,
    consultationSessionId,
    consultationSessionIdRef,
    setConsultationSessionId,
    consultationReadOnly,
    setConsultationReadOnly,
    completingSession,
    setCompletingSession,
    archiveSessionIdRef,
    exitingToSessionListRef,
    chatLoadedForRef,
    prevSelectedCharacterRef,
    clearMessages,
    persistSessionMetaToServer,
    restoreChatForCharacter,
    refreshSessionsList,
    resolveConsultationSessionId,
    handleLoadMoreHistory,
    buildSessionOnlyWelcome,
  } = useChatSession({
    isLoggedIn,
    selectedCharacter,
    getActiveProfile,
    masters,
    spreadCardsKey,
    activeSpreadCardsKey,
    isLoading,
    sendingRef,
    readingInFlightRef,
    sessionOffline: session?.offline,
    onApplyRestoredSpread,
  });

  chatDepsRef.current = {
    messages,
    setMessages,
    sessionListMaster,
    setSessionListMaster,
    setSessionsListLoading,
    setSessionsListData,
    setConsultationSessionId,
    consultationSessionIdRef,
    setConsultationReadOnly,
    setIsLoadingHistory,
    setHistoryHasMore,
    persistSessionMetaToServer,
    restoreChatForCharacter,
    resolveConsultationSessionId,
    refreshSessionsList,
    archiveSessionIdRef,
    sessionOnlyChat,
    setSessionOnlyChat,
    selectedCharacter,
    setSelectedCharacter,
    setIsLoading,
    setChatHeaderImage,
    setInsufficientRunes,
    setRuneBalance,
    chatLoadedForRef,
    skipNextReadingRef,
    pendingNewChatThreadRef,
    readingInFlightRef,
    setPhotoChatSpread,
  };

  useEffect(() => {
    chatClearRef.current = clearMessages;
    accountSwitchCleanupRef.current = () => {
      setPhotoChatSpread(null);
      setSpreadRitual({ active: false });
      clearMessages();
    };
  }, [clearMessages, setSpreadRitual]);

  useEffect(() => {
    if (authLoading || !isLoggedIn || step !== "intro") return;
    setStep("masters");
  }, [authLoading, isLoggedIn, step, setStep]);

  useEffect(() => {
    if (authLoading || !isLoggedIn) return;
    if (sessionListMaster) return;
    if (step !== "chat" || selectedCharacter) return;
    if (pendingChatOptsRef.current) return;
    if (readingInFlightRef.current) return;

    const masterId = localStorage.getItem(LAST_MASTER_KEY) || lastMasterId;
    if (masterId) {
      void bindSessionToMaster(masterId).finally(() => {
        setSelectedCharacter(masterId);
        setLastMasterId(masterId);
      });
      return;
    }

    setStep("masters");
  }, [
    authLoading,
    isLoggedIn,
    step,
    selectedCharacter,
    lastMasterId,
    sessionListMaster,
    setStep,
    pendingChatOptsRef,
    setLastMasterId,
    bindSessionToMaster,
  ]);

  useEffect(() => {
    if (step !== "chat" || intentionSpreadLoading) return;
    if (!selectedCharacter || !intentionSpread) return;
    if (intentionSpread.masterId !== selectedCharacter) return;
    if (sessionIntention === "life_death") return;
    if (chatHasSpreadReading(messages)) return;
    if (intentionSpread.cards.length < 3) return;

    const intention = sessionIntention ?? intentionSpread.intention;
    if (!intention) return;

    const cardsKey = spreadKey(intentionSpread.cards);
    const recoveryKey = `${selectedCharacter}:${intention}:${cardsKey}`;
    if (onboarding.spreadReadingRecoveryKeyRef.current === recoveryKey) return;
    onboarding.spreadReadingRecoveryKeyRef.current = recoveryKey;

    let cancelled = false;
    setSpreadReadingRitualOpen(true);
    setReadingRitualActive(true);
    setReadingRitualCountdownDone(false);
    void (async () => {
      const [raw] = await Promise.all([
        pollIntentionSpreadReading({
          characterId: selectedCharacter,
          intention,
          cardNames: intentionSpread.cards.map((c) => c.name),
        }),
        waitForSpreadReadingRitual(),
      ]);
      if (cancelled || !raw) {
        setSpreadReadingRitualOpen(false);
        setReadingRitualActive(false);
        setReadingRitualCountdownDone(true);
        return;
      }

      const cardNames = intentionSpread.cards.map((c) => c.name);
      const readingText = resolveClientReadingText(raw, cardNames);
      if (!readingText || cancelled) {
        setSpreadReadingRitualOpen(false);
        setReadingRitualActive(false);
        setReadingRitualCountdownDone(true);
        return;
      }

      setReadingRitualCountdownDone(true);
      setSpreadReadingRitualOpen(false);
      setReadingRitualActive(false);
      setMessages((prev) => {
        if (chatHasSpreadReading(prev)) return prev;
        const readingMsg: Message = {
          id: generateId(),
          role: "assistant",
          content: readingText,
          timestamp: new Date(),
        };
        const next = [...prev, readingMsg];
        saveChatCache(selectedCharacter, next, cardsKey, {
          cards: intentionSpread.cards,
          system: intentionSpread.system,
          variant: "intention",
        });
        return next;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [
    step,
    intentionSpreadLoading,
    selectedCharacter,
    intentionSpread,
    sessionIntention,
    messages,
    setMessages,
    onboarding.spreadReadingRecoveryKeyRef,
    setReadingRitualCountdownDone,
    setReadingRitualActive,
    setSpreadReadingRitualOpen,
  ]);

  const chatMessagesForDisplay = useMemo(() => {
    if (!spreadReadingPending) return messages;
    if (chatHasSpreadReading(messages)) return messages;
    return messages.filter(
      (m) =>
        !(
          m.role === "assistant" &&
          (m.content?.trim().length ?? 0) >= MIN_SPREAD_READING_CHARS
        )
    );
  }, [messages, spreadReadingPending]);

  useEffect(() => {
    if ((chatDisplaySpread?.cards?.length ?? 0) >= 3) {
      setChatHeaderImage(null);
    }
  }, [chatDisplaySpread?.cards?.length, setChatHeaderImage]);

  const applyDestinyCardToChat = useCallback(
    (url: string, characterId?: string | null) => {
      setChatHeaderImage(url);
      setMessages((prev) => {
        if (!prev.length) return prev;
        const idx = prev.findIndex((m) => m.role === "assistant");
        if (idx === -1) return prev;
        if (prev[idx].sceneImageUrl === url) return prev;
        const updated = prev.map((m, i) =>
          i === idx ? { ...m, sceneImageUrl: url } : m
        );
        const cid = characterId ?? selectedCharacter;
        if (cid) saveChatCache(cid, updated, activeSpreadCardsKey);
        return updated;
      });
    },
    [selectedCharacter, activeSpreadCardsKey, setChatHeaderImage, setMessages]
  );

  useEffect(() => {
    if (!selectedCharacter || !activeSpreadCardsKey) return;

    const firstAssistant = messages.find((m) => m.role === "assistant");
    if (firstAssistant?.sceneImageUrl) {
      setChatHeaderImage((prev) => prev ?? firstAssistant.sceneImageUrl ?? null);
      return;
    }

    const savedUrl = resolveDestinyCardUrl(
      savedReadings,
      activeSpreadCardsKey,
      selectedCharacter
    );
    if (savedUrl) {
      applyDestinyCardToChat(savedUrl, selectedCharacter);
    }
  }, [
    selectedCharacter,
    messages,
    savedReadings,
    activeSpreadCardsKey,
    applyDestinyCardToChat,
    setChatHeaderImage,
  ]);

  const attachSceneToAssistantMessage = useCallback(
    async (
      messageId: string,
      content: string,
      characterId: string,
      scene: "destiny_card" | "scene_illustration",
      userQuestion?: string
    ) => {
      const activeProfile = getActiveProfile();
      if (!activeProfile) return;

      const masterCtx = resolveMasterSpread(activeProfile, characterId, masters);
      const cardsKey =
        masterCtx.cardsKey ||
        spreadKey(activeProfile.tarotCards) ||
        activeSpreadCardsKey;

      if (scene === "destiny_card" && cardsKey) {
        const genKey = `${characterId}|destiny_card|${cardsKey}`;
        const saved = resolveDestinyCardUrl(savedReadings, cardsKey, characterId);
        if (saved) {
          destinyGenRef.current.add(genKey);
          applyDestinyCardToChat(saved, characterId);
          return;
        }
        if (destinyGenRef.current.has(genKey)) {
          return;
        }
        destinyGenRef.current.add(genKey);
      }

      const url = await requestSceneImage({
        scene,
        characterKey: masterVisualKey(characterId),
        userName: activeProfile.name,
        zodiac: activeProfile.zodiac,
        cards: tarotCardNames(activeProfile.tarotCards),
        userQuestionText: scene === "scene_illustration" ? userQuestion : undefined,
        aiResponseText: scene === "scene_illustration" ? content : undefined,
      });

      if (!url) return;

      if (scene === "destiny_card") {
        setChatHeaderImage(url);
      }

      setMessages((prev) => {
        const updated = prev.map((m) =>
          m.id === messageId ? { ...m, sceneImageUrl: url } : m
        );
        const ctx = resolveMasterSpread(activeProfile, characterId, masters);
        const key = ctx.cards.length >= 3 ? ctx.cardsKey : spreadCardsKey;
        saveChatCache(characterId, updated, key);
        return updated;
      });
    },
    [
      getActiveProfile,
      spreadCardsKey,
      masters,
      savedReadings,
      applyDestinyCardToChat,
      activeSpreadCardsKey,
      setChatHeaderImage,
      setMessages,
    ]
  );

  useEffect(() => {
    if (sessionOnlyChat) return;
    if (!selectedCharacter || !activeSpreadCardsKey) return;
    if ((chatDisplaySpread?.cards?.length ?? 0) >= 3) return;

    const firstAssistant = messages.find((m) => m.role === "assistant");
    if (!firstAssistant || firstAssistant.sceneImageUrl) return;
    if (resolveDestinyCardUrl(savedReadings, activeSpreadCardsKey, selectedCharacter)) return;

    const genKey = `${selectedCharacter}|destiny_card|${activeSpreadCardsKey}`;
    if (destinyGenRef.current.has(genKey)) return;
    if (!firstAssistant.content || firstAssistant.content.length < 40) return;

    const backfillKey = `${selectedCharacter}|${activeSpreadCardsKey}`;
    if (destinyBackfillRef.current === backfillKey) return;
    destinyBackfillRef.current = backfillKey;

    void attachSceneToAssistantMessage(
      firstAssistant.id,
      firstAssistant.content,
      selectedCharacter,
      "destiny_card"
    ).then(() => refreshSavedReadings());
  }, [
    selectedCharacter,
    activeSpreadCardsKey,
    messages,
    savedReadings,
    attachSceneToAssistantMessage,
    refreshSavedReadings,
    sessionOnlyChat,
    chatDisplaySpread?.cards?.length,
  ]);

  const {
    loadReading,
    handleSendMessage,
    openChatWithCharacter,
    applyRestoredChatSpread,
    applyHistorySessionMeta,
  } = useChatActions({
    isLoading,
    setIsLoading,
    readingInFlightRef,
    applyRestoredChatSpreadRef,
    session,
    sessionLoading,
    refresh,
    setStep,
    isLoggedIn,
    authLoading,
    runeConfig,
    runeCost,
    formatRunes,
    runeBalance,
    setRuneBalance,
    setInsufficientRunes,
    handleOpenPaywall: (opts) => handleOpenPaywallRef.current(opts),
    showRateLimit,
    messages,
    setMessages,
    isLoadingHistory,
    setIsLoadingHistory,
    setHistoryHasMore,
    setConsultationSessionId,
    setConsultationReadOnly,
    restoreChatForCharacter,
    resolveConsultationSessionId,
    consultationSessionIdRef,
    buildSessionOnlyWelcome,
    selectedCharacter,
    selectedCharacterRef,
    masters,
    getActiveProfile,
    spreadCardsKey,
    activeSpreadCardsKey,
    savedReadings,
    refreshSavedReadings,
    sessionIntention,
    setSessionIntention,
    sessionOnlyChat,
    setSessionOnlyChat,
    sessionListMaster,
    setSessionListMaster,
    intentionSpread,
    setIntentionSpread,
    chatSessionSpread,
    setChatSessionSpread,
    setIntentionHighlight,
    setIntentionSpreadLoading,
    setReadingRitualActive,
    setReadingRitualCountdownDone,
    setSpreadReadingRitualOpen,
    setHideChatSpread,
    setSpreadFlipped,
    setPhotoChatSpread,
    setLastMasterId,
    setSelectedCharacter,
    skipNextReadingRef,
    pendingNewChatThreadRef,
    pendingReadingMasterRef,
    sessionSpreadMetaRef,
    sendingRef,
    archiveSessionIdRef,
    exitingToSessionListRef,
    chatLoadedForRef,
    prevSelectedCharacterRef,
    needsSpreadFlip,
    allSpreadFlipped,
    shouldAutoLoadSpreadReading,
    chatDisplaySpread,
    attachSceneToAssistantMessage,
    setRetryDraft,
    setAchievementPopup,
  });

  loadReadingRef.current = loadReading;
  openChatWithCharacterRef.current = openChatWithCharacter;
  applyHistorySessionMetaRef.current = applyHistorySessionMeta;

  // Auto-reading step 1 — once logged in and masters are ready, open a session
  // chat with the relevant master (mirrors the known-good "talk to master" path).
  useEffect(() => {
    if (!autoAsk || authLoading || !isLoggedIn || !masters.length) return;
    if (autoAskOpenedRef.current) return;
    autoAskOpenedRef.current = true;

    const resolved =
      (autoAsk.master && findShowcaseMaster(autoAsk.master, masters) ? autoAsk.master : null) ??
      recommendedId ??
      masters[0]?.id ??
      null;
    if (!resolved) {
      setAutoAsk(null);
      return;
    }
    autoAskMasterRef.current = resolved;

    void (async () => {
      readingInFlightRef.current = true;
      skipNextReadingRef.current = true;
      try {
        await bindSessionToMaster(resolved);
        await openChatWithCharacterRef.current(resolved, {
          sessionOnly: true,
          intention: null,
        });
      } finally {
        readingInFlightRef.current = false;
      }
    })();
  }, [
    autoAsk,
    authLoading,
    isLoggedIn,
    masters,
    recommendedId,
    bindSessionToMaster,
    readingInFlightRef,
  ]);

  // Auto-reading step 2 — once the session chat is open and its welcome has
  // loaded, send the question so the master answers the topic directly.
  useEffect(() => {
    if (!autoAsk || autoAskSentRef.current) return;
    if (!sessionOnlyChat || isLoading || isLoadingHistory) return;
    if (sendingRef.current || messages.length === 0) return;
    if (!selectedCharacter || selectedCharacter !== autoAskMasterRef.current) return;

    autoAskSentRef.current = true;
    const question = autoAsk.question;
    setAutoAsk(null);
    void handleSendMessage(question);
  }, [
    autoAsk,
    sessionOnlyChat,
    isLoading,
    isLoadingHistory,
    messages.length,
    selectedCharacter,
    handleSendMessage,
  ]);

  const handlePaywallClose = useCallback(async () => {
    const masterId = pendingReadingMasterRef.current;
    const required = insufficientRunes?.required;
    if (!masterId || !required) return;

    try {
      const res = await fetch("/api/runes/balance");
      if (!res.ok) return;
      const data = await res.json();
      applyRuneBalancePayload(data);
      const balance = typeof data.balance === "number" ? data.balance : 0;

      if (balance >= required) {
        pendingReadingMasterRef.current = null;
        clearPendingReading();
        setInsufficientRunes(null);
        readingInFlightRef.current = true;
        try {
          await loadReading(masterId);
        } finally {
          readingInFlightRef.current = false;
        }
      }
    } catch {
      /* пользователь может повторить вручную */
    }
  }, [insufficientRunes?.required, loadReading, applyRuneBalancePayload]);

  const handleOpenPaywall = useCallback(
    (opts?: { balance?: number; requiredRunes?: number; shortage?: number }) => {
      openPaywall({
        currentBalance: opts?.balance ?? runeBalance,
        requiredRunes: opts?.requiredRunes ?? insufficientRunes?.required,
        balance: opts?.balance ?? insufficientRunes?.balance,
        shortage: opts?.shortage,
        sessionId: session?.sessionId,
        userName: profile?.name ?? authUser?.name,
        onUnlocked: session?.sessionId
          ? () => refresh(session.sessionId).then(() => undefined)
          : undefined,
        onClose: handlePaywallClose,
      });
    },
    [
      openPaywall,
      runeBalance,
      insufficientRunes,
      session?.sessionId,
      profile?.name,
      authUser?.name,
      handlePaywallClose,
      refresh,
    ]
  );

  handleOpenPaywallRef.current = handleOpenPaywall;

  const deleteConsultationSessionClient = useCallback(
    async (masterId: string, sessionId: string): Promise<boolean> => {
      const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) return false;

      if (consultationSessionId === sessionId) {
        setConsultationSessionId(null);
        setConsultationReadOnly(false);
        archiveSessionIdRef.current = null;
      }
      clearChatCache(masterId);
      persistSessionIntention(masterId, null);
      persistIntentionSpreadState(masterId, null);
      void refreshSavedReadings();
      return true;
    },
    [consultationSessionId, refreshSavedReadings]
  );

  const navigateToSessionListAfterDelete = useCallback(
    (masterId: string) => {
      sessionListBackMasterRef.current = null;
      exitingToSessionListRef.current = true;
      flushSync(() => {
        setSelectedCharacter(null);
        setConsultationSessionId(null);
        setConsultationReadOnly(false);
        archiveSessionIdRef.current = null;
        setSessionListMaster(masterId);
        setStep("masters");
        setHideChatSpread(true);
        setSessionOnlyChat(false);
        setSessionIntention(null);
        setIntentionHighlight(false);
        setIntentionSpread(null);
        setSpreadFlipped([false, false, false]);
        sessionSpreadMetaRef.current = null;
        setMessages([]);
        chatLoadedForRef.current = null;
        setHistoryHasMore(false);
        readingInFlightRef.current = false;
        skipNextReadingRef.current = false;
        pendingNewChatThreadRef.current = false;
      });
      localStorage.setItem(FLOW_STEP_KEY, "masters");
      localStorage.removeItem(LAST_MASTER_KEY);
      setLastMasterId(null);
      window.setTimeout(() => {
        exitingToSessionListRef.current = false;
      }, 0);
    },
    [setStep]
  );

  const resolveSessionIdForDelete = useCallback(
    async (masterId: string): Promise<string | null> => {
      if (consultationSessionId) return consultationSessionId;
      if (archiveSessionIdRef.current) return archiveSessionIdRef.current;

      try {
        const params = new URLSearchParams({
          characterId: masterId,
          limit: "1",
        });
        const res = await fetch(`/api/chat/history?${params.toString()}`, {
          credentials: "include",
        });
        if (res.ok) {
          const data = (await res.json()) as { sessionId?: string | null };
          if (data.sessionId) return data.sessionId;
        }
      } catch {
        /* offline */
      }

      try {
        const res = await fetch(
          `/api/sessions?characterKey=${encodeURIComponent(masterId)}`,
          { credentials: "include" }
        );
        if (res.ok) {
          const data = (await res.json()) as { active?: { id?: string } | null };
          if (data.active?.id) return data.active.id;
        }
      } catch {
        /* offline */
      }

      if (session?.sessionId && !session.offline) return session.sessionId;
      return null;
    },
    [consultationSessionId, session?.sessionId, session?.offline]
  );

  const handleClearChat = useCallback(async () => {
    if (!selectedCharacter || !isLoggedIn) return;
    const masterId = selectedCharacter;
    const master = findShowcaseMaster(masterId, masters) ?? getCharacterById(masterId);
    const label = master?.name ?? "мастером";
    if (
      !window.confirm(
        `Удалить этот сеанс с ${label} безвозвратно? Переписка пропадёт из чата и личного кабинета.`
      )
    ) {
      return;
    }

    exitingToSessionListRef.current = true;

    try {
      const sid = await resolveSessionIdForDelete(masterId);

      if (sid) {
        const ok = await deleteConsultationSessionClient(masterId, sid);
        if (!ok) {
          exitingToSessionListRef.current = false;
          window.alert("Не удалось удалить сеанс. Попробуйте ещё раз.");
          return;
        }
      } else {
        const res = await fetch(
          `/api/chat/history?characterId=${encodeURIComponent(masterId)}`,
          { method: "DELETE", credentials: "include" }
        );
        if (!res.ok) {
          exitingToSessionListRef.current = false;
          window.alert("Не удалось удалить переписку. Попробуйте ещё раз.");
          return;
        }
        clearChatCache(masterId);
        persistSessionIntention(masterId, null);
        persistIntentionSpreadState(masterId, null);
        void refreshSavedReadings();
      }

      navigateToSessionListAfterDelete(masterId);
      await refreshSessionsList(masterId);
    } catch {
      exitingToSessionListRef.current = false;
      window.alert("Не удалось удалить. Проверьте соединение.");
    }
  }, [
    selectedCharacter,
    isLoggedIn,
    masters,
    resolveSessionIdForDelete,
    deleteConsultationSessionClient,
    navigateToSessionListAfterDelete,
    refreshSavedReadings,
    refreshSessionsList,
  ]);

  const handleArchiveListedSession = useCallback(
    async (masterId: string, item: SessionListItem) => {
      setSessionListActionId(item.id);
      try {
        const res = await fetch("/api/session/complete", {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: item.id,
            characterKey: masterId,
            archiveOnly: true,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          alreadyCompleted?: boolean;
        };

        if (res.ok || res.status === 409 || data.alreadyCompleted) {
          if (consultationSessionId === item.id) {
            setConsultationReadOnly(true);
            archiveSessionIdRef.current = item.id;
          }
          await refreshSessionsList(masterId);
          return;
        }

        const message =
          data.error === "Session has no master"
            ? "Не удалось отправить в архив: сеанс не связан с мастером."
            : "Не удалось отправить сеанс в архив. Попробуйте ещё раз.";
        window.alert(message);
      } finally {
        setSessionListActionId(null);
      }
    },
    [refreshSessionsList, consultationSessionId]
  );

  const handleDeleteListedSession = useCallback(
    async (masterId: string, item: SessionListItem) => {
      const confirmed = window.confirm(
        "Удалить этот сеанс безвозвратно? Переписка и записи пропадут из личного кабинета."
      );
      if (!confirmed) return;

      setSessionListActionId(item.id);
      try {
        const ok = await deleteConsultationSessionClient(masterId, item.id);
        if (ok) {
          await refreshSessionsList(masterId);
        }
      } finally {
        setSessionListActionId(null);
      }
    },
    [deleteConsultationSessionClient, refreshSessionsList]
  );

  const handleCompleteSession = useCallback(async () => {
    if (consultationReadOnly) return;
    const masterId = selectedCharacter;
    if (!masterId) return;

    let sid = consultationSessionId;
    if (!sid) {
      sid = await resolveConsultationSessionId(masterId);
    }
    if (!sid) return;

    setCompletingSession(true);
    try {
      const res = await fetch("/api/session/complete", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sid }),
      });
      if (res.ok) {
        const data = (await res.json()) as { finalMessage?: string };
        if (data.finalMessage?.trim()) {
          setMessages((prev) => [
            ...prev,
            {
              id: generateId(),
              role: "assistant",
              content: data.finalMessage!.trim(),
              timestamp: new Date(),
            },
          ]);
        }
        setConsultationReadOnly(true);
        archiveSessionIdRef.current = sid;
        void refreshSessionsList(masterId);
      }
    } finally {
      setCompletingSession(false);
    }
  }, [
    consultationSessionId,
    consultationReadOnly,
    selectedCharacter,
    resolveConsultationSessionId,
    refreshSessionsList,
  ]);

  const handleOpenArchiveSession = useCallback(
    async (masterId: string, item: SessionListItem) => {
      sessionListBackMasterRef.current = masterId;
      setSessionListMaster(null);
      setConsultationReadOnly(true);
      setConsultationSessionId(item.id);
      consultationSessionIdRef.current = item.id;
      archiveSessionIdRef.current = item.id;
      skipNextReadingRef.current = true;
      chatLoadedForRef.current = null;

      await openChatWithCharacter(masterId, { intention: null });

      selectedCharacterRef.current = masterId;
      applyHistorySessionMeta(
        {
          sessionId: item.id,
          intention: item.intention,
          spreadType: item.spreadType,
          cards: item.cards,
        },
        masterId
      );

      if (item.cards && item.cards.length >= 3) {
        const system = resolveMasterDeckSystem(masterId);
        const symbols = resolveSpreadSymbols(system, item.cards);
        if (symbols.length >= 3) {
          applyRestoredChatSpread(
            {
              cards: symbols,
              system,
              type: item.spreadType === "daily" ? "reading" : "intention_spread",
              cardsKey: spreadKey(symbols),
              intention: item.intention,
            },
            masterId
          );
        }
      } else {
        setSpreadFlipped([true, true, true]);
      }
    },
    [
      openChatWithCharacter,
      applyHistorySessionMeta,
      applyRestoredChatSpread,
      setSpreadFlipped,
    ]
  );

  const resetChatSessionState = () => {
    pendingNewChatThreadRef.current = false;
    if (selectedCharacter && messages.length) {
      saveChatCache(
        selectedCharacter,
        messages,
        sessionOnlyChat ? SESSION_ONLY_CACHE_KEY : activeSpreadCardsKey
      );
    }
    readingInFlightRef.current = false;
    setIsLoading(false);
    setIsLoadingHistory(false);
    setIntentionSpreadLoading(false);
    setReadingRitualActive(false);
    setReadingRitualCountdownDone(true);
    setSessionOnlyChat(false);
    setPhotoChatSpread(null);
    setHideChatSpread(false);
    setSessionIntention(null);
    setIntentionHighlight(false);
    setIntentionSpread(null);
    setChatSessionSpread(null);
    if (selectedCharacter) {
      persistSessionIntention(selectedCharacter, null);
    }
    setSelectedCharacter(null);
    setConsultationSessionId(null);
    setConsultationReadOnly(false);
    archiveSessionIdRef.current = null;
    chatLoadedForRef.current = null;
  };

  const handleCloseChat = () => {
    resetChatSessionState();
    const backToSessionList = sessionListBackMasterRef.current;
    sessionListBackMasterRef.current = null;
    if (backToSessionList) {
      setSessionListMaster(backToSessionList);
      setStep("masters");
      localStorage.setItem(FLOW_STEP_KEY, "masters");
      void refreshSessionsList(backToSessionList);
    } else {
      setSessionListMaster(null);
      setStep("masters");
    }
    refreshSavedReadings();
  };

  const exitToLandingForNav = useCallback(() => {
    if (selectedCharacter) {
      resetChatSessionState();
      refreshSavedReadings();
    }
    sessionListBackMasterRef.current = null;
    setSessionListMaster(null);
    setShowSessionFlow(false);
    setShowRitualFlow(false);
    setPhotoReadingOpen(false);
    setStep("masters");
    localStorage.setItem(FLOW_STEP_KEY, "masters");
  }, [
    selectedCharacter,
    messages,
    sessionOnlyChat,
    activeSpreadCardsKey,
    refreshSavedReadings,
    setStep,
    setSessionListMaster,
  ]);

  useEffect(() => {
    exitToLandingForNavRef.current = exitToLandingForNav;
  }, [exitToLandingForNav]);

  useEffect(() => {
    if (!pendingNav) return;
    if (selectedCharacter || sessionListMaster) return;
    if (step !== "masters") return;

    if (pendingNav.type === "section") {
      const el = document.getElementById(pendingNav.id);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      window.history.replaceState(null, "", `#${pendingNav.id}`);
      setPendingNav(null);
      return;
    }

    setShowDecksModal(true);
    setPendingNav(null);
  }, [pendingNav, selectedCharacter, sessionListMaster, step]);

  const handlePhotoContinueChat = async (masterId: string, payload: PhotoReadingChatPayload) => {
    if (!isLoggedIn) return;

    const merged = mergeActiveProfile(profile, readStoredProfileSpread());
    const displayName = merged?.name || authUser?.name;
    if (!displayName) return;

    if (!payload.sessionId) {
      const syncedId = await syncPhotoSessionForMaster(masterId, payload.historyId);
      if (syncedId) payload.sessionId = syncedId;
    }

    let photoSpreadSymbols: DeckCardInput[] | null = null;
    let photoSystem: DeckSystem | null = null;

    if (payload.redrawSpread && payload.redrawSpread.cards.length > 0) {
      const photoDeckCards = redrawSpreadToDeckCards(payload.redrawSpread);
      photoSpreadSymbols = photoDeckCards;
      photoSystem = payload.redrawSpread.system;
      setPhotoChatSpread({ masterId, cards: photoDeckCards, system: photoSystem });
      setChatSessionSpread(null);
      setHideChatSpread(false);
      sessionSpreadMetaRef.current = {
        spreadType: "photo",
        cardNames: payload.detectedCards,
      };
      setChatHeaderImage(null);
    }

    const photoMessages = buildPhotoReadingChatMessages(
      payload.analysis,
      payload.question ?? "",
      payload.detectedCards
    );

    // Photo spread always opens a fresh session — never post into the current chat.
    const resolvedSessionId = payload.sessionId;

    readingInFlightRef.current = true;
    skipNextReadingRef.current = true;

    try {
      if (resolvedSessionId) {
        await bindSessionToMaster(masterId, resolvedSessionId);
        setConsultationSessionId(resolvedSessionId);
        setConsultationReadOnly(false);
        archiveSessionIdRef.current = null;
      } else {
        await bindSessionToMaster(masterId);
      }

      // Always start with an empty history — each photo spread is a new conversation.
      let existing: Message[] = [];

      if (resolvedSessionId && !session?.offline) {
        try {
          const params = new URLSearchParams({ characterId: masterId });
          params.set("sessionId", resolvedSessionId);
          const res = await fetch(`/api/chat/history?${params}`);
          if (res.ok) {
            const data = await res.json();
            if (data.messages?.length) {
              const serverMessages: Message[] = data.messages.map(
                (m: { id: string; role: string; content: string; timestamp: string }) => ({
                  id: m.id,
                  role: m.role as "user" | "assistant",
                  content: m.content,
                  timestamp: new Date(m.timestamp),
                })
              );
              if (serverMessages.length >= existing.length) {
                existing = serverMessages;
              }
            }
          }
        } catch {
          /* offline ok */
        }
      }

      const chatMessages = mergePhotoReadingIntoChat(existing, photoMessages);

      const photoCacheKey = payload.redrawSpread
        ? tarotCardsKey(redrawSpreadToTarotCards(payload.redrawSpread))
        : spreadKey(payload.detectedCards.map((name) => ({ name })));

      const photoSpreadCache: CachedChatSpread | undefined =
        photoSpreadSymbols && photoSystem
          ? {
              cards: photoSpreadSymbols,
              system: photoSystem,
              variant: "photo",
            }
          : undefined;

      saveChatCache(masterId, chatMessages, photoCacheKey, photoSpreadCache);

      if (payload.sessionId && !session?.offline) {
        try {
          localStorage.setItem("aura_session_id", payload.sessionId);
        } catch {
          /* ignore */
        }
      }

      setPhotoReadingOpen(false);
      setSessionOnlyChat(false);
      setLastMasterId(masterId);
      localStorage.setItem(LAST_MASTER_KEY, masterId);
      localStorage.setItem(FLOW_STEP_KEY, "chat");
      setStep("chat");
      chatLoadedForRef.current = masterId;
      setHistoryHasMore(false);
      setMessages(chatMessages);
      setSelectedCharacter(masterId);

      void refreshSavedReadings();
    } finally {
      readingInFlightRef.current = false;
      setSpreadRitual({ active: false });
    }
  };

  const usesRuneBilling =
    isLoggedIn && !session?.hasAccess && !session?.offline && runeConfig.enabled;

  const questionsLeft =
    session?.offline || session?.hasAccess
      ? null
      : (session?.questionsRemaining ??
        Math.max(
          0,
          (session?.freeLimit ?? runeConfig.freeQuestions) - (session?.freeQuestionsUsed ?? 0)
        ));

  const selectedMaster = selectedCharacter
    ? findShowcaseMaster(selectedCharacter, masters)
    : undefined;

  const effectiveProfile = useMemo((): StoredProfile => {
    const stored = profile ?? readStoredProfile();
    if (stored && (stored.name || stored.birthDate || (stored.tarotCards?.length ?? 0) > 0)) {
      return stored;
    }
    return {
      name: authUser?.name ?? stored?.name ?? "Гость",
      gender: stored?.gender ?? "female",
      birthDate: stored?.birthDate ?? "",
      zodiac: stored?.zodiac ?? "",
      tarotCards: stored?.tarotCards ?? [],
      deckSystem: stored?.deckSystem,
      deckSpreads: stored?.deckSpreads,
      teaser: stored?.teaser,
      userId: stored?.userId,
    };
  }, [profile, authUser?.name]);

  const showLanding = step === "intro";
  const inPersonalFlow = isLoggedIn && step !== "intro";
  const bootstrapping = sessionLoading || authLoading;
  /** Marketing landing — guests only; logged-in users get masters + energy of the day. */
  const showSeoLanding = !isLoggedIn && (showLanding || bootstrapping);
  const landingMasters = masters.length > 0 ? masters : getAiMasters();

  useEffect(() => {
    if (bootstrapping) return;
    if (!consumeOpenDecksModalFlag()) return;
    if (selectedCharacter || sessionListMaster) {
      setPendingNav({ type: "decks" });
      return;
    }
    if (step === "masters") {
      setShowDecksModal(true);
    } else {
      setPendingNav({ type: "decks" });
    }
  }, [bootstrapping, selectedCharacter, sessionListMaster, step]);

  const handleStartReadingFromHeader = useCallback(() => {
    exitToLandingForNav();
    void startPersonalFlow();
  }, [exitToLandingForNav, startPersonalFlow]);

  const landingInsufficientRunes = (payload: { balance: number; required: number }) => {
    setInsufficientRunes(payload);
    handleOpenPaywall({
      balance: payload.balance,
      requiredRunes: payload.required,
      shortage: payload.required - payload.balance,
    });
  };

  const seoLanding = (
    <AuraSellingLanding
      isLoggedIn={isLoggedIn}
      masters={landingMasters}
      onStartReading={() => void startPersonalFlow()}
      onSelectMaster={(id) => void handleMasterPick(id)}
      onBrowseDeck={handleBrowseDeck}
      recommendedId={recommendedId}
      continueMasterIds={continueMasterIds}
      spreadReadingDone={spreadReadingDone}
      showHero
      showMasters
      showTariffs
      onOpenPaywall={() => handleOpenPaywall()}
      runeBalance={runeBalance}
      isUnlimited={Boolean(session?.isUnlimited)}
      onInsufficientRunes={landingInsufficientRunes}
    />
  );

  useEffect(() => {
    const dismissOverlays = () => setSpreadRitual({ active: false });
    window.addEventListener(NAVIGATE_CABINET_EVENT, dismissOverlays);
    return () => window.removeEventListener(NAVIGATE_CABINET_EVENT, dismissOverlays);
  }, [setSpreadRitual]);

  useEffect(() => {
    if (!spreadRitual.active) return;
    const timer = window.setTimeout(() => setSpreadRitual({ active: false }), 60_000);
    return () => window.clearTimeout(timer);
  }, [spreadRitual.active, setSpreadRitual]);

  const [headerMounted, setHeaderMounted] = useState(false);
  useEffect(() => {
    setHeaderMounted(true);
  }, []);

  const topHeader = (
    <AppTopHeader
      photoNavLabel={photoNavLabel}
      isLoggedIn={isLoggedIn}
      authUser={authUser}
      authLoading={authLoading}
      onOpenPaywall={() => handleOpenPaywall()}
      onNavMasters={() => scrollToSection(APP_SHELL_SECTIONS.masters)}
      onNavTariffs={() => scrollToSection(APP_SHELL_SECTIONS.tariffs)}
      onNavPhoto={openPhotoReading}
      onNavDecks={openDecksModal}
      onStartReading={handleStartReadingFromHeader}
    />
  );

  const inActiveChat = Boolean(selectedCharacter);

  return (
    <div
      className={`relative overflow-hidden pt-[var(--app-header-h,3.25rem)] ${
        inActiveChat ? "h-[100dvh]" : "min-h-screen"
      }`}
    >
      {headerMounted ? createPortal(topHeader, document.body) : null}

      <main
        className={
          inActiveChat
            ? "relative z-10 mx-auto flex h-[calc(100dvh-var(--app-header-h,3.25rem))] max-w-none flex-col overflow-hidden px-0 py-0"
            : "relative z-10 mx-auto max-w-7xl px-6 py-8 md:py-12"
        }
      >
        {paymentNotice && (
          <div
            role="alert"
            className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
          >
            <p>{paymentNotice}</p>
            <button
              type="button"
              onClick={() => setPaymentNotice(null)}
              className="shrink-0 text-amber-300 underline"
            >
              Закрыть
            </button>
          </div>
        )}
        {showSeoLanding ? seoLanding : null}

        {bootstrapping ? (
          <div
            className="bootstrap-overlay pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-black/75 backdrop-blur-md pt-[var(--app-header-h,3.25rem)]"
            aria-busy="true"
            aria-live="polite"
          >
            <AppBootstrapScreen embedded />
          </div>
        ) : null}

        {!bootstrapping && !showLanding && !(inPersonalFlow && step === "masters") ? (
          <h1 className="sr-only">
            Zovus — персональные эзотерические консультации, расклады на таро и рунах
          </h1>
        ) : null}

        {!bootstrapping && sessionListMaster ? (
          <>
            <SessionList
              masterId={sessionListMaster}
              masters={masters}
              active={sessionsListData.active}
              completed={sessionsListData.completed}
              loading={sessionsListLoading}
              actionSessionId={sessionListActionId}
              onBack={handleSessionListBack}
              onNewSession={() => setShowSessionFlow(true)}
              onStartDaily={
                displayTarotCards.length >= 3 &&
                sessionListMaster === tripletOwnerMasterId
                  ? () => {
                      const masterId = sessionListMaster;
                      sessionListBackMasterRef.current = masterId;
                      void openChatWithSessionParams({
                        characterKey: masterId,
                        intention: null,
                        spreadType: "daily",
                        cards: displayTarotCards.map((c) => c.name),
                      });
                    }
                  : undefined
              }
              onStartRitual={() => {
                setRitualFlowMaster(sessionListMaster);
                setOpenRitualId(null);
                setShowRitualFlow(true);
              }}
              onOpenRitual={(id) => {
                setRitualFlowMaster(sessionListMaster);
                setOpenRitualId(id);
                setShowRitualFlow(true);
              }}
              onRitualDeleted={(id) => {
                if (openRitualId === id) {
                  setShowRitualFlow(false);
                  setOpenRitualId(null);
                }
              }}
              onContinueActive={(item) => void handleContinueListedSession(sessionListMaster, item)}
              onOpenArchive={(item) => void handleOpenArchiveSession(sessionListMaster, item)}
              onArchiveSession={(item) =>
                void handleArchiveListedSession(sessionListMaster, item)
              }
              onDeleteSession={(item) =>
                void handleDeleteListedSession(sessionListMaster, item)
              }
            />
            <MasterSessionFlow
              isOpen={showSessionFlow}
              onClose={() => setShowSessionFlow(false)}
              preselectedMaster={sessionListMaster}
              dailyCards={
                sessionListMaster === tripletOwnerMasterId
                  ? displayTarotCards.map((c) => c.name)
                  : []
              }
              masters={masters}
              onStartRitual={() => {
                setRitualFlowMaster(sessionListMaster);
                setOpenRitualId(null);
                setShowSessionFlow(false);
                setShowRitualFlow(true);
              }}
              onStart={(params) => {
                setShowSessionFlow(false);
                sessionListBackMasterRef.current = sessionListMaster;
                setSessionListMaster(null);
                void openChatWithSessionParams(params);
              }}
            />
            {(RITUAL_MASTERS as readonly string[]).includes(sessionListMaster) ? (
              <RitualFlow
                isOpen={showRitualFlow}
                characterKey={ritualFlowMaster as "ragnar" | "agafya"}
                userName={effectiveProfile.name || authUser?.name || "друг"}
                userZodiac={effectiveProfile.zodiac || ""}
                balance={runeBalance}
                isUnlimited={Boolean(session?.isUnlimited)}
                initialRitualId={openRitualId}
                onClose={() => {
                  setShowRitualFlow(false);
                  setOpenRitualId(null);
                }}
                onBalanceChange={(b) => {
                  setRuneBalance(b);
                  emitRuneBalanceUpdate(b);
                }}
              />
            ) : null}
          </>
        ) : selectedCharacter && !isLoggedIn ? (
          <RegisterGate
            compact
            title="Войдите для продолжения сеанса"
            description="Аккаунт нужен, чтобы сохранить переписку с мастером и историю раскладов."
          />
        ) : selectedCharacter ? (
          <ChatWindow
            characterId={selectedCharacter}
            master={
              selectedMaster
                ? { name: selectedMaster.name, title: selectedMaster.title, emoji: selectedMaster.emoji }
                : undefined
            }
            messages={chatMessagesForDisplay}
            isLoading={isLoading}
            isLoadingHistory={isLoadingHistory}
            questionsLeft={questionsLeft}
            sessionQuestionsUsed={session?.freeQuestionsUsed ?? 0}
            hasFullAccess={session?.hasAccess ?? false}
            usesRuneBilling={usesRuneBilling}
            questionCost={runeCost("QUESTION")}
            insufficientRunes={insufficientRunes}
            onOpenPaywall={() => handleOpenPaywall()}
            runeBalance={runeBalance}
            visionCost={runeCost("VISION_ANALYSIS")}
            headerSceneUrl={sessionOnlyChat ? null : chatHeaderImage}
            spreadCards={chatDisplaySpread?.cards}
            spreadDeckSystem={chatDisplaySpread?.system ?? profile?.deckSystem ?? DEFAULT_DECK_SYSTEM}
            spreadLoading={
              intentionSpreadLoading && !(chatDisplaySpread?.cards?.length ?? 0)
            }
            spreadReadingLoading={spreadReadingPending}
            onSpreadReadingRitualComplete={handleSpreadReadingRitualComplete}
            spreadVariant={
              chatDisplaySpread?.source === "photo"
                ? "photo"
                : chatDisplaySpread?.source === "intention"
                  ? "intention"
                  : "triplet"
            }
            spreadInteractiveFlip={
              needsSpreadFlip &&
              !chatHasSpreadReading(messages) &&
              !allSpreadFlipped
            }
            spreadFlipped={spreadFlipped}
            onSpreadFlip={(index) => {
              setSpreadFlipped((prev) => {
                const next = [...prev];
                next[index] = true;
                return next;
              });
            }}
            allSpreadFlipped={allSpreadFlipped}
            sessionIntention={sessionIntention ?? intentionSpread?.intention ?? null}
            intentionHighlight={intentionHighlight}
            onSendMessage={handleSendMessage}
            onClose={handleCloseChat}
            closeAriaLabel={
              sessionListBackMasterRef.current ? "Назад к списку сеансов" : "Назад к списку мастеров"
            }
            sessionOffline={Boolean(session?.offline)}
            storageBlocked={Boolean(session?.storageBlocked)}
            onReconnectSession={reconnecting ? undefined : () => void handleReconnectSession()}
            retryDraft={retryDraft}
            onRetry={() => {
              if (retryDraft) {
                void handleSendMessage(retryDraft.content, retryDraft.imageBase64);
              }
            }}
            hasMoreHistory={historyHasMore}
            loadingMoreHistory={loadingMoreHistory}
            onLoadMore={() => void handleLoadMoreHistory()}
            onClearChat={() => void handleClearChat()}
            readOnly={consultationReadOnly}
            onCompleteSession={
              !consultationReadOnly ? () => void handleCompleteSession() : undefined
            }
            completingSession={completingSession}
            userBirthDate={
              selectedCharacter === "numerolog"
                ? getActiveProfile()?.birthDate || profile?.birthDate
                : undefined
            }
          />
        ) : inPersonalFlow ? (
          <div className={step === "masters" ? "mx-auto max-w-7xl" : "mx-auto max-w-4xl"}>

            {step === "onboarding" && (
              <section className="mb-12">
                <OnboardingForm
                  initialName={authUser?.name ?? profile?.name}
                  onComplete={handleOnboardingComplete}
                />
              </section>
            )}

            {step === "triplet" && (
              <section className="flow-panel mb-12">
                <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={handleTripletBack}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-black/25 px-4 py-2 text-sm text-gray-300 transition-colors hover:border-aura-gold/25 hover:text-white"
                  >
                    <ArrowLeft className="h-4 w-4" aria-hidden />
                    На главную
                  </button>
                  {masters.length > 0 &&
                  tripletMasterId &&
                  (!tripletCooldown || tripletCooldown.allowed) ? (
                    <MasterSelect
                      masters={masters}
                      value={tripletMasterId}
                      onChange={handleTripletMasterChange}
                      disabled={!canChangeTripletMaster}
                      className="ml-auto"
                    />
                  ) : null}
                </div>
                {tripletNotice ? (
                  <div className="mb-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-5 py-4 text-sm text-amber-100 backdrop-blur-md">
                    {tripletNotice}
                  </div>
                ) : null}
                {tripletCooldown && !tripletCooldown.allowed ? (
                  <div className="glass-panel mx-auto max-w-xl p-8 text-center">
                    <p className="mb-2 font-display text-lg font-semibold text-white">
                      Новый расклад из 3 карт
                    </p>
                    <p className="mb-6 text-sm text-gray-400">
                      Доступен один раз в сутки. {tripletCooldownHint ?? "Попробуйте позже."}
                    </p>
                    <button
                      type="button"
                      onClick={handleTripletBack}
                      className="btn-neon px-6 py-2.5 text-sm"
                    >
                      К мастерам и текущему раскладу
                    </button>
                  </div>
                ) : (
                  <>
                    {!canChangeTripletMaster ? (
                      <p className="mb-4 text-center text-[11px] text-gray-500">
                        Расклад уже выпал — сменить мастера можно после нового расклада
                      </p>
                    ) : null}
                    <TarotTriplet
                      key={
                        newTripletDraft
                          ? `new-triplet-${tripletMasterId}-${tripletSystem}`
                          : `triplet-${tripletMasterId}-${tripletSystem}`
                      }
                      userName={effectiveProfile.name}
                      zodiac={effectiveProfile.zodiac}
                      system={tripletSystem}
                      masterName={tripletMasterName}
                      initialCards={
                        newTripletDraft
                          ? undefined
                          : getSpreadForSystem(effectiveProfile, tripletSystem).length >= 3
                            ? getSpreadForSystem(effectiveProfile, tripletSystem)
                            : undefined
                      }
                      onComplete={handleTripletComplete}
                      onAllRevealed={handleTripletDraft}
                    />
                    {newTripletDraft && displayTarotCards.length >= 3 ? (
                      <div className="mt-6 text-center">
                        <button
                          type="button"
                          onClick={handleTripletBack}
                          className="btn-luxe btn-luxe--sm btn-luxe--silver"
                        >
                          Отмена — оставить текущий расклад
                        </button>
                      </div>
                    ) : null}
                  </>
                )}
              </section>
            )}

            {step === "intention" && pendingMasterId && (
              <section id="session-intention" className="mb-12 scroll-mt-24">
                <FlowStepper current="intention" />
                <IntentionPicker
                  masterName={
                    findShowcaseMaster(pendingMasterId, masters)?.name ??
                    getCharacterById(pendingMasterId)?.name
                  }
                  spreadCost={runeCost("INTENTION_SPREAD")}
                  runeBalance={runeBalance}
                  runeBillingEnabled={usesRuneBilling}
                  loading={intentionSpreadLoading}
                  onSelect={(intention, mode) =>
                    void beginChatAfterIntention(pendingMasterId, intention, mode)
                  }
                  onSkip={() => void beginChatAfterIntention(pendingMasterId, null)}
                />
              </section>
            )}

            {step === "intention" && !pendingMasterId && (
              <section className="mb-12 text-center">
                <p className="text-sm text-gray-400">Сессия прервана — выберите мастера снова.</p>
                <button
                  type="button"
                  onClick={() => setStep("masters")}
                  className="btn-primary mt-4 px-8 py-2.5 text-sm"
                >
                  К мастерам
                </button>
              </section>
            )}

            {step === "masters" && (
              <>
                {isLoggedIn && (
                  <>
                    <PremiumEnergyBlock
                      characterKey={dailyEnergyMasterId}
                      masters={masters}
                      onTalkToMaster={(masterId) => {
                        setEnergyFlowMasterId(masterId);
                        setShowSessionFlow(true);
                      }}
                      onOpenNumerologForm={() => {
                        setEnergyFlowMasterId("numerolog");
                        setShowSessionFlow(true);
                      }}
                    />
                    <MasterSessionFlow
                      isOpen={showSessionFlow}
                      onClose={() => {
                        setShowSessionFlow(false);
                        setEnergyFlowMasterId(null);
                      }}
                      preselectedMaster={energyFlowMasterId ?? dailyEnergyMasterId}
                      dailyCards={
                        displayTarotCards.length >= 3
                          ? displayTarotCards.map((c) => c.name)
                          : []
                      }
                      masters={masters}
                      onStartRitual={() => {
                        const ritualMaster = energyFlowMasterId ?? dailyEnergyMasterId;
                        if (
                          ritualMaster &&
                          (RITUAL_MASTERS as readonly string[]).includes(ritualMaster)
                        ) {
                          setRitualFlowMaster(ritualMaster);
                          setOpenRitualId(null);
                          setShowSessionFlow(false);
                          setShowRitualFlow(true);
                        }
                      }}
                      onStart={(params) => {
                        setShowSessionFlow(false);
                        setEnergyFlowMasterId(null);
                        void openChatWithSessionParams(params);
                      }}
                    />
                    {(RITUAL_MASTERS as readonly string[]).includes(dailyEnergyMasterId) ? (
                      <RitualFlow
                        isOpen={showRitualFlow}
                        characterKey={ritualFlowMaster as "ragnar" | "agafya"}
                        userName={effectiveProfile.name || authUser?.name || "друг"}
                        userZodiac={effectiveProfile.zodiac || ""}
                        balance={runeBalance}
                        isUnlimited={Boolean(session?.isUnlimited)}
                        initialRitualId={openRitualId}
                        onClose={() => {
                          setShowRitualFlow(false);
                          setOpenRitualId(null);
                        }}
                        onBalanceChange={(b) => {
                          setRuneBalance(b);
                          emitRuneBalanceUpdate(b);
                        }}
                      />
                    ) : null}
                  </>
                )}
                {showWelcomeBack && recapContinueMasterId ? (
                  <WelcomeBackBanner
                    userName={effectiveProfile.name}
                    masterId={recapContinueMasterId}
                    masters={masters}
                    onContinue={(masterId) => {
                      setShowWelcomeBack(false);
                      void handleMasterPick(masterId, { continueSession: true });
                    }}
                  />
                ) : null}
                {tripletNotice ? (
                  <div className="mb-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-5 py-4 text-sm text-amber-100 backdrop-blur-md">
                    {tripletNotice}
                  </div>
                ) : null}
                {deckGalleryOpen && (profile || browseDeckMaster) && (
                  <DeckGallery
                    system={
                      browseDeckMaster
                        ? (browseDeckMaster.system ?? resolveMasterDeckSystem(browseDeckMaster.id))
                        : displayDeckSystem
                    }
                    masterName={
                      browseDeckMaster?.name ??
                      findShowcaseMaster(recapContinueMasterId ?? recommendedId ?? "", masters)?.name ??
                      getCharacterById(recommendedId ?? "")?.name ??
                      "мастера"
                    }
                    masterId={
                      browseDeckMaster?.id ??
                      recapContinueMasterId ??
                      recommendedId ??
                      undefined
                    }
                    onBack={() => {
                      setDeckGalleryOpen(false);
                      if (browseDeckMaster) {
                        setBrowseDeckMaster(null);
                        setShowDecksModal(true);
                      } else {
                        document.getElementById("мой-расклад")?.scrollIntoView({ behavior: "smooth" });
                      }
                    }}
                    backLabel={browseDeckMaster ? "К колодам мастеров" : "К моему раскладу"}
                  />
                )}

                <AuraSellingLanding
                  isLoggedIn={isLoggedIn}
                  masters={masters}
                  onStartReading={() => void startPersonalFlow()}
                  onSelectMaster={(id) => void handleMasterPick(id)}
                  onBrowseDeck={handleBrowseDeck}
                  recommendedId={recommendedId}
                  continueMasterIds={continueMasterIds}
                  spreadReadingDone={spreadReadingDone}
                  showHero={false}
                  showTariffs
                  onOpenPaywall={() => handleOpenPaywall()}
                  runeBalance={runeBalance}
                  isUnlimited={Boolean(session?.isUnlimited)}
                  onInsufficientRunes={landingInsufficientRunes}
                />
              </>
            )}
          </div>
        ) : !bootstrapping && showLanding && deckGalleryOpen && browseDeckMaster ? (
          <DeckGallery
            system={
              browseDeckMaster.system ?? resolveMasterDeckSystem(browseDeckMaster.id)
            }
            masterName={browseDeckMaster.name}
            masterId={browseDeckMaster.id}
            onBack={() => {
              setDeckGalleryOpen(false);
              setBrowseDeckMaster(null);
              setShowDecksModal(true);
            }}
            backLabel="К колодам мастеров"
          />
        ) : null}
      </main>

      <PhotoReadingFlow
        open={photoReadingOpen}
        onClose={closePhotoReading}
        masters={masters}
        isLoggedIn={isLoggedIn}
        defaultMasterId={lastMasterId ?? recommendedId ?? "veronika"}
        sessionId={undefined}
        userName={profile?.name ?? authUser?.name}
        onSpreadRitualStart={(spread) => {
          setSpreadRitual({
            active: true,
            cards: redrawSpreadToDeckCards(spread),
            system: spread.system,
          });
        }}
        onSpreadRitualEnd={() => setSpreadRitual({ active: false })}
        onRuneBalanceChange={(balance) => {
          setRuneBalance(balance);
          emitRuneBalanceUpdate(balance);
        }}
        onContinueChat={handlePhotoContinueChat}
        onSaved={() => void refreshSavedReadings()}
        onInsufficientRunes={(payload) => {
          setInsufficientRunes(payload);
          handleOpenPaywall({
            balance: payload.balance,
            requiredRunes: payload.required,
            shortage: payload.required - payload.balance,
          });
        }}
        runeBalance={runeBalance}
        isUnlimited={Boolean(session?.isUnlimited)}
        onOpenPaywall={() => handleOpenPaywall()}
      />

      <MasterDecksModal
        isOpen={showDecksModal}
        onClose={() => setShowDecksModal(false)}
        masters={masters}
        onBrowseDeck={handleBrowseDeck}
      />

      <DailyBonusClaimer
        enabled={isLoggedIn && Boolean(authUser?.profileUserId) && runeConfig.enabled}
      />

      <SpreadRitualLoader
        active={spreadRitual.active}
        cards={spreadRitual.cards}
        system={spreadRitual.system}
      />

      {achievementPopup && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          role="button"
          tabIndex={0}
          aria-label="Закрыть уведомление"
          onClick={() => setAchievementPopup(null)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setAchievementPopup(null);
            }
          }}
        >
          <div
            className="mx-4 max-w-xs rounded-3xl border border-amber-500/40 bg-gradient-to-b from-amber-900/40 to-black/80 p-8 text-center animate-in zoom-in-95 duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 text-6xl">ᚢ</div>
            <p className="mb-1 text-xl font-bold text-amber-400">{achievementPopup.label}</p>
            <p className="mb-4 text-sm text-white/60">{achievementPopup.description}</p>
            <p className="mb-4 text-sm italic text-amber-300">«{achievementPopup.phrase}»</p>
            <p className="font-semibold text-white">+{achievementPopup.bonus} ᚢ рун</p>
          </div>
        </div>
      )}

      {runeReceiptPopup && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 animate-in slide-in-from-bottom-4 duration-300">
          <div className="mx-4 min-w-[280px] rounded-2xl border border-emerald-500/40 bg-gradient-to-b from-emerald-900/50 to-black/90 px-6 py-4 text-center shadow-xl">
            <p className="text-lg font-bold text-emerald-400">+{runeReceiptPopup.total} ᚢ</p>
            <p className="mt-1 text-sm text-white/70">{runeReceiptPopup.description}</p>
            <p className="mt-1 text-xs text-white/40">Зачислено на баланс</p>
          </div>
        </div>
      )}
    </div>
  );
}
