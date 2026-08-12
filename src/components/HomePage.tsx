"use client";

import {
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useRef,
  useMemo,
  type SetStateAction,
} from "react";
import { flushSync } from "react-dom";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";

import OnboardingForm from "@/components/OnboardingForm";
import TarotTriplet from "@/components/TarotTriplet";
import MasterSelect from "@/components/MasterSelect";
import ChatWindow from "@/components/ChatWindow";
import SessionList, { type SessionListItem } from "@/components/SessionList";
import { NAVIGATE_CABINET_EVENT } from "@/components/AuthHeader";
import CabinetNatalChart from "@/components/cabinet/CabinetNatalChart";
import { emitRuneBalanceUpdate } from "@/components/RuneBalance";
import DailyBonusClaimer from "@/components/DailyBonusClaimer";
import ReportAcceptedScreen from "@/components/reports/ReportAcceptedScreen";
import PersonalMemoryChoice from "@/components/PersonalMemoryChoice";
import { usePaywall } from "@/contexts/PaywallContext";
import { parseInsufficientRunes } from "@/lib/api-errors";
import { consumeAccountDeletedHomeArrival } from "@/lib/account-deleted";
import IntentionPicker from "@/components/IntentionPicker";
import PremiumEnergyBlock from "@/components/PremiumEnergyBlock";
import MasterSessionFlow from "@/components/MasterSessionFlow";
import { DEFAULT_SPREAD_ID, hasCompleteSpread, isDailyOnlySpread, normalizeSpreadId, spreadFlippedState, type SpreadId } from "@/lib/spreads";
import { getSpreadIntentBySlug } from "@/lib/spread-intents";
import { resolveIntentMasterId } from "@/lib/spread-intents/resolve-master";
import { matchSpreadIntentFromQuestion } from "@/lib/spread-intents/match-question";
import { setJointReadingToken, setJointReadingRole, getJointReadingIntentSlug, setJointReadingIntentSlug } from "@/lib/joint-reading-storage";
import { resolveIntentCopy } from "@/lib/spread-intents/gender-copy";
import {
  resolveRitualMasterKey,
  resolveRitualMasterForType,
  isRitualType,
  type RitualType,
} from "@/lib/ritual-config";
import FlowStepper from "@/components/FlowStepper";
import ZovusEditorialLanding from "@/components/editorial/ZovusEditorialLanding";
import LoggedInHomeBanner from "@/components/editorial/LoggedInHomeBanner";
import ReadingRecap from "@/components/ReadingRecap";
import DeckGallery from "@/components/DeckGallery";
import type {
  PhotoReadingChatPayload,
  PhotoReadingConfirmPayload,
  PhotoReadingEntryMode,
} from "@/components/PhotoReadingFlow";
import {
  buildPhotoReadingChatMessages,
  buildPhotoReadingPendingMessages,
  mergePhotoReadingIntoChat,
} from "@/lib/photo-chat";
import { pickUserFacingError } from "@/lib/user-facing-error";
import { trackPhotoReadingPhase } from "@/lib/photo-reading-analytics";

const RitualFlow = dynamic(() => import("@/components/ritual/RitualFlow"), { ssr: false });
const MasterDecksModal = dynamic(() => import("@/components/MasterDecksModal"), { ssr: false });
const PhotoReadingFlow = dynamic(() => import("@/components/PhotoReadingFlow"), { ssr: false });
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
  APP_SHELL_HOME_EVENT,
  consumeOpenDecksModalFlag,
  consumeOpenRitualFlowFlag,
  consumeOpenRitualTypeFlag,
  navigateToDecksModal,
  navigateToPhotoReading as navigateToPhotoReadingHard,
  persistOpenRitualIntent,
} from "@/lib/app-shell-nav";
import { registerAppShellHomeNavHandlers } from "@/lib/app-shell-nav-bus";
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
import { ensureMinSpreadRitualDisplay } from "@/lib/spread-reading-ritual";
import { resetWindowScrollSoon } from "@/lib/reset-window-scroll";
import { generateId } from "@/lib/id";
import {
  loadChatCache,
  loadChatCacheAny,
  clearChatCache,
  saveChatCache,
  chatHasSpreadReading,
  appendSpreadReadingMessage,
  SESSION_ONLY_CACHE_KEY,
  MIN_SPREAD_READING_CHARS,
  type CachedChatSpread,
} from "@/lib/chat-cache";
import { resolveClientReadingText } from "@/lib/chat-reply-sanitize";
import { stripAllSpreadCardImages } from "@/lib/reading-text-polish";
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
  PENDING_MASTER_KEY,
  hasPendingServerProfile,
  isStoredChatResumeFresh,
  persistStep,
  readStoredProfile,
} from "@/lib/home-flow-storage";
import { resetGuestSpreadFlow } from "@/lib/guest-spread-reset";
import {
  hasActiveGuestResumeIntent,
  isGuestResumeBannerPhase,
  loadGuestResumeUiCache,
} from "@/lib/guest-resume-ui-cache";
import {
  claimTgReceiptClient,
  stashTgReceipt,
  takeStashedTgReceipt,
} from "@/lib/telegram/tg-receipt-client";
import { resolveDailyCardsUiState } from "@/lib/daily-cards-ui";
import {
  GUEST_RESUME_ALREADY_USED_CABINET_CTA,
  GUEST_RESUME_ALREADY_USED_DAILY_CTA,
  GUEST_RESUME_ALREADY_USED_NEW_CTA,
  GUEST_RESUME_TRANSITION_SUBTITLE,
} from "@/lib/guest-triplet-resume";
import {
  consumePendingGuestQuestion,
  persistPendingIntent,
  buildRegisterHref,
  resolveRegistrationReturnTo,
} from "@/lib/post-auth-return";
import {
  GUEST_SPREAD_PICKER_ID,
  GUEST_SPREAD_START_EVENT,
  GUEST_TRIPLET_MASTER_ID,
  LANDING_QUESTION_KEY,
  type GuestSpreadStartDetail,
} from "@/lib/landing-offer";
import { GUEST_TRIPLET_SUGGESTED_REPLIES } from "@/lib/guest-chat-suggestions";
import {
  trackFirstChatOpened,
  trackGuestChatContinue,
  trackGuestTripletRedrawPrevented,
} from "@/lib/seo/metrika";
import {
  decodeNumerologSpreadId,
  isNumerologSessionToolId,
  type NumerologToolId,
} from "@/lib/numerology/tools";
import type { StoredProfile } from "@/types/stored-profile";

export type { StoredProfile };

export interface HomePageProps {
  referrerSlug?: string;
  /** From /master/[slug] — open that master's session flow on load. */
  autoOpenMasterId?: string;
  /** From /master/[slug]?ritual=... (deep link from /obryady SEO pages). */
  autoOpenRitualType?: RitualType;
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

export default function HomePage({
  referrerSlug,
  autoOpenMasterId,
  autoOpenRitualType,
}: HomePageProps) {
  const { config: runeConfig, cost: runeCost, formatRunes } = useRuneConfig();
  const { isLoggedIn, loading: authLoading, user: authUser, refresh: refreshAuth } = useAuth();
  const { openPaywall, showRateLimit } = usePaywall();

  useEffect(() => {
    consumeAccountDeletedHomeArrival();
  }, []);

  const [selectedCharacter, setSelectedCharacterState] = useState<string | null>(null);
  const selectedCharacterRef = useRef<string | null>(null);
  const stepRef = useRef<string>("intro");
  // Do NOT reject sets while stepRef is still "masters": openChat calls setStep("chat")
  // then setSelectedCharacter in the same tick, but stepRef only updates after paint.
  // Rejecting here blocked history/matrix reopen.
  // Flash prevention: ChatWindow requires step==="chat"; stale character cleared below.
  const setSelectedCharacter = useCallback(
    (next: SetStateAction<string | null>) => {
      const resolved =
        typeof next === "function"
          ? (next as (prev: string | null) => string | null)(selectedCharacterRef.current)
          : next;
      selectedCharacterRef.current = resolved;
      setSelectedCharacterState(resolved);
    },
    []
  );
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
  const [deepLinkSpreadId, setDeepLinkSpreadId] = useState<string | null>(null);
  const [seoFlowOpen, setSeoFlowOpen] = useState(false);
  const [seoFlowIntentSlug, setSeoFlowIntentSlug] = useState<string | null>(null);
  const [sessionFlowInitialQuestion, setSessionFlowInitialQuestion] = useState<string | null>(null);
  const [sessionFlowRequiresPartnerInfo, setSessionFlowRequiresPartnerInfo] = useState(false);
  const [sessionFlowInitialNumerologTool, setSessionFlowInitialNumerologTool] =
    useState<NumerologToolId | null>(null);
  const [sessionFlowInitialMatrixSubjectId, setSessionFlowInitialMatrixSubjectId] =
    useState<string | null>(null);
  const [sessionFlowInitialPartnerInfo, setSessionFlowInitialPartnerInfo] = useState<{
    partnerName?: string;
    partnerDate?: string;
  } | null>(null);
  const [dailyEnergySpreadId, setDailyEnergySpreadId] = useState<SpreadId>(DEFAULT_SPREAD_ID);
  const [dailyEnergyAutoOpen, setDailyEnergyAutoOpen] = useState(false);
  const autoAskParsedRef = useRef(false);
  const deepLinkSpreadParsedRef = useRef(false);
  const chatSessionDeepLinkParsedRef = useRef(false);
  const numerologDeepLinkParsedRef = useRef(false);
  const masterAutoOpenParsedRef = useRef(false);
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
  const chatClearRef = useRef<() => void>(() => {});
  const accountSwitchCleanupRef = useRef<() => void>(() => {});
  const pendingReadingMasterRef = useRef<string | null>(null);
  const destinyBackfillRef = useRef<string | null>(null);
  const destinyGenRef = useRef<Set<string>>(new Set());

  const {
    step,
    setStepState,
    setStep: setStepRaw,
    flowBootstrapped,
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
    onRestoreChatMaster: (masterId) => {
      setSelectedCharacter(masterId);
      setLastMasterId(masterId);
    },
    onPaymentChatReady: (masterId) => setSelectedCharacter(masterId),
    onAccountSwitch: () => {
      clearChatCache();
      localStorage.removeItem("aura_session_id");
      setSelectedCharacter(null);
      resetSpreadOnAccountSwitchRef.current();
      accountSwitchCleanupRef.current();
    },
  });

  // Keep stepRef in sync immediately — effects lag one paint behind setStep("chat").
  const setStep = useCallback(
    (next: typeof step) => {
      stepRef.current = next;
      setStepRaw(next);
    },
    [setStepRaw]
  );

  const [deckGalleryOpen, setDeckGalleryOpen] = useState(false);
  const [browseDeckMaster, setBrowseDeckMaster] = useState<ShowcaseMaster | null>(null);
  const [showDecksModal, setShowDecksModal] = useState(false);
  const [insufficientRunes, setInsufficientRunes] = useState<{
    balance: number;
    required: number;
  } | null>(null);
  const [runeBalance, setRuneBalance] = useState(0);
  const [archivingSession, setArchivingSession] = useState(false);
  const [startingNewSession, setStartingNewSession] = useState(false);

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
  const [photoReadingDefaultMaster, setPhotoReadingDefaultMaster] = useState<string | undefined>();
  const [photoReadingInitialMode, setPhotoReadingInitialMode] =
    useState<PhotoReadingEntryMode>("upload");
  const [showRitualFlow, setShowRitualFlow] = useState(false);
  const [ritualFlowMaster, setRitualFlowMaster] = useState<string | null>("ragnar");
  const [pendingRitualType, setPendingRitualType] = useState<RitualType | null>(null);
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
    refreshAuth,
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
    guestResumeCanRetry,
    guestIntroAlreadyUsed,
    setGuestIntroAlreadyUsed,
    retryGuestTripletResume,
    tripletCooldown,
    tripletCooldownReady,
    currentDailyReading,
    openCurrentDailyCards,
    effectiveTripletCooldown,
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
    sessionFlowInitialTopic,
    setSessionFlowInitialTopic,
    sessionFlowPreselectedMaster,
    setSessionFlowPreselectedMaster,
    savedReadings,
    serverContinueIds,
    pendingChatOptsRef,
    sessionListBackMasterRef,
    sessionSpreadMetaRef,
    matrixSessionBirthDate,
    setMatrixSessionBirthDate,
    matrixSessionSubjectName,
    setMatrixSessionSubjectName,
    displayTarotCards,
    displayDeckSystem,
    displayTeaser,
    tripletOwnerMasterId,
    continueMasterIds,
    hasActiveSpread,
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
    handleNewReading,
    handleClearTripletFromMain,
    startPersonalFlow,
    handleTripletMasterChange,
    handleTripletDraft,
    beginChatAfterIntention,
    openChatWithSessionParams,
    bindSessionToMaster,
    beginNewSpreadSession,
    handleSelectCharacter,
    handleMasterPick,
    handleContinueListedSession,
    handleSessionListBack,
    handleSpreadReadingRitualComplete,
  } = onboarding;

  // Transition banner only while resume is actively claiming/loading — never
  // leave "готовит трактовку" sticky on a normal homepage without that phase.
  const visibleTripletNotice = useMemo(() => {
    if (!tripletNotice) return null;
    const isTransition =
      tripletNotice.includes(GUEST_RESUME_TRANSITION_SUBTITLE);
    if (!isTransition) return tripletNotice;
    // Transition copy only while claim/reading is actively in flight — never
    // keep "готовит трактовку" sticky after recoverable_error / idle.
    const phase = loadGuestResumeUiCache()?.phase;
    return isGuestResumeBannerPhase(phase) ? tripletNotice : null;
  }, [tripletNotice]);

  const openSpreadIntentFlow = useCallback(
    (
      intent: NonNullable<ReturnType<typeof getSpreadIntentBySlug>>,
      options?: { customQuestion?: string | null; spreadIdOverride?: SpreadId }
    ) => {
      // Joint-reading invites let the initiator pick a card depth (3/7/12) that
      // differs from the intent's default spreadId in the registry — honor that
      // override so the flow draws the layout actually stored on the invite,
      // instead of silently falling back to love-7 and desyncing from the
      // server-side spreadId enforced in /api/intention-spread.
      const resolvedSpreadId = options?.spreadIdOverride ?? intent.spreadId;
      if (isDailyOnlySpread(resolvedSpreadId)) {
        setDailyEnergySpreadId(resolvedSpreadId);
        setDailyEnergyAutoOpen(true);
        return;
      }
      const gender = readStoredProfile()?.gender;
      const copy = resolveIntentCopy(
        intent,
        gender === "male" || gender === "female" ? gender : null
      );
      const userQuestion = options?.customQuestion?.trim() ?? "";
      const question = userQuestion || copy.questionTemplate;
      // Joint invites already carry the partner name — never block on birth-date gate.
      const jointActive = Boolean(
        typeof window !== "undefined" &&
          (new URLSearchParams(window.location.search).get("joint")?.trim() ||
            sessionStorage.getItem("aura_joint_token"))
      );
      // Free-form wording keeps the user's question but must not lock spread depth —
      // except joint invites, where invite depth must stay locked.
      setDeepLinkSpreadId(userQuestion && !jointActive ? null : resolvedSpreadId);
      // User's own wording must stay the session question — intent slug is only for catalog CTAs.
      setSeoFlowIntentSlug(userQuestion && !jointActive ? null : intent.slug);
      setSessionFlowPreselectedMaster(resolveIntentMasterId(intent));
      setSessionFlowInitialTopic("custom");
      setSessionFlowInitialQuestion(question);
      setSessionFlowRequiresPartnerInfo(jointActive ? false : Boolean(intent.requiresPartnerInfo));
      setSeoFlowOpen(true);
      setShowSessionFlow(false);
    },
    [setShowSessionFlow, setSessionFlowPreselectedMaster]
  );

  const handleLandingCustomQuestion = useCallback(
    (question: string) => {
      const q = question.trim();
      if (!q) return;
      consumePendingGuestQuestion();

      const matched = matchSpreadIntentFromQuestion(q);
      if (matched) {
        openSpreadIntentFlow(matched, { customQuestion: q });
        return;
      }

      setDeepLinkSpreadId(null);
      setSeoFlowIntentSlug(null);
      setSessionFlowPreselectedMaster("veronika");
      setSessionFlowInitialTopic("custom");
      setSessionFlowInitialQuestion(q);
      setSessionFlowRequiresPartnerInfo(false);
      setSeoFlowOpen(true);
      setShowSessionFlow(false);
    },
    [openSpreadIntentFlow, setShowSessionFlow, setSessionFlowPreselectedMaster]
  );

  const handleLandingQuickQuestion = useCallback(
    (question: string, intentSlug?: string) => {
      const q = question.trim();
      if (!q) return;
      // Guests use GuestTriplet on the editorial landing — never open paid session init.
      if (!isLoggedIn) return;
      const matched =
        (intentSlug ? getSpreadIntentBySlug(intentSlug) : null) ??
        matchSpreadIntentFromQuestion(q);
      if (matched) {
        openSpreadIntentFlow(matched);
        return;
      }

      setDeepLinkSpreadId(null);
      setSeoFlowIntentSlug(null);
      setSessionFlowPreselectedMaster("veronika");
      setSessionFlowInitialTopic("custom");
      setSessionFlowInitialQuestion(q);
      setSessionFlowRequiresPartnerInfo(false);
      setSeoFlowOpen(true);
      setShowSessionFlow(false);
    },
    [isLoggedIn, openSpreadIntentFlow, setShowSessionFlow, setSessionFlowPreselectedMaster]
  );

  // Telegram bot CTA: ?tg_receipt=zg_… — stash for login, claim when authenticated.
  useEffect(() => {
    if (typeof window === "undefined" || authLoading) return;
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get("tg_receipt")?.trim() || "";
    if (fromUrl.startsWith("zg_")) {
      stashTgReceipt(fromUrl);
      const url = new URL(window.location.href);
      url.searchParams.delete("tg_receipt");
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    }
    if (!isLoggedIn) return;
    const token = takeStashedTgReceipt() || (fromUrl.startsWith("zg_") ? fromUrl : "");
    if (!token) return;
    let cancelled = false;
    void (async () => {
      const result = await claimTgReceiptClient(token);
      if (cancelled) return;
      if (!result.ok) {
        setTripletNotice(result.message);
        return;
      }
      setTripletNotice(
        result.alreadyClaimed
          ? "Расклад из Telegram уже в вашем кабинете."
          : "Расклад из Telegram перенесён — те же карты ждут вас."
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, isLoggedIn, setTripletNotice]);

  useEffect(() => {
    if (typeof window === "undefined" || deepLinkSpreadParsedRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const jointParam = params.get("joint")?.trim();
    const jointRole = params.get("jointRole")?.trim();
    // `joint` alone → status page; `joint` + `jointRole` → start personal spread in SEO flow
    if (jointParam && !jointRole) {
      deepLinkSpreadParsedRef.current = true;
      window.location.replace(`/joint-reading/${encodeURIComponent(jointParam)}`);
      return;
    }
    if (jointParam && jointRole) {
      setJointReadingToken(jointParam);
      if (jointRole === "initiator" || jointRole === "partner") {
        setJointReadingRole(jointRole);
      }
      const jointIntent = params.get("intent")?.trim();
      if (jointIntent) {
        setJointReadingIntentSlug(jointIntent);
      }
      const spreadParam = params.get("spread")?.trim();
      if (spreadParam) {
        setDeepLinkSpreadId(normalizeSpreadId(spreadParam));
      }
      const jointPartnerName = params.get("jointPartnerName")?.trim();
      const jointInvite = params.get("jointInvite")?.trim();
      // Note: partner name is only stored for display — the joint flow never needs
      // the "partner birth date" gate (see requiresPartnerInfo override below),
      // since each side draws their own cards and the invite already carries names.
      if (jointRole === "initiator" && jointPartnerName) {
        setSessionFlowInitialPartnerInfo({ partnerName: jointPartnerName });
      } else if (jointRole === "partner" && jointInvite) {
        setSessionFlowInitialPartnerInfo({ partnerName: jointInvite });
      }
    }

    const askParam = params.get("ask")?.trim();
    if (askParam) {
      deepLinkSpreadParsedRef.current = true;
      autoAskParsedRef.current = true;

      // Active guest receipt/UI: never start a new pick (SEO deep-link ≠ redraw).
      const guestUi = loadGuestResumeUiCache();
      if (hasActiveGuestResumeIntent() || (isLoggedIn && guestUi)) {
        trackGuestTripletRedrawPrevented({
          had_ask_params: true,
          master_id: guestUi?.masterId || params.get("master")?.trim() || "veronika",
        });
        const url = new URL(window.location.href);
        url.searchParams.delete("ask");
        url.searchParams.delete("master");
        url.searchParams.delete("spread");
        window.history.replaceState(null, "", url.pathname + url.search + url.hash);
        return;
      }

      // Guest SEO/deep-link → GuestTriplet (server-issued receipt), not paid session wall.
      if (!isLoggedIn) {
        try {
          sessionStorage.setItem(LANDING_QUESTION_KEY, askParam);
        } catch {
          /* private mode */
        }
        const detail: GuestSpreadStartDetail = {
          question: askParam,
          masterId: params.get("master")?.trim() || GUEST_TRIPLET_MASTER_ID,
        };
        window.dispatchEvent(new CustomEvent(GUEST_SPREAD_START_EVENT, { detail }));
        requestAnimationFrame(() => {
          document
            .getElementById(GUEST_SPREAD_PICKER_ID)
            ?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
        const url = new URL(window.location.href);
        url.searchParams.delete("ask");
        url.searchParams.delete("master");
        url.searchParams.delete("spread");
        window.history.replaceState(null, "", url.pathname + url.search + url.hash);
        return;
      }

      const spreadFromHero = params.get("spread") === "1";
      const matched = matchSpreadIntentFromQuestion(askParam);
      if (matched) {
        openSpreadIntentFlow(matched, { customQuestion: askParam });
      } else if (spreadFromHero) {
        consumePendingGuestQuestion();
        setDeepLinkSpreadId(null);
        setSeoFlowIntentSlug(null);
        setSessionFlowPreselectedMaster(params.get("master")?.trim() || "veronika");
        setSessionFlowInitialTopic("custom");
        setSessionFlowInitialQuestion(askParam);
        setSessionFlowRequiresPartnerInfo(false);
        setSeoFlowOpen(true);
        setShowSessionFlow(false);
      } else {
        setAutoAsk({
          master: params.get("master")?.trim() ?? "",
          question: askParam,
        });
      }
      const url = new URL(window.location.href);
      url.searchParams.delete("ask");
      url.searchParams.delete("master");
      url.searchParams.delete("spread");
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
      return;
    }

    const intentParam =
      params.get("intent")?.trim() ||
      (jointParam && jointRole ? getJointReadingIntentSlug()?.trim() : undefined);

    if (intentParam) {
      const intent = getSpreadIntentBySlug(intentParam);
      if (intent) {
        deepLinkSpreadParsedRef.current = true;
        const askWithIntent = params.get("ask")?.trim();
        // For joint-reading deep links, the invite's own `spread` param (chosen at
        // invite creation — 3/7/12 cards) takes priority over the intent's default
        // spreadId in the registry, so the drawn layout matches what the server
        // will enforce via the invite's stored spread_id.
        const jointSpreadParam =
          jointParam && jointRole ? params.get("spread")?.trim() : undefined;
        openSpreadIntentFlow(intent, {
          customQuestion: askWithIntent || undefined,
          spreadIdOverride: jointSpreadParam ? normalizeSpreadId(jointSpreadParam) : undefined,
        });
        if (jointParam && jointRole) {
          // Joint reading: each side draws their own cards independently and the
          // partner's name is already known from the invite — the generic
          // "partner birth date" step is irrelevant here (and unused downstream),
          // so don't force it or it silently blocks the whole flow.
          setSessionFlowRequiresPartnerInfo(false);
          setStep("masters");
          if (typeof window !== "undefined") {
            localStorage.setItem(FLOW_STEP_KEY, "masters");
          }
        }
        const url = new URL(window.location.href);
        url.searchParams.delete("intent");
        url.searchParams.delete("ask");
        url.searchParams.delete("spread");
        if (jointParam && jointRole) {
          url.searchParams.delete("step");
          // Keep joint* params until attach succeeds — sessionStorage alone can fail
          // (private mode) and stripping the URL used to drop the invite mid-flow.
        } else {
          url.searchParams.delete("joint");
          url.searchParams.delete("jointRole");
          url.searchParams.delete("jointInvite");
          url.searchParams.delete("jointPartnerName");
        }
        window.history.replaceState(null, "", url.pathname + url.search + url.hash);
        return;
      }
    }

    const spreadParam = params.get("spread")?.trim();
    const dailyParam = params.get("daily")?.trim();

    if (dailyParam === "1" || dailyParam === "true") {
      deepLinkSpreadParsedRef.current = true;
      setDailyEnergySpreadId(DEFAULT_SPREAD_ID);
      setDailyEnergyAutoOpen(true);
      const url = new URL(window.location.href);
      url.searchParams.delete("daily");
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
      return;
    }

    if (dailyParam === "extended" || spreadParam === "daily-extended") {
      deepLinkSpreadParsedRef.current = true;
      setDailyEnergySpreadId("daily-extended");
      setDailyEnergyAutoOpen(true);
      const url = new URL(window.location.href);
      url.searchParams.delete("daily");
      url.searchParams.delete("spread");
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
      return;
    }

    if (!spreadParam) return;
    deepLinkSpreadParsedRef.current = true;

    // Bare /?ask&spread=1 (empty ask) and /?spread=1 — guest SEO entry.
    if (!isLoggedIn && (spreadParam === "1" || spreadParam === "triplet")) {
      const guestUi = loadGuestResumeUiCache();
      if (hasActiveGuestResumeIntent()) {
        trackGuestTripletRedrawPrevented({
          had_ask_params: Boolean(params.get("ask") != null),
          master_id: guestUi?.masterId || params.get("master")?.trim() || "veronika",
        });
      } else {
        const detail: GuestSpreadStartDetail = {
          masterId: params.get("master")?.trim() || GUEST_TRIPLET_MASTER_ID,
        };
        window.dispatchEvent(new CustomEvent(GUEST_SPREAD_START_EVENT, { detail }));
        requestAnimationFrame(() => {
          document
            .getElementById(GUEST_SPREAD_PICKER_ID)
            ?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }
      const url = new URL(window.location.href);
      url.searchParams.delete("ask");
      url.searchParams.delete("master");
      url.searchParams.delete("spread");
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
      return;
    }

    if (spreadParam === "love-7") {
      const compatIntent = getSpreadIntentBySlug("sovmestimost-pary");
      if (compatIntent) {
        openSpreadIntentFlow(compatIntent);
        const url = new URL(window.location.href);
        url.searchParams.delete("spread");
        window.history.replaceState(null, "", url.pathname + url.search + url.hash);
        return;
      }
    }
    const normalizedSpread = normalizeSpreadId(spreadParam);
    setDeepLinkSpreadId(normalizedSpread);
    setSeoFlowIntentSlug(null);
    setSessionFlowRequiresPartnerInfo(false);
    setSessionFlowPreselectedMaster(
      normalizedSpread === "runes-yes-no" ? "ragnar" : "veronika"
    );
    setSessionFlowInitialTopic("path");
    setSessionFlowInitialQuestion(null);
    setSeoFlowOpen(true);
    setShowSessionFlow(false);
    const url = new URL(window.location.href);
    url.searchParams.delete("spread");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }, [openSpreadIntentFlow, setShowSessionFlow, setSessionFlowPreselectedMaster, isLoggedIn, setStep]);

  const openNumerologSessionFlow = useCallback(
    (tool?: NumerologToolId | null, matrixSubjectId?: string | null) => {
      setSessionFlowPreselectedMaster("numerolog");
      setEnergyFlowMasterId("numerolog");
      setSessionFlowInitialNumerologTool(tool ?? null);
      setSessionFlowInitialMatrixSubjectId(matrixSubjectId?.trim() || null);
      // Avoid leftover Tarot topic/question from a previous SEO spread flow.
      setSessionFlowInitialTopic(null);
      setSessionFlowInitialQuestion(null);
      setSessionFlowRequiresPartnerInfo(false);
      setSessionFlowInitialPartnerInfo(null);
      setSeoFlowOpen(true);
      setShowSessionFlow(false);
    },
    [setShowSessionFlow, setSessionFlowPreselectedMaster]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (authLoading) return;

    if (autoOpenMasterId && !masterAutoOpenParsedRef.current) {
      const character = getCharacterById(autoOpenMasterId);
      if (!character) return;
      masterAutoOpenParsedRef.current = true;

      if (autoOpenRitualType) {
        if (!isLoggedIn) {
          persistOpenRitualIntent(autoOpenRitualType);
          window.location.href = buildRegisterHref(resolveRegistrationReturnTo());
          return;
        }
        setRitualFlowMaster(resolveRitualMasterForType(autoOpenRitualType, autoOpenMasterId));
        setPendingRitualType(autoOpenRitualType);
        setShowRitualFlow(true);
        if (window.location.pathname.startsWith("/master/")) {
          window.history.replaceState(null, "", "/");
        }
        return;
      }

      setSessionFlowPreselectedMaster(autoOpenMasterId);
      setEnergyFlowMasterId(autoOpenMasterId);
      setSeoFlowOpen(true);
      setShowSessionFlow(false);
      if (window.location.pathname.startsWith("/master/")) {
        window.history.replaceState(null, "", "/");
      }
      return;
    }

    if (numerologDeepLinkParsedRef.current) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("numerolog") !== "1") return;

    numerologDeepLinkParsedRef.current = true;
    const toolRaw = params.get("tool")?.trim();
    const tool =
      toolRaw && isNumerologSessionToolId(toolRaw) ? toolRaw : null;
    openNumerologSessionFlow(tool, params.get("subjectId")?.trim() || null);

    const url = new URL(window.location.href);
    url.searchParams.delete("numerolog");
    url.searchParams.delete("tool");
    url.searchParams.delete("subjectId");
    // Legacy replace=1 from SEO preview after DELETE — wipe already done; strip leftover.
    url.searchParams.delete("replace");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }, [
    autoOpenMasterId,
    autoOpenRitualType,
    authLoading,
    isLoggedIn,
    openNumerologSessionFlow,
    setSessionFlowPreselectedMaster,
    setShowSessionFlow,
  ]);

  useEffect(() => {
    selectedCharacterRef.current = selectedCharacter;
  }, [selectedCharacter]);

  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  // Proven by logs: step=masters can keep selectedCharacter=numerolog and the
  // ChatWindow branch ignores step — so home shows the matrix reading.
  // Skip while FLOW_STEP is chat (open in flight / URL resume already stripped)
  // or while a reading is still generating — never tear down mid-session.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (step !== "masters" && step !== "intro") return;
    if (!selectedCharacter) return;
    if (readingInFlightRef.current) return;
    const resume = new URLSearchParams(window.location.search).get("resume");
    if (resume === "chat") return;
    if (localStorage.getItem(FLOW_STEP_KEY) === "chat") return;
    setSelectedCharacterState(null);
    selectedCharacterRef.current = null;
  }, [step, selectedCharacter]);

  useEffect(() => {
    const savedMaster = localStorage.getItem(LAST_MASTER_KEY);
    if (savedMaster) setLastMasterId(savedMaster);
  }, [setLastMasterId]);

  const scrollToSection = useCallback((sectionId: string) => {
    if (typeof window !== "undefined" && window.location.pathname !== "/") {
      window.location.href = `/?app=1#${encodeURIComponent(sectionId)}`;
      return;
    }
    const needsFlowExit =
      Boolean(selectedCharacter) ||
      photoReadingOpen ||
      seoFlowOpen ||
      showRitualFlow;
    if (needsFlowExit) {
      exitToLandingForNavRef.current?.();
    }
    setPendingNav({ type: "section", id: sectionId });
    window.requestAnimationFrame(() => {
      window.setTimeout(() => {
        const el = document.getElementById(sectionId);
        if (!el) return;
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        window.history.replaceState(null, "", `#${sectionId}`);
        setPendingNav(null);
      }, needsFlowExit ? 80 : 0);
    });
  }, [selectedCharacter, photoReadingOpen, seoFlowOpen, showRitualFlow]);

  const openPhotoReading = useCallback(
    (options?: { masterOverride?: string; mode?: PhotoReadingEntryMode }) => {
      if (options?.masterOverride) {
        setPhotoReadingDefaultMaster(options.masterOverride);
      } else {
        setPhotoReadingDefaultMaster(undefined);
      }
      setPhotoReadingInitialMode(options?.mode ?? "upload");
      if (typeof window !== "undefined" && window.location.pathname !== "/") {
        navigateToPhotoReadingHard();
        return;
      }
      exitToLandingForNavRef.current?.();
      setPhotoReadingOpen(true);
      window.history.replaceState(null, "", window.location.pathname);
    },
    [navigateToPhotoReadingHard]
  );

  const openMarkCards = useCallback(() => {
    openPhotoReading({ mode: "mark" });
  }, [openPhotoReading]);

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
  }, [navigateToDecksModal]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const hash = decodeURIComponent(window.location.hash.slice(1));
    if (params.get("photo") === "1" || hash === "фото-расклад") {
      setPhotoReadingInitialMode(params.get("mode") === "mark" ? "mark" : "upload");
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

  // Scroll to hash only once when the target exists — re-running on every
  // auth/step change was yanking logged-in home to mid-page after remounts.
  const hashScrolledRef = useRef(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.location.hash) return;
    if (hashScrolledRef.current) return;

    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id || id === "фото-расклад") return;
    const el = document.getElementById(id);
    if (!el) return;

    hashScrolledRef.current = true;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
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
    pendingNewChatThreadRef,
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
    insufficientRunes,
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
    if (authLoading || !flowBootstrapped || !isLoggedIn || step !== "intro") return;
    if (typeof window !== "undefined") {
      const savedStep = localStorage.getItem(FLOW_STEP_KEY);
      const urlStep = new URLSearchParams(window.location.search).get("step");
      // Only force anketa when no consumer profile is linked (legacy).
      // Missing birth_date is progressive — Tarot works with stub profiles.
      const needsAnketa =
        hasPendingServerProfile() || !authUser?.profileUserId;
      if (needsAnketa) {
        setStep("onboarding");
        localStorage.setItem(FLOW_STEP_KEY, "onboarding");
        return;
      }
      if (
        (savedStep && savedStep !== "intro") ||
        (urlStep && urlStep !== "intro")
      ) {
        return;
      }
    }
    if (hasPendingServerProfile() || !authUser?.profileUserId) {
      setStep("onboarding");
      return;
    }
    setStep("masters");
  }, [authLoading, flowBootstrapped, isLoggedIn, step, setStep, authUser?.profileUserId]);

  useEffect(() => {
    if (!isLoggedIn || step !== "chat") return;
    trackFirstChatOpened("home_chat");
  }, [isLoggedIn, step]);

  useEffect(() => {
    if (authLoading || !flowBootstrapped || !isLoggedIn) return;
    if (sessionListMaster) return;
    const needsAnketa =
      hasPendingServerProfile() || !authUser?.profileUserId;
    // Do NOT clear an in-flight guest-resume chat while profileUserId is catching up.
    if (needsAnketa) {
      if (selectedCharacter) setSelectedCharacter(null);
      if (step !== "onboarding") {
        setStep("onboarding");
        localStorage.setItem(FLOW_STEP_KEY, "onboarding");
      }
      return;
    }
    // Prefer the sync ref — state lags one paint behind setSelectedCharacter during open.
    if (step !== "chat" || selectedCharacter || selectedCharacterRef.current) return;
    if (pendingChatOptsRef.current) return;
    if (readingInFlightRef.current) return;

    const params = new URLSearchParams(window.location.search);
    // Fresh stored chat = reload continuity; stale chat must not hijack landing.
    const allowChatRestore =
      params.get("resume") === "chat" ||
      params.get("step") === "chat" ||
      (localStorage.getItem(FLOW_STEP_KEY) === "chat" && isStoredChatResumeFresh());

    const masterId =
      localStorage.getItem(LAST_MASTER_KEY) ||
      lastMasterId ||
      localStorage.getItem(PENDING_MASTER_KEY);
    if (allowChatRestore && masterId) {
      void bindSessionToMaster(masterId).finally(() => {
        setSelectedCharacter(masterId);
        setLastMasterId(masterId);
      });
      return;
    }

    setStep("masters");
  }, [
    authLoading,
    flowBootstrapped,
    isLoggedIn,
    authUser?.profileUserId,
    step,
    selectedCharacter,
    lastMasterId,
    sessionListMaster,
    setStep,
    setSelectedCharacter,
    pendingChatOptsRef,
    setLastMasterId,
    bindSessionToMaster,
  ]);

  useEffect(() => {
    if (step !== "chat" || intentionSpreadLoading) return;
    if (!selectedCharacter || !intentionSpread) return;
    if (intentionSpread.masterId !== selectedCharacter) return;
    if (sessionIntention === "life_death") return;
    if (readingInFlightRef.current || pendingNewChatThreadRef.current) return;
    if (chatHasSpreadReading(messages)) return;
    if (
      !hasCompleteSpread(
        intentionSpread.cards.map((c) => c.name),
        chatDisplaySpread?.spreadId ?? DEFAULT_SPREAD_ID,
        "new"
      )
    ) {
      return;
    }

    const intention = sessionIntention ?? intentionSpread.intention;
    if (!intention) return;

    // Never hydrate a previous same-card consultation into a fresh thread.
    const boundSessionId =
      consultationSessionIdRef.current ?? consultationSessionId ?? undefined;
    if (!boundSessionId) return;

    const cardsKey = spreadKey(intentionSpread.cards);
    const recoveryKey = `${selectedCharacter}:${intention}:${cardsKey}:${boundSessionId}`;
    if (onboarding.spreadReadingRecoveryKeyRef.current === recoveryKey) return;
    if (insufficientRunes) return;
    onboarding.spreadReadingRecoveryKeyRef.current = recoveryKey;

    let cancelled = false;
    setSpreadReadingRitualOpen(true);
    setReadingRitualActive(true);
    setReadingRitualCountdownDone(false);
    void (async () => {
      const ritualStartedAt = Date.now();
      try {
        const raw = await pollIntentionSpreadReading({
          characterId: selectedCharacter,
          intention,
          cardNames: intentionSpread.cards.map((c) => c.name),
          spreadId: chatDisplaySpread?.spreadId ?? DEFAULT_SPREAD_ID,
          cardCount: intentionSpread.cards.length,
          sessionId: boundSessionId,
        });
        if (cancelled || !raw) return;
        if (pendingNewChatThreadRef.current || readingInFlightRef.current) return;

        const cardNames = intentionSpread.cards.map((c) => c.name);
        const readingText = resolveClientReadingText(raw, cardNames);
        if (!readingText || cancelled) return;
        setMessages((prev) => {
          if (chatHasSpreadReading(prev)) return prev;
          const next = appendSpreadReadingMessage(prev, readingText);
          if (next === prev) return prev;
          saveChatCache(selectedCharacter, next, cardsKey, {
            cards: intentionSpread.cards,
            system: intentionSpread.system,
            variant: "intention",
          });
          return next;
        });
      } finally {
        if (!cancelled) {
          await ensureMinSpreadRitualDisplay(ritualStartedAt);
        }
        setReadingRitualCountdownDone(true);
        setSpreadReadingRitualOpen(false);
        setReadingRitualActive(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    step,
    intentionSpreadLoading,
    selectedCharacter,
    intentionSpread,
    chatDisplaySpread?.spreadId,
    sessionIntention,
    messages,
    readingInFlightRef,
    pendingNewChatThreadRef,
    consultationSessionId,
    consultationSessionIdRef,
    setMessages,
    onboarding.spreadReadingRecoveryKeyRef,
    setReadingRitualCountdownDone,
    setReadingRitualActive,
    setSpreadReadingRitualOpen,
    insufficientRunes,
  ]);

  const spreadAwaitingReading = useMemo(() => {
    if (insufficientRunes) return false;
    if (chatHasSpreadReading(messages)) return false;
    const spread = chatDisplaySpread;
    if (!spread) return false;
    if (spread.source === "numerolog" && spread.computedOnly) {
      return true;
    }
    const cards = spread.cards;
    if (!cards?.length) return false;
    if (spread.source === "numerolog") {
      return cards.length >= (spread.cardCount ?? 1);
    }
    if (spread.source === "period") {
      return cards.length >= 3;
    }
    const spreadType =
      spread.source === "photo"
        ? "photo"
        : spread.source === "intention"
          ? "new"
          : "daily";
    return hasCompleteSpread(
      cards.map((c) => c.name),
      spread.spreadId ?? DEFAULT_SPREAD_ID,
      spreadType
    );
  }, [messages, chatDisplaySpread, insufficientRunes]);

  const spreadReadingLoading =
    spreadAwaitingReading &&
    (spreadReadingPending ||
      intentionSpreadLoading ||
      isLoadingHistory ||
      isLoading);

  useEffect(() => {
    if (step !== "chat") return;
    if (!spreadAwaitingReading || !isLoadingHistory) return;
    setSpreadReadingRitualOpen(true);
    setReadingRitualActive(true);
    setReadingRitualCountdownDone(false);
  }, [
    step,
    spreadAwaitingReading,
    isLoadingHistory,
    setSpreadReadingRitualOpen,
    setReadingRitualActive,
    setReadingRitualCountdownDone,
  ]);

  const chatMessagesForDisplay = useMemo(() => {
    let msgs =
      spreadReadingLoading && !chatHasSpreadReading(messages)
        ? messages.filter(
            (m) =>
              !(
                m.role === "assistant" &&
                (m.content?.trim().length ?? 0) >= MIN_SPREAD_READING_CHARS
              )
          )
        : messages;

    const headerSpreadActive =
      chatDisplaySpread?.computedOnly ||
      (chatDisplaySpread?.cards?.length &&
        hasCompleteSpread(
          chatDisplaySpread.cards.map((c) => c.name),
          chatDisplaySpread.spreadId ?? DEFAULT_SPREAD_ID,
          chatDisplaySpread.source === "photo"
            ? "photo"
            : chatDisplaySpread.source === "intention" || chatDisplaySpread.source === "period"
              ? "new"
              : "daily"
        ));

    if (headerSpreadActive) {
      msgs = msgs.map((m) => {
        if (m.role !== "assistant" || !m.content?.includes("!(")) return m;
        const stripped = stripAllSpreadCardImages(m.content);
        return stripped === m.content.trim() ? m : { ...m, content: stripped };
      });
    }

    return msgs;
  }, [messages, spreadReadingLoading, chatDisplaySpread]);

  useEffect(() => {
    if (
      hasCompleteSpread(
        chatDisplaySpread?.cards?.map((c) => c.name),
        chatDisplaySpread?.spreadId ?? DEFAULT_SPREAD_ID,
        chatDisplaySpread?.source === "photo" ? "photo" : chatDisplaySpread?.source === "intention" || chatDisplaySpread?.source === "period" ? "new" : "daily"
      )
    ) {
      setChatHeaderImage(null);
    }
  }, [chatDisplaySpread, setChatHeaderImage]);

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
    // Numerolog Full Matrix uses DestinyMatrixGrid — never restore AI «карта судьбы» art.
    if (selectedCharacter === "numerolog") {
      setChatHeaderImage(null);
      return;
    }

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
        cards: tarotCardNames(
          chatDisplaySpread?.source === "intention" || chatDisplaySpread?.source === "period"
            ? chatDisplaySpread.cards?.map((c) => ({ name: c.name }))
            : activeProfile.tarotCards,
          chatDisplaySpread?.spreadId ?? DEFAULT_SPREAD_ID,
          chatDisplaySpread?.source === "intention" || chatDisplaySpread?.source === "period" ? "new" : "daily"
        ),
        spreadId: chatDisplaySpread?.spreadId ?? DEFAULT_SPREAD_ID,
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
        const key = activeSpreadCardsKey || spreadCardsKey;
        saveChatCache(characterId, updated, key);
        return updated;
      });
    },
    [
      chatDisplaySpread,
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
    // Full Matrix / Pythagoras show computed grids — do not generate AI destiny-card art.
    if (
      selectedCharacter === "numerolog" ||
      chatDisplaySpread?.source === "numerolog" ||
      chatDisplaySpread?.computedOnly
    ) {
      return;
    }
    if (
      hasCompleteSpread(
        chatDisplaySpread?.cards?.map((c) => c.name),
        chatDisplaySpread?.spreadId ?? DEFAULT_SPREAD_ID,
        chatDisplaySpread?.source === "photo" ? "photo" : chatDisplaySpread?.source === "intention" || chatDisplaySpread?.source === "period" ? "new" : "daily"
      )
    ) {
      return;
    }

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
    acceptedReport,
    dismissAcceptedReport,
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
    insufficientRunes,
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
    setMatrixSessionBirthDate,
    setMatrixSessionSubjectName,
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
    beginNewSpreadSession,
    refreshSessionsList,
    persistSessionMetaToServer,
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
        const newSessionId = await beginNewSpreadSession(resolved);
        if (newSessionId) {
          setConsultationSessionId(newSessionId);
          consultationSessionIdRef.current = newSessionId;
          archiveSessionIdRef.current = null;
          await persistSessionMetaToServer(newSessionId, { characterKey: resolved });
        }
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
    beginNewSpreadSession,
    persistSessionMetaToServer,
    setConsultationSessionId,
    consultationSessionIdRef,
    archiveSessionIdRef,
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
    const matrixTool =
      sessionSpreadMetaRef.current?.numerologToolId === "destiny_matrix";
    if (
      !window.confirm(
        matrixTool
          ? `Удалить матрицу судьбы с ${label} безвозвратно? Пропадёт из чата и кабинета, покупка сбросится.`
          : `Удалить этот сеанс с ${label} безвозвратно? Переписка пропадёт из чата и личного кабинета.`
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
    setCompletingSession,
    setMessages,
  ]);

  const archiveActiveConsultationSession = useCallback(
    async (masterId: string): Promise<boolean> => {
      if (consultationReadOnly) return true;

      let sid = consultationSessionId;
      if (!sid) {
        sid = await resolveConsultationSessionId(masterId);
      }
      if (!sid) return false;

      const res = await fetch("/api/session/complete", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sid,
          characterKey: masterId,
          archiveOnly: true,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        alreadyCompleted?: boolean;
      };

      if (res.ok || res.status === 409 || data.alreadyCompleted) {
        setConsultationReadOnly(true);
        archiveSessionIdRef.current = sid;
        void refreshSessionsList(masterId);
        return true;
      }

      const message =
        data.error === "Session has no master"
          ? "Не удалось отправить в архив: сеанс не связан с мастером."
          : "Не удалось отправить сеанс в архив. Попробуйте ещё раз.";
      window.alert(message);
      return false;
    },
    [
      consultationReadOnly,
      consultationSessionId,
      resolveConsultationSessionId,
      refreshSessionsList,
    ]
  );

  const handleArchiveCurrentSession = useCallback(async () => {
    const masterId = selectedCharacter;
    if (!masterId || consultationReadOnly) return;

    setArchivingSession(true);
    try {
      await archiveActiveConsultationSession(masterId);
    } finally {
      setArchivingSession(false);
    }
  }, [selectedCharacter, consultationReadOnly, archiveActiveConsultationSession]);

  const handleStartNewSessionFromChat = useCallback(async () => {
    const masterId = selectedCharacter;
    if (!masterId) return;

    setStartingNewSession(true);
    try {
      const archived = await archiveActiveConsultationSession(masterId);
      if (!archived && !consultationReadOnly) return;

      pendingNewChatThreadRef.current = true;
      setConsultationSessionId(null);
      consultationSessionIdRef.current = null;
      setConsultationReadOnly(false);
      archiveSessionIdRef.current = null;
      skipNextReadingRef.current = false;
      chatLoadedForRef.current = null;
      setEnergyFlowMasterId(masterId);
      setShowSessionFlow(true);
    } finally {
      setStartingNewSession(false);
    }
  }, [
    selectedCharacter,
    consultationReadOnly,
    archiveActiveConsultationSession,
    setConsultationSessionId,
    setShowSessionFlow,
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
          spreadId: item.spreadId,
          cards: item.cards,
        },
        masterId
      );

      const restoreSpreadId = item.spreadId ?? DEFAULT_SPREAD_ID;
      if (item.cards && hasCompleteSpread(item.cards, restoreSpreadId, item.spreadType)) {
        const system = resolveMasterDeckSystem(masterId);
        const symbols = resolveSpreadSymbols(system, item.cards);
        if (hasCompleteSpread(symbols.map((c) => c.name), restoreSpreadId, item.spreadType)) {
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
        setSpreadFlipped(spreadFlippedState(3, true));
      }
    },
    [
      openChatWithCharacter,
      applyHistorySessionMeta,
      applyRestoredChatSpread,
      setSpreadFlipped,
    ]
  );

  // Telegram bot: ?chat_session=<uuid> → open that consultation chat.
  useEffect(() => {
    if (typeof window === "undefined" || authLoading) return;
    if (chatSessionDeepLinkParsedRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const sid = params.get("chat_session")?.trim() || "";
    if (!sid) return;

    if (!isLoggedIn) {
      chatSessionDeepLinkParsedRef.current = true;
      const returnTo = `/?chat_session=${encodeURIComponent(sid)}`;
      window.location.replace(
        `/auth/user/login?returnTo=${encodeURIComponent(returnTo)}`
      );
      return;
    }

    chatSessionDeepLinkParsedRef.current = true;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/sessions/${encodeURIComponent(sid)}`, {
          credentials: "include",
        });
        if (!res.ok || cancelled) {
          if (!cancelled) {
            setTripletNotice("Не удалось открыть сеанс из Telegram. Найдите его в кабинете.");
          }
          return;
        }
        const data = (await res.json()) as {
          id: string;
          characterKey?: string | null;
          intention?: string | null;
          spreadType?: string | null;
          spreadId?: string | null;
          cards?: string[] | null;
          status?: string | null;
          messageCount?: number;
          createdAt?: string;
          updatedAt?: string;
          topicSummary?: string | null;
          keyCards?: string[] | null;
          prediction?: string | null;
        };
        if (cancelled || !data.id) return;

        const masterId = (data.characterKey || "veronika").trim() || "veronika";
        const item: SessionListItem = {
          id: data.id,
          intention: data.intention ?? null,
          spreadType: data.spreadType ?? null,
          spreadId: data.spreadId ?? null,
          cards: data.cards ?? null,
          status: data.status || "active",
          createdAt: data.createdAt || new Date().toISOString(),
          updatedAt: data.updatedAt || new Date().toISOString(),
          messageCount: typeof data.messageCount === "number" ? data.messageCount : 1,
          topicSummary: data.topicSummary ?? null,
          keyCards: data.keyCards ?? null,
          prediction: data.prediction ?? null,
        };

        const url = new URL(window.location.href);
        url.searchParams.delete("chat_session");
        window.history.replaceState(null, "", url.pathname + url.search + url.hash);

        if ((data.status || "active") === "completed") {
          await handleOpenArchiveSession(masterId, item);
        } else {
          await handleContinueListedSession(masterId, item);
        }
      } catch {
        if (!cancelled) {
          setTripletNotice("Не удалось открыть сеанс из Telegram. Попробуйте из кабинета.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    authLoading,
    isLoggedIn,
    handleContinueListedSession,
    handleOpenArchiveSession,
    setTripletNotice,
  ]);

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
    consultationSessionIdRef.current = null;
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

  // Soft-nav into a master's session list keeps the previous window scroll.
  useLayoutEffect(() => {
    if (!sessionListMaster) return;
    resetWindowScrollSoon();
  }, [sessionListMaster]);

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
    setSeoFlowOpen(false);
    setSeoFlowIntentSlug(null);
    setDeepLinkSpreadId(null);
    if (!isLoggedIn) {
      resetGuestSpreadFlow({ keepCompletedTriplet: true });
      setStep("intro");
      return;
    }
    const nextStep = !authUser?.profileUserId ? "onboarding" : "masters";
    setStep(nextStep);
    persistStep(nextStep);
  }, [
    selectedCharacter,
    messages,
    sessionOnlyChat,
    activeSpreadCardsKey,
    refreshSavedReadings,
    setStep,
    setSessionListMaster,
    authUser?.profileUserId,
    isLoggedIn,
  ]);

  useEffect(() => {
    exitToLandingForNavRef.current = exitToLandingForNav;
  }, [exitToLandingForNav]);

  useEffect(() => {
    if (!pendingNav) return;
    if (selectedCharacter || sessionListMaster) return;

    if (pendingNav.type === "section") {
      const el = document.getElementById(pendingNav.id);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      window.history.replaceState(null, "", `#${pendingNav.id}`);
      setPendingNav(null);
      return;
    }

    if (step !== "masters") return;
    setShowDecksModal(true);
    setPendingNav(null);
  }, [pendingNav, selectedCharacter, sessionListMaster, step]);

  const handlePhotoConfirmSpread = async (
    masterId: string,
    payload: PhotoReadingConfirmPayload
  ) => {
    if (!isLoggedIn) return;

    const photoDeckCards = redrawSpreadToDeckCards(payload.redrawSpread);
    const photoSystem = payload.redrawSpread.system;
    const prevConsultationId = consultationSessionIdRef.current;

    // Fresh consultation — never append a photo spread into an existing master chat.
    pendingNewChatThreadRef.current = true;
    readingInFlightRef.current = true;
    skipNextReadingRef.current = true;
    chatLoadedForRef.current = masterId;
    archiveSessionIdRef.current = null;
    setConsultationReadOnly(false);
    // Detach old thread immediately so hydrate cannot restore it while we wait on the network.
    setConsultationSessionId(null);
    consultationSessionIdRef.current = null;

    setPhotoChatSpread({ masterId, cards: photoDeckCards, system: photoSystem });
    setChatSessionSpread(null);
    setIntentionSpread(null);
    setSessionIntention(null);
    setHideChatSpread(false);
    sessionSpreadMetaRef.current = {
      spreadType: "photo",
      cardNames: payload.detectedCards,
    };
    setChatHeaderImage(null);

    const pendingMessages = buildPhotoReadingPendingMessages(
      payload.question ?? "",
      payload.detectedCards
    );
    const photoCacheKey = tarotCardsKey(redrawSpreadToTarotCards(payload.redrawSpread));

    // Open chat + timer first (before session create / LLM), so old messages never linger.
    setMessages(pendingMessages);
    saveChatCache(masterId, pendingMessages, photoCacheKey, {
      cards: photoDeckCards,
      system: photoSystem,
      variant: "photo",
    });

    setPhotoReadingOpen(false);
    setSessionOnlyChat(false);
    setLastMasterId(masterId);
    localStorage.setItem(LAST_MASTER_KEY, masterId);
    persistStep("chat");
    setStep("chat");
    setHistoryHasMore(false);
    setIsLoadingHistory(false);
    setSelectedCharacter(masterId);

    setSpreadReadingRitualOpen(true);
    setReadingRitualActive(true);
    setReadingRitualCountdownDone(false);
    setSpreadRitual({ active: false });

    const ritualStartedAt = Date.now();

    let newSessionId: string | undefined;
    try {
      newSessionId = await beginNewSpreadSession(masterId);
    } catch {
      newSessionId = undefined;
    }
    // Re-assert after await — beginNewSpreadSession / effects must not resurrect the old thread.
    pendingNewChatThreadRef.current = true;
    readingInFlightRef.current = true;
    skipNextReadingRef.current = true;
    chatLoadedForRef.current = masterId;
    setMessages(pendingMessages);
    setSpreadReadingRitualOpen(true);
    setReadingRitualActive(true);

    if (newSessionId) {
      setConsultationSessionId(newSessionId);
      consultationSessionIdRef.current = newSessionId;
      try {
        localStorage.setItem("aura_session_id", newSessionId);
      } catch {
        /* ignore */
      }
      void bindSessionToMaster(masterId, newSessionId);
    } else {
      setConsultationSessionId(null);
      consultationSessionIdRef.current = null;
    }

    const interpretAbort = new AbortController();
    // Match photo_reading worker timeout (180s) + queue/poll slack; 3 min raced real jobs (~3 min).
    const interpretWatchdog = window.setTimeout(() => interpretAbort.abort(), 6 * 60_000);

    try {
      const { postWithAsyncJob } = await import("@/lib/client/wait-for-async-job");
      const { status: resStatus, data } = await postWithAsyncJob({
        url: "/api/photo-reading/stream",
        storageKey: "aura:photo-reading-active-job",
        signal: interpretAbort.signal,
        headers: { "Idempotency-Key": payload.idempotencyKey },
        body: {
          characterId: masterId,
          question: payload.question,
          sessionId: newSessionId,
          confirmedSpread: payload.redrawSpread,
          idempotencyKey: payload.idempotencyKey,
        },
      });

      if (resStatus === 429) {
        setMessages((prev) =>
          appendSpreadReadingMessage(
            prev,
            "Слишком много фото-чтений. Подождите минуту и подтвердите расклад снова."
          )
        );
        trackPhotoReadingPhase("interpret_fail");
        return;
      }

      if (resStatus === 402) {
        const parsed = parseInsufficientRunes(data);
        if (parsed) {
          setInsufficientRunes({ balance: parsed.balance, required: parsed.required });
          handleOpenPaywall({
            balance: parsed.balance,
            requiredRunes: parsed.required,
            shortage: parsed.shortage,
          });
        }
        setMessages((prev) =>
          appendSpreadReadingMessage(
            prev,
            pickUserFacingError(data, "Недостаточно рун для расшифровки фото-расклада.")
          )
        );
        trackPhotoReadingPhase("interpret_fail");
        return;
      }

      if (resStatus >= 400 || data.code === "generation_failed" || data.llmFailed) {
        if (typeof data.runeBalance === "number") {
          setRuneBalance(data.runeBalance as number);
          emitRuneBalanceUpdate(data.runeBalance as number);
        }
        setMessages((prev) =>
          appendSpreadReadingMessage(
            prev,
            pickUserFacingError(
              data,
              "Не удалось получить трактовку. Руны возвращены — откройте фото-расклад и подтвердите снова."
            )
          )
        );
        trackPhotoReadingPhase("interpret_fail");
        return;
      }

      const analysis = String(data.analysis ?? data.reply ?? "").trim();
      if (!analysis) {
        setMessages((prev) =>
          appendSpreadReadingMessage(
            prev,
            "Не удалось получить трактовку. Откройте фото-расклад и подтвердите снова."
          )
        );
        trackPhotoReadingPhase("interpret_fail");
        return;
      }

      if (typeof data.runeBalance === "number") {
        setRuneBalance(data.runeBalance as number);
        emitRuneBalanceUpdate(data.runeBalance as number);
      }

      const detectedCards =
        (Array.isArray(data.detectedCards) ? (data.detectedCards as string[]) : null) ??
        payload.detectedCards;

      const photoMessages = buildPhotoReadingChatMessages(
        analysis,
        payload.question ?? "",
        detectedCards
      );

      setMessages((prev) => {
        const withoutShortAssistant = prev.filter(
          (m) => !(m.role === "assistant" && (m.content?.trim().length ?? 0) < 80)
        );
        const next = mergePhotoReadingIntoChat(withoutShortAssistant, photoMessages);
        saveChatCache(masterId, next, photoCacheKey, {
          cards: photoDeckCards,
          system: photoSystem,
          variant: "photo",
        });
        return next;
      });

      const resolvedSessionId =
        (typeof data.sessionId === "string" && data.sessionId) || newSessionId;
      if (resolvedSessionId) {
        setConsultationSessionId(resolvedSessionId);
        setConsultationReadOnly(false);
        archiveSessionIdRef.current = null;
        try {
          localStorage.setItem("aura_session_id", resolvedSessionId);
        } catch {
          /* ignore */
        }
        void bindSessionToMaster(masterId, resolvedSessionId);
      }

      if (data.saved || data.historyId) void refreshSavedReadings();
      trackPhotoReadingPhase("interpret_done", { cached: Boolean(data.cached) });
    } catch (err) {
      const aborted =
        interpretAbort.signal.aborted ||
        (err instanceof Error && /отменен|cancelled|abort/i.test(err.message));
      setMessages((prev) =>
        appendSpreadReadingMessage(
          prev,
          aborted
            ? "Расшифровка занимает слишком долго. Обновите страницу или откройте кабинет — расклад мог уже сохраниться."
            : err instanceof Error && err.message
              ? err.message
              : "Ошибка сети. Откройте фото-расклад и подтвердите снова."
        )
      );
      trackPhotoReadingPhase("interpret_fail");
    } finally {
      window.clearTimeout(interpretWatchdog);
      try {
        const { ensureMinSpreadRitualDisplay } = await import("@/lib/spread-reading-ritual");
        await ensureMinSpreadRitualDisplay(ritualStartedAt);
      } catch {
        /* ignore */
      }
      setSpreadReadingRitualOpen(false);
      setReadingRitualActive(false);
      setReadingRitualCountdownDone(true);
      readingInFlightRef.current = false;
      pendingNewChatThreadRef.current = false;
      setSpreadRitual({ active: false });
    }
  };

  const handlePhotoContinueChat = async (masterId: string, payload: PhotoReadingChatPayload) => {
    if (!isLoggedIn) return;

    if (!payload.sessionId) {
      try {
        const syncedId = await Promise.race([
          syncPhotoSessionForMaster(masterId, payload.historyId),
          new Promise<undefined>((resolve) => window.setTimeout(() => resolve(undefined), 8_000)),
        ]);
        if (syncedId) payload.sessionId = syncedId;
      } catch {
        /* best-effort */
      }
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

    const withTimeout = async <T,>(promise: Promise<T>, ms: number): Promise<T | undefined> => {
      try {
        return await Promise.race([
          promise,
          new Promise<undefined>((resolve) => window.setTimeout(() => resolve(undefined), ms)),
        ]);
      } catch {
        return undefined;
      }
    };

    try {
      if (resolvedSessionId) {
        await withTimeout(bindSessionToMaster(masterId, resolvedSessionId), 10_000);
        setConsultationSessionId(resolvedSessionId);
        setConsultationReadOnly(false);
        archiveSessionIdRef.current = null;
      } else {
        await withTimeout(bindSessionToMaster(masterId), 10_000);
      }

      // Always start with an empty history — each photo spread is a new conversation.
      let existing: Message[] = [];

      if (resolvedSessionId && !session?.offline) {
        try {
          const params = new URLSearchParams({ characterId: masterId });
          params.set("sessionId", resolvedSessionId);
          const res = await Promise.race([
            fetch(`/api/chat/history?${params}`),
            new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 8_000)),
          ]);
          if (res?.ok) {
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
      persistStep("chat");
      setStep("chat");
      chatLoadedForRef.current = masterId;
      setHistoryHasMore(false);
      setMessages(chatMessages);
      setSelectedCharacter(masterId);

      void refreshSavedReadings();
    } finally {
      readingInFlightRef.current = false;
      setSpreadRitual({ active: false });
      setSpreadReadingRitualOpen(false);
      setReadingRitualActive(false);
      setReadingRitualCountdownDone(true);
      // Always surface the reading even if session bind hung.
      setPhotoReadingOpen(false);
    }
  };

  const handleDailyStartRitual = (ritualType: RitualType) => {
    setRitualFlowMaster(
      resolveRitualMasterForType(ritualType, dailyEnergyMasterId)
    );
    setOpenRitualId(null);
    setPendingRitualType(ritualType);
    setShowRitualFlow(true);
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
  const [hasDeepLinkStep, setHasDeepLinkStep] = useState(false);
  useEffect(() => {
    const urlStep = new URLSearchParams(window.location.search).get("step");
    setHasDeepLinkStep(
      urlStep === "chat" || urlStep === "masters" || urlStep === "onboarding"
    );
  }, []);
  const [bootstrapTimedOut, setBootstrapTimedOut] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setBootstrapTimedOut(true), 12_000);
    return () => window.clearTimeout(timer);
  }, []);
  const bootstrapping =
    (isLoggedIn || (authLoading && hasDeepLinkStep)) &&
    (sessionLoading || authLoading) &&
    !flowBootstrapped &&
    !bootstrapTimedOut &&
    step !== "onboarding" &&
    step !== "triplet" &&
    step !== "chat";
  /** Marketing landing — guests only; never blocked by session bootstrap. */
  /** Guests always get intro landing when step=intro; deep-link ?step= must not hide it. */
  // Recover from a bad local step=onboarding left by guest-resume cache (empty page).
  const showSeoLanding = !isLoggedIn && (showLanding || step === "onboarding");
  const showSalonHome = showSeoLanding || (!bootstrapping && step === "masters" && !selectedCharacter);
  /** Logged-in home: show salon as soon as flow is bootstrapped (don't wait on session spinner). */
  const showPersonalSalon =
    isLoggedIn &&
    !selectedCharacter &&
    !sessionListMaster &&
    (step === "masters" || (step === "intro" && flowBootstrapped));
  const showPersonalSalonContent =
    showPersonalSalon && (step === "intro" || !bootstrapping || flowBootstrapped);
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

  const handleNavRitual = useCallback(() => {
    if (!isLoggedIn) {
      persistOpenRitualIntent(null);
      window.location.href = buildRegisterHref(resolveRegistrationReturnTo());
      return;
    }
    exitToLandingForNav();
    setRitualFlowMaster(null);
    setOpenRitualId(null);
    setPendingRitualType(null);
    setShowRitualFlow(true);
  }, [isLoggedIn, exitToLandingForNav]);

  useEffect(() => {
    if (bootstrapping || !isLoggedIn) return;
    if (!consumeOpenRitualFlowFlag()) return;
    const typeRaw = consumeOpenRitualTypeFlag();
    const type = typeRaw && isRitualType(typeRaw) ? typeRaw : null;
    exitToLandingForNav();
    setRitualFlowMaster(type ? resolveRitualMasterForType(type, null) : null);
    setOpenRitualId(null);
    setPendingRitualType(type);
    setShowRitualFlow(true);
  }, [bootstrapping, isLoggedIn, exitToLandingForNav]);

  // In-app nav bus: bottom bar calls plain functions; when already on "/" they invoke
  // these handlers directly (no reload). Cross-route still uses location.assign.
  useEffect(() => {
    return registerAppShellHomeNavHandlers({
      goHome: () => {
        exitToLandingForNav();
      },
      startReading: () => {
        handleStartReadingFromHeader();
      },
      openPhotoReading: () => {
        openPhotoReading();
      },
      openDecksModal: () => {
        openDecksModal();
      },
      openRitualFlow: () => {
        handleNavRitual();
      },
      scrollToSection: (sectionId: string) => {
        scrollToSection(sectionId);
      },
    });
  }, [
    exitToLandingForNav,
    handleStartReadingFromHeader,
    openPhotoReading,
    openDecksModal,
    handleNavRitual,
    scrollToSection,
  ]);

  const landingInsufficientRunes = (payload: { balance: number; required: number }) => {
    setInsufficientRunes(payload);
    handleOpenPaywall({
      balance: payload.balance,
      requiredRunes: payload.required,
      shortage: payload.required - payload.balance,
    });
  };

  const seoLanding = (
    <ZovusEditorialLanding
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
      onOpenPhotoReading={() => openPhotoReading()}
      onOpenMarkCards={openMarkCards}
      photoNavLabel={photoNavLabel}
      onCustomQuestionSubmit={isLoggedIn ? handleLandingCustomQuestion : undefined}
      onQuickQuestionSelect={isLoggedIn ? handleLandingQuickQuestion : undefined}
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

  const inActiveChat = step === "chat" && Boolean(selectedCharacter);

  const guestResumeChatAssist = useMemo(() => {
    // Ref is read on message-driven re-renders after guest resume sets chat.
    const isGuestResume = sessionSpreadMetaRef.current?.spreadType === "guest_resume";
    if (!isGuestResume || !selectedCharacter) {
      return {
        showContinue: false,
        replies: undefined as undefined | { label: string; message: string }[],
      };
    }
    const hasReading = messages.some(
      (m) =>
        m.role === "assistant" &&
        Boolean(m.content?.trim()) &&
        (m.content?.trim().length ?? 0) >= MIN_SPREAD_READING_CHARS
    );
    const hasUserFollowUp = messages.some((m) => m.role === "user");
    if (!hasReading) {
      return { showContinue: false, replies: undefined };
    }
    return {
      showContinue: !hasUserFollowUp,
      replies: GUEST_TRIPLET_SUGGESTED_REPLIES.map((r) => ({
        label: r.label,
        message: r.message,
      })),
    };
  }, [selectedCharacter, messages, sessionSpreadMetaRef]);

  useEffect(() => {
    const onAppHomeNav = () => {
      setStep("masters");
    };
    window.addEventListener(APP_SHELL_HOME_EVENT, onAppHomeNav);
    return () => window.removeEventListener(APP_SHELL_HOME_EVENT, onAppHomeNav);
  }, [setStep]);

  useEffect(() => {
    document.body.classList.toggle("chat-session-active", inActiveChat);
    return () => document.body.classList.remove("chat-session-active");
  }, [inActiveChat]);

  return (
    <div
      className={
        inActiveChat
          ? "home-active-chat relative z-10 flex min-h-0 flex-1 flex-col"
          : showSeoLanding
            ? "relative min-h-screen"
            : "relative min-h-screen pt-[var(--app-header-h,3.25rem)]"
      }
    >
      <main
        className={
          inActiveChat
            ? "relative z-10 mx-auto flex h-full min-h-0 flex-1 max-w-none flex-col overflow-hidden px-0 py-0"
            : showSeoLanding || showSalonHome || showPersonalSalon
              ? "relative z-10 mx-auto max-w-none px-0 py-0 home-salon-shell"
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
            className="bootstrap-overlay pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-black/75 pt-[var(--app-header-h,3.25rem)] backdrop-blur-md max-md:bg-[#0a0908] max-md:backdrop-blur-none"
            aria-busy="true"
            aria-live="polite"
          >
            <AppBootstrapScreen embedded />
          </div>
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
              onClose={() => {
                setShowSessionFlow(false);
                setSessionFlowInitialTopic(null);
                setSessionFlowPreselectedMaster(null);
              }}
              preselectedMaster={sessionListMaster}
              initialTopic={sessionFlowInitialTopic ?? undefined}
              dailyCards={
                sessionListMaster === tripletOwnerMasterId
                  ? displayTarotCards.map((c) => c.name)
                  : []
              }
              masters={masters}
              initialSpreadId={(deepLinkSpreadId as SpreadId | null) ?? undefined}
              userBirthDate={effectiveProfile.birthDate}
              userFullName={effectiveProfile.name}
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
                pendingNewChatThreadRef.current = true;
                setConsultationSessionId(null);
                consultationSessionIdRef.current = null;
                setConsultationReadOnly(false);
                archiveSessionIdRef.current = null;
                void openChatWithSessionParams(params);
              }}
            />
          </>
        ) : selectedCharacter && step === "chat" && flowBootstrapped && !isLoggedIn ? (
          <RegisterGate
            compact
            title="Войдите для продолжения сеанса"
            description="Аккаунт нужен, чтобы сохранить переписку с мастером и историю раскладов."
            returnTo={resolveRegistrationReturnTo({ guestSpread: true })}
            source="chat_register_gate"
          />
        ) : selectedCharacter && step === "chat" && flowBootstrapped ? (
          <>
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
            onOpenPhotoReading={() => openPhotoReading({ masterOverride: selectedCharacter })}
            runeBalance={runeBalance}
            visionCost={runeCost("VISION_ANALYSIS")}
            headerSceneUrl={sessionOnlyChat ? null : chatHeaderImage}
            spreadCards={chatDisplaySpread?.cards}
            spreadDeckSystem={chatDisplaySpread?.system ?? profile?.deckSystem ?? DEFAULT_DECK_SYSTEM}
            spreadLoading={
              intentionSpreadLoading &&
              !(chatDisplaySpread?.cards?.length ?? 0) &&
              !chatDisplaySpread?.computedOnly &&
              !spreadReadingLoading
            }
            spreadReadingLoading={spreadReadingLoading}
            onSpreadReadingRitualComplete={handleSpreadReadingRitualComplete}
            spreadVariant={
              chatDisplaySpread?.source === "photo"
                ? "photo"
                : chatDisplaySpread?.source === "numerolog"
                  ? "numerolog"
                  : chatDisplaySpread?.source === "intention"
                    ? "intention"
                    : "triplet"
            }
            spreadId={chatDisplaySpread?.spreadId ?? DEFAULT_SPREAD_ID}
            spreadCardCount={chatDisplaySpread?.cardCount}
            spreadPositions={chatDisplaySpread?.positions}
            spreadComputedOnly={chatDisplaySpread?.computedOnly}
            spreadPythagorasSquare={chatDisplaySpread?.pythagorasSquare ?? null}
            spreadDestinyMatrix={chatDisplaySpread?.destinyMatrix ?? null}
            numerologSessionToolId={
              chatDisplaySpread?.source === "numerolog"
                ? (decodeNumerologSpreadId(chatDisplaySpread.spreadId) ?? null)
                : null
            }
            onOpenNumerologTool={(toolId) => openNumerologSessionFlow(toolId)}
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
            onArchiveSession={
              !consultationReadOnly ? () => void handleArchiveCurrentSession() : undefined
            }
            onStartNewSession={() => void handleStartNewSessionFromChat()}
            archivingSession={archivingSession}
            startingNewSession={startingNewSession}
            userBirthDate={
              selectedCharacter === "numerolog"
                ? matrixSessionBirthDate ||
                  getActiveProfile()?.birthDate ||
                  profile?.birthDate
                : undefined
            }
            sessionId={consultationSessionId ?? session?.sessionId ?? undefined}
            suggestedReplies={guestResumeChatAssist.replies}
            showContinueInChat={guestResumeChatAssist.showContinue}
            onContinueInChat={() => trackGuestChatContinue("prompt")}
            onSuggestedReplySend={() => trackGuestChatContinue("suggested_reply")}
          />
          <MasterSessionFlow
            isOpen={showSessionFlow}
            onClose={() => {
              setShowSessionFlow(false);
              setEnergyFlowMasterId(null);
              setSessionFlowInitialTopic(null);
              setSessionFlowPreselectedMaster(null);
            }}
            preselectedMaster={
              sessionFlowPreselectedMaster ?? energyFlowMasterId ?? selectedCharacter
            }
            newSpreadOnly
            initialSpreadId={(deepLinkSpreadId as SpreadId | null) ?? undefined}
            initialTopic={sessionFlowInitialTopic ?? undefined}
            masters={masters}
            userBirthDate={effectiveProfile.birthDate}
            userFullName={effectiveProfile.name}
            onStartRitual={() => {
              setRitualFlowMaster(resolveRitualMasterKey(selectedCharacter));
              setOpenRitualId(null);
              setShowSessionFlow(false);
              setShowRitualFlow(true);
            }}
            onStart={(params) => {
              setShowSessionFlow(false);
              setEnergyFlowMasterId(null);
              pendingNewChatThreadRef.current = true;
              setConsultationSessionId(null);
              consultationSessionIdRef.current = null;
              setConsultationReadOnly(false);
              archiveSessionIdRef.current = null;
              void openChatWithSessionParams(params);
            }}
          />
          </>
        ) : inPersonalFlow ? (
          <>
            {step === "masters" && showPersonalSalonContent && isLoggedIn ? (
              <LoggedInHomeBanner
                userName={effectiveProfile.name || authUser?.name}
                onQuestionSubmit={handleLandingCustomQuestion}
                dailyCardsState={resolveDailyCardsUiState({
                  cooldownReady: tripletCooldownReady,
                  allowed: effectiveTripletCooldown.allowed,
                  currentDaily: currentDailyReading,
                })}
                dailyCooldownHint={tripletCooldownHint}
                onOpenDailyCards={() => void handleNewReading()}
                onViewTodayDailyCards={() => void openCurrentDailyCards()}
                onPickRegularSpread={() => {
                  document.getElementById("наставники")?.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                  });
                }}
              />
            ) : null}
          <div className={step === "masters" ? "mx-auto max-w-7xl" : "mx-auto max-w-4xl"}>

            {step === "onboarding" && (
              <section className="mb-12">
                <OnboardingForm
                  initialName={authUser?.name ?? profile?.name}
                  initialGender={
                    authUser?.oauthGender === "male" || authUser?.oauthGender === "female"
                      ? authUser.oauthGender
                      : profile?.gender
                  }
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
                      masters={masters.filter((m) => m.id === GUEST_TRIPLET_MASTER_ID)}
                      value={tripletMasterId || GUEST_TRIPLET_MASTER_ID}
                      onChange={handleTripletMasterChange}
                      disabled={!canChangeTripletMaster}
                      className="ml-auto"
                    />
                  ) : null}
                </div>
                {visibleTripletNotice ? (
                  <div className="mb-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-5 py-4 text-sm text-amber-100 backdrop-blur-md">
                    <p>{visibleTripletNotice}</p>
                    {guestResumeCanRetry ? (
                      <button
                        type="button"
                        onClick={retryGuestTripletResume}
                        className="btn-primary mt-3 px-5 py-2 text-sm"
                      >
                        Попробовать восстановить
                      </button>
                    ) : null}
                    {guestIntroAlreadyUsed ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setGuestIntroAlreadyUsed(false);
                            void handleNewReading();
                          }}
                          className="btn-primary px-5 py-2 text-sm"
                        >
                          {GUEST_RESUME_ALREADY_USED_DAILY_CTA}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setGuestIntroAlreadyUsed(false);
                            setTripletNotice(null);
                            document.getElementById("наставники")?.scrollIntoView({
                              behavior: "smooth",
                              block: "start",
                            });
                          }}
                          className="btn-luxe btn-luxe--sm btn-luxe--ghost px-5 py-2 text-sm"
                        >
                          {GUEST_RESUME_ALREADY_USED_NEW_CTA}
                        </button>
                        <Link
                          href="/cabinet"
                          className="btn-luxe btn-luxe--sm btn-luxe--ghost px-5 py-2 text-sm"
                          onClick={() => setGuestIntroAlreadyUsed(false)}
                        >
                          {GUEST_RESUME_ALREADY_USED_CABINET_CTA}
                        </Link>
                      </div>
                    ) : null}
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
                      className="btn-primary px-6 py-2.5 text-sm"
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

            {showPersonalSalonContent ? (
              <>
                {isLoggedIn && hasActiveSpread && recapContinueMasterId ? (
                  <ReadingRecap
                    userName={effectiveProfile.name || authUser?.name || "друг"}
                    birthDate={effectiveProfile.birthDate}
                    tarotCards={displayTarotCards}
                    deckSystem={displayDeckSystem}
                    teaser={displayTeaser}
                    lastMasterId={recapContinueMasterId}
                    masters={masters}
                    cooldownReady={Boolean(tripletCooldown)}
                    cooldownAllowed={tripletCooldown?.allowed ?? true}
                    nextAvailableAt={tripletCooldown?.nextAvailableAt}
                    readingHint={
                      spreadReadingDone
                        ? undefined
                        : "Нажмите «Продолжить» — мастер даст полную расшифровку ваших карт."
                    }
                    readingComplete={spreadReadingDone}
                    onContinue={() => void handleMasterPick(recapContinueMasterId)}
                    onNewReading={() => void handleNewReading()}
                    onClearSpread={handleClearTripletFromMain}
                    onOpenGallery={() => setDeckGalleryOpen(true)}
                  />
                ) : null}
                {isLoggedIn && (
                  <>
                    <MasterSessionFlow
                      isOpen={showSessionFlow}
                      onClose={() => {
                        setShowSessionFlow(false);
                        setEnergyFlowMasterId(null);
                        setSessionFlowInitialTopic(null);
                        setSessionFlowPreselectedMaster(null);
                      }}
                      preselectedMaster={
                        sessionFlowPreselectedMaster ?? energyFlowMasterId ?? dailyEnergyMasterId
                      }
                      initialTopic={sessionFlowInitialTopic ?? undefined}
                      dailyCards={
                        displayTarotCards.length >= 3
                          ? displayTarotCards.map((c) => c.name)
                          : []
                      }
                      masters={masters}
                      initialSpreadId={(deepLinkSpreadId as SpreadId | null) ?? undefined}
                      userBirthDate={effectiveProfile.birthDate}
                      userFullName={effectiveProfile.name}
                      onStartRitual={() => {
                        setRitualFlowMaster(
                          resolveRitualMasterKey(energyFlowMasterId ?? dailyEnergyMasterId)
                        );
                        setOpenRitualId(null);
                        setShowSessionFlow(false);
                        setShowRitualFlow(true);
                      }}
                      onStart={(params) => {
                        setShowSessionFlow(false);
                        setEnergyFlowMasterId(null);
                        pendingNewChatThreadRef.current = true;
                        setConsultationSessionId(null);
                        consultationSessionIdRef.current = null;
                        setConsultationReadOnly(false);
                        archiveSessionIdRef.current = null;
                        void openChatWithSessionParams(params);
                      }}
                    />
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
                {visibleTripletNotice ? (
                  <div className="mb-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-5 py-4 text-sm text-amber-100 backdrop-blur-md">
                    <p>{visibleTripletNotice}</p>
                    {guestResumeCanRetry ? (
                      <button
                        type="button"
                        onClick={retryGuestTripletResume}
                        className="btn-primary mt-3 px-5 py-2 text-sm"
                      >
                        Попробовать восстановить
                      </button>
                    ) : null}
                    {guestIntroAlreadyUsed ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setGuestIntroAlreadyUsed(false);
                            void handleNewReading();
                          }}
                          className="btn-primary px-5 py-2 text-sm"
                        >
                          {GUEST_RESUME_ALREADY_USED_DAILY_CTA}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setGuestIntroAlreadyUsed(false);
                            setTripletNotice(null);
                            document.getElementById("наставники")?.scrollIntoView({
                              behavior: "smooth",
                              block: "start",
                            });
                          }}
                          className="btn-luxe btn-luxe--sm btn-luxe--ghost px-5 py-2 text-sm"
                        >
                          {GUEST_RESUME_ALREADY_USED_NEW_CTA}
                        </button>
                        <Link
                          href="/cabinet"
                          className="btn-luxe btn-luxe--sm btn-luxe--ghost px-5 py-2 text-sm"
                          onClick={() => setGuestIntroAlreadyUsed(false)}
                        >
                          {GUEST_RESUME_ALREADY_USED_CABINET_CTA}
                        </Link>
                      </div>
                    ) : null}
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

                <ZovusEditorialLanding
                  isLoggedIn={isLoggedIn}
                  masters={landingMasters}
                  onStartReading={() => void startPersonalFlow()}
                  onSelectMaster={(id) => void handleMasterPick(id)}
                  onBrowseDeck={handleBrowseDeck}
                  recommendedId={recommendedId}
                  continueMasterIds={continueMasterIds}
                  spreadReadingDone={spreadReadingDone}
                  showHero={!isLoggedIn}
                  showSellingSections={!isLoggedIn}
                  showLoggedInHomeBanner={false}
                  showMasters
                  showTariffs
                  homeUserName={effectiveProfile.name || authUser?.name}
                  dailyCardsState={
                    isLoggedIn
                      ? resolveDailyCardsUiState({
                          cooldownReady: tripletCooldownReady,
                          allowed: effectiveTripletCooldown.allowed,
                          currentDaily: currentDailyReading,
                        })
                      : undefined
                  }
                  dailyCooldownHint={isLoggedIn ? tripletCooldownHint : undefined}
                  onOpenDailyCards={
                    isLoggedIn ? () => void handleNewReading() : undefined
                  }
                  onViewTodayDailyCards={
                    isLoggedIn ? () => void openCurrentDailyCards() : undefined
                  }
                  onPickRegularSpread={
                    isLoggedIn
                      ? () => {
                          document.getElementById("наставники")?.scrollIntoView({
                            behavior: "smooth",
                            block: "start",
                          });
                        }
                      : undefined
                  }
                  onOpenRitual={isLoggedIn ? handleNavRitual : undefined}
                  onOpenDestinyMatrixSession={
                    isLoggedIn ? () => openNumerologSessionFlow("destiny_matrix") : undefined
                  }
                  onOpenOwnedDestinyMatrixReport={
                    isLoggedIn
                      ? () => {
                          void openChatWithSessionParams({
                            characterKey: "numerolog",
                            intention: null,
                            spreadType: "new",
                            cards: [],
                            cardsRevealed: true,
                            numerologToolId: "destiny_matrix",
                          });
                        }
                      : undefined
                  }
                  onCustomQuestionSubmit={isLoggedIn ? handleLandingCustomQuestion : undefined}
                  onQuickQuestionSelect={isLoggedIn ? handleLandingQuickQuestion : undefined}
                  onOpenPhotoReading={() => openPhotoReading()}
                  onOpenMarkCards={openMarkCards}
                  photoNavLabel={photoNavLabel}
                  afterQuickQuestions={
                    isLoggedIn ? (
                      <div className="home-feature-banners">
                        <CabinetNatalChart />
                        <PremiumEnergyBlock
                          characterKey={dailyEnergyMasterId}
                          masters={masters}
                          initialSpreadId={dailyEnergySpreadId}
                          autoOpen={dailyEnergyAutoOpen}
                          onAutoOpenHandled={() => setDailyEnergyAutoOpen(false)}
                          onInsufficientRunes={landingInsufficientRunes}
                          onStartRitual={handleDailyStartRitual}
                          isUnlimited={Boolean(session?.isUnlimited)}
                          onTalkToMaster={(masterId) => {
                            setEnergyFlowMasterId(masterId);
                            setShowSessionFlow(true);
                          }}
                          onOpenNumerologForm={() => {
                            setEnergyFlowMasterId("numerolog");
                            setShowSessionFlow(true);
                          }}
                        />
                      </div>
                    ) : undefined
                  }
                  onOpenPaywall={() => handleOpenPaywall()}
                  runeBalance={runeBalance}
                  isUnlimited={Boolean(session?.isUnlimited)}
                  onInsufficientRunes={landingInsufficientRunes}
                />
              </>
            ) : null}
          </div>
          </>
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

      {seoFlowOpen ? (
        <MasterSessionFlow
          isOpen={seoFlowOpen}
          onClose={() => {
            setSeoFlowOpen(false);
            setShowSessionFlow(false);
            setSeoFlowIntentSlug(null);
            setDeepLinkSpreadId(null);
            setEnergyFlowMasterId(null);
            setSessionFlowInitialTopic(null);
            setSessionFlowInitialQuestion(null);
            setSessionFlowRequiresPartnerInfo(false);
            setSessionFlowInitialNumerologTool(null);
            setSessionFlowInitialMatrixSubjectId(null);
            setSessionFlowInitialPartnerInfo(null);
            setSessionFlowPreselectedMaster(null);
          }}
          preselectedMaster={
            sessionFlowPreselectedMaster ??
            energyFlowMasterId ??
            recommendedId ??
            lastMasterId ??
            "veronika"
          }
          newSpreadOnly
          initialSpreadId={(deepLinkSpreadId as SpreadId | null) ?? undefined}
          initialTopic={sessionFlowInitialTopic ?? undefined}
          initialCustomQuestion={sessionFlowInitialQuestion ?? undefined}
          autoDrawOnOpen={
            Boolean(sessionFlowInitialTopic) &&
            !sessionFlowRequiresPartnerInfo &&
            !sessionFlowInitialQuestion?.trim()
          }
          requiresPartnerInfo={sessionFlowRequiresPartnerInfo}
          initialNumerologTool={sessionFlowInitialNumerologTool ?? undefined}
          initialMatrixSubjectId={sessionFlowInitialMatrixSubjectId}
          initialPartnerInfo={sessionFlowInitialPartnerInfo ?? undefined}
          spreadIntentSlug={seoFlowIntentSlug}
          masters={masters}
          userBirthDate={effectiveProfile.birthDate}
          userFullName={effectiveProfile.name}
          onStartRitual={() => {
            setRitualFlowMaster(
              resolveRitualMasterKey(sessionFlowPreselectedMaster ?? energyFlowMasterId)
            );
            setOpenRitualId(null);
            setSeoFlowOpen(false);
            setShowSessionFlow(false);
            setSeoFlowIntentSlug(null);
            setShowRitualFlow(true);
          }}
          onStart={(params) => {
            if (!isLoggedIn) {
              if (typeof window !== "undefined") {
                if (seoFlowIntentSlug) {
                  persistPendingIntent(seoFlowIntentSlug);
                }
                const jointToken =
                  typeof window !== "undefined"
                    ? (sessionStorage.getItem("aura_joint_token")?.trim() || undefined)
                    : undefined;
                const returnTo = jointToken
                  ? resolveRegistrationReturnTo({ jointToken })
                  : seoFlowIntentSlug
                    ? resolveRegistrationReturnTo({ intentSlug: seoFlowIntentSlug })
                    : resolveRegistrationReturnTo();
                window.location.href = buildRegisterHref(returnTo);
              }
              return;
            }
            consumePendingGuestQuestion();
            setSeoFlowOpen(false);
            setShowSessionFlow(false);
            setSeoFlowIntentSlug(null);
            setDeepLinkSpreadId(null);
            setEnergyFlowMasterId(null);
            setSessionFlowInitialQuestion(null);
            // Same guarantees as personal MasterSessionFlow: never bind/restore an old thread.
            pendingNewChatThreadRef.current = true;
            setConsultationSessionId(null);
            consultationSessionIdRef.current = null;
            setConsultationReadOnly(false);
            archiveSessionIdRef.current = null;
            void openChatWithSessionParams(params);
          }}
        />
      ) : null}

      <PhotoReadingFlow
        open={photoReadingOpen}
        onClose={closePhotoReading}
        masters={masters}
        isLoggedIn={isLoggedIn}
        defaultMasterId={
          photoReadingDefaultMaster ?? lastMasterId ?? recommendedId ?? "veronika"
        }
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
        onConfirmSpread={handlePhotoConfirmSpread}
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
        initialMode={photoReadingInitialMode}
      />

      <MasterDecksModal
        isOpen={showDecksModal}
        onClose={() => setShowDecksModal(false)}
        masters={masters}
        onBrowseDeck={handleBrowseDeck}
      />

      {acceptedReport ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm">
          <ReportAcceptedScreen
            accepted={acceptedReport}
            onStay={dismissAcceptedReport}
          />
        </div>
      ) : null}

      <DailyBonusClaimer
        enabled={isLoggedIn && Boolean(authUser?.profileUserId) && runeConfig.enabled}
      />
      <PersonalMemoryChoice
        enabled={!authLoading && isLoggedIn && Boolean(authUser?.profileUserId)}
      />

      <SpreadRitualLoader
        active={spreadRitual.active}
        cards={spreadRitual.cards}
        system={spreadRitual.system}
      />

      <RitualFlow
        isOpen={showRitualFlow}
        characterKey={ritualFlowMaster === null ? null : resolveRitualMasterKey(ritualFlowMaster)}
        userName={effectiveProfile.name || authUser?.name || "друг"}
        userZodiac={effectiveProfile.zodiac || ""}
        balance={runeBalance}
        isUnlimited={Boolean(session?.isUnlimited)}
        initialRitualId={openRitualId}
        initialRitualType={pendingRitualType}
        onClose={() => {
          setShowRitualFlow(false);
          setOpenRitualId(null);
          setPendingRitualType(null);
        }}
        onAchievement={(ach) => {
          setAchievementPopup(ach);
          setTimeout(() => setAchievementPopup(null), 4000);
        }}
        onBalanceChange={(b) => {
          setRuneBalance(b);
          emitRuneBalanceUpdate(b);
        }}
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
