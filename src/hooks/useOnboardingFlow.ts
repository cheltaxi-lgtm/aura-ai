"use client";

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import type { OnboardingData } from "@/components/OnboardingForm";
import type { IntentionStartMode } from "@/components/IntentionPicker";
import type { SessionStartParams } from "@/components/MasterSessionFlow";
import type { SessionListItem } from "@/components/SessionList";
import type { FlowStep } from "@/components/FlowStepper";
import { emitRuneBalanceUpdate } from "@/components/RuneBalance";
import { parseInsufficientRunes } from "@/lib/api-errors";
import {
  loadChatCache,
  loadChatCacheAny,
  loadChatCacheEntry,
  loadChatCacheForMaster,
  saveChatCache,
  clearChatCache,
  chatHasSpreadReading,
  appendSpreadReadingMessage,
  type CachedChatSpread,
} from "@/lib/chat-cache";
import { resolveClientReadingText } from "@/lib/chat-reply-sanitize";
import {
  buildIntentionOpening,
  persistSessionIntention,
  persistSessionCustomQuestion,
  persistIntentionSpreadState,
  readIntentionSpreadForMaster,
  type SessionIntention,
  type SessionTopicId,
} from "@/lib/intention";
import { buildSessionSpreadCards, resolveSpreadSymbols } from "@/lib/intention-draw";
import { toSessionTopicId } from "@/lib/session-topics";
import { navigateToSessionIntention } from "@/lib/session-intention-nav";
import {
  INTENTION_SPREAD_LATE_RECOVERY_POLL_MAX_ATTEMPTS,
  INTENTION_SPREAD_RECOVERY_POLL_MAX_ATTEMPTS,
  isIntentionSpreadWaitAborted,
  isTerminalIntentionSpreadError,
  pollIntentionSpreadReading,
  postIntentionSpreadRequest,
} from "@/lib/intention-spread-client";
import { getJointReadingRole, clearJointReadingToken, resolveJointReadingToken } from "@/lib/joint-reading-storage";
import { postJointReadingComplete } from "@/lib/joint-reading-client";
import { ensureMinSpreadRitualDisplay } from "@/lib/spread-reading-ritual";
import { generateId } from "@/lib/id";
import {
  DEFAULT_DECK_SYSTEM,
  getDeckPositions,
  resolveMasterDeckSystem,
  spreadKey,
} from "@/lib/decks";
import { DEFAULT_SPREAD_ID, getSpread, hasCompleteSpread, normalizeSpreadId, resolveSpreadPositions, spreadFlippedState, resolveClientSpreadId, hasExplicitClientSpreadId, requiredCardCount, buildIntentionChatSpreadDisplay, spreadCardsMatchSpreadId, type SpreadId } from "@/lib/spreads";
import {
  hasActivePeriodSpread,
  periodSpreadPositions,
  type PeriodSpreadScope,
} from "@/lib/master-quick-chips";
import type { DeckSystem } from "@/lib/decks/types";
import type { SpreadSymbol } from "@/lib/decks/types";
import type { DeckCardInput } from "@/lib/deck-card-utils";
import {
  resolvePhotoSpreadFromReadings,
  resolvePhotoReadingContinuePayload,
} from "@/lib/photo-chat";
import {
  getSpreadForSystem,
  reconcileSpreadDeck,
  resolveMasterSpread,
  resolveTripletDisplaySpread,
  resolveRecapSpread,
  resolveTripletOwnerMasterId,
  hasServerTripletSpread,
  masterHasReadingForSpread,
  anyMasterReadingForSpread,
} from "@/lib/spread-context";
import {
  findShowcaseMaster,
  getAiMasters,
  isAiMasterId,
  type ShowcaseMaster,
} from "@/lib/showcase-masters";
import { getCharacterById } from "@/lib/characters";
import { isNumerologMaster } from "@/lib/numerolog/welcome";
import {
  DEFAULT_NUMEROLOG_SESSION_TOOL,
  encodeNumerologSpreadId,
  numerologComputedOnlyTool,
  numerologToolDrawCount,
  numerologToolPositions,
  buildNumerologSpreadCards,
  resolveNumerologToolId,
} from "@/lib/numerology/tools";
import { pythagorasSquare } from "@/lib/numerology/pythagoras-square";
import { destinyMatrix, matrixOptionsForTimestamp } from "@/lib/numerology/destiny-matrix";
import { mergeGuestTripletIntoProfile, clearGuestTriplet, loadGuestTriplet } from "@/lib/guest-triplet";
import {
  clearGuestResumeUiCache,
  loadGuestResumeUiCache,
  patchGuestResumeUiCache,
  saveGuestResumeUiCache,
} from "@/lib/guest-resume-ui-cache";
import {
  GUEST_RESUME_ALREADY_USED,
  GUEST_RESUME_CAPACITOR_RECOVERY,
  GUEST_RESUME_RETRY_TITLE,
  GUEST_RESUME_TRANSITION_SUBTITLE,
  GUEST_RESUME_TRANSITION_TITLE,
  runGuestTripletResume,
} from "@/lib/guest-triplet-resume";
import { GUEST_SPREAD_PICKER_ID, GUEST_SPREAD_START_EVENT, GUEST_TRIPLET_MASTER_ID } from "@/lib/landing-offer";
import {
  formatTripletCooldownRu,
  tripletCooldownFromLastDraw,
  type TripletCooldownStatus,
} from "@/lib/triplet-limit";
import {
  mergeTripletCooldownWithAnchors,
  clearLocalTripletDrawAt,
  writeLocalTripletDrawAt,
} from "@/lib/triplet-cooldown-client";
import { readPendingReading, clearPendingReading } from "@/lib/chat-reading-helpers";
import {
  PROFILE_KEY,
  FLOW_STEP_KEY,
  LAST_MASTER_KEY,
  PENDING_MASTER_KEY,
  clearPendingMasterResume,
  markGuestExplicitMaster,
  clearNeedsServerProfile,
  clearOnboardingUrlParams,
  hasPendingServerProfile,
  markNeedsServerProfile,
  persistStep,
  readStoredProfile,
} from "@/lib/home-flow-storage";
import {
  profileHasSpread,
  readStoredProfileSpread,
  mergeActiveProfile,
  resolveTripletChatMasterId,
  resolveDefaultTripletMasterId,
  mapProfileReadings,
  tripletCooldownFromProfileData,
  profileFromApiPayload,
  mergeProfileWithServer,
  clearSpreadSessionState,
  masterVisualKey,
  buildOnboardingPostBody,
  onboardingErrorMessage,
} from "@/lib/onboarding-flow-helpers";
import type { StoredReadingRow } from "@/lib/reading-progress";
import type { StoredProfile } from "@/types/stored-profile";
import type { Message } from "@/types";
import type { RestoreChatResult } from "@/hooks/useChatSession";
import { useTripletCountdown } from "@/hooks/useTripletCountdown";
import {
  hasPendingGuestQuestion,
  postOnboardingNeedsHardNavigation,
  resolvePostOnboardingDestination,
  resolveRegistrationReturnTo,
} from "@/lib/post-auth-return";
import { trackRegistrationCompleted } from "@/lib/seo/metrika";
import {
  clearShareRegistrationAttribution,
  resolveRegistrationSource,
} from "@/lib/share/registration-attribution";

export { masterVisualKey };

export interface ChatSessionDeps {
  messages: Message[];
  setMessages: Dispatch<SetStateAction<Message[]>>;
  sessionListMaster: string | null;
  setSessionListMaster: (id: string | null) => void;
  setSessionsListLoading: (loading: boolean) => void;
  setSessionsListData: (data: {
    active: SessionListItem | null;
    completed: SessionListItem[];
  }) => void;
  setConsultationSessionId: (id: string | null) => void;
  consultationSessionIdRef: MutableRefObject<string | null>;
  setConsultationReadOnly: (readOnly: boolean) => void;
  setIsLoadingHistory: (loading: boolean) => void;
  setHistoryHasMore: (hasMore: boolean) => void;
  persistSessionMetaToServer: (
    sessionId: string | undefined,
    meta: {
      characterKey: string;
      intention: SessionIntention | SessionTopicId | null;
      spreadType: "daily" | "new";
      spreadId?: SpreadId | string;
      cards: string[];
      awaitingContext?: boolean;
      numerologToolParams?: import("@/lib/numerology/tools").NumerologToolParams | null;
    }
  ) => Promise<void>;
  restoreChatForCharacter: (
    characterId: string,
    options?: {
      before?: string;
      limit?: number;
      archiveSessionId?: string;
      sessionId?: string;
    }
  ) => Promise<RestoreChatResult | null>;
  resolveConsultationSessionId: (
    characterId: string,
    hintId?: string
  ) => Promise<string | null>;
  refreshSessionsList: (masterId: string) => Promise<void>;
  archiveSessionIdRef: MutableRefObject<string | null>;
  sessionOnlyChat: boolean;
  setSessionOnlyChat: (only: boolean) => void;
  selectedCharacter: string | null;
  setSelectedCharacter: (id: string | null) => void;
  setIsLoading: (loading: boolean) => void;
  setChatHeaderImage: Dispatch<SetStateAction<string | null>>;
  setInsufficientRunes: (value: { balance: number; required: number } | null) => void;
  insufficientRunes: { balance: number; required: number } | null;
  setRuneBalance: (balance: number) => void;
  chatLoadedForRef: MutableRefObject<string | null>;
  skipNextReadingRef: MutableRefObject<boolean>;
  pendingNewChatThreadRef: MutableRefObject<boolean>;
  readingInFlightRef: MutableRefObject<boolean>;
  setPhotoChatSpread: (
    spread: { masterId: string; cards: DeckCardInput[]; system: DeckSystem } | null
  ) => void;
}

type LoadReadingFn = (
  characterId: string,
  profileOverride?: StoredProfile,
  loadOptions?: {
    force?: boolean;
    replaceExisting?: boolean;
    preserveChat?: boolean;
    sessionId?: string;
    readingScope?: import("@/lib/master-quick-chips").PeriodSpreadScope;
    spreadCardsOverride?: import("@/lib/decks/types").SpreadSymbol[];
  }
) => Promise<void>;

type OpenChatWithCharacterFn = (
  characterId: string,
  openOptions?: {
    forceNew?: boolean;
    sessionOnly?: boolean;
    intention?: SessionIntention | null;
    preserveSpreadState?: boolean;
  }
) => Promise<void>;

type ApplyRestoredChatSpreadFn = (
  spread:
    | {
        cards: { name: string; meaning?: string }[];
        system: DeckSystem;
        type: string;
        cardsKey: string;
        intention?: string | null;
      }
    | null
    | undefined,
  characterId: string
) => void;

type ApplyHistorySessionMetaFn = (
  data: {
    sessionId?: string | null;
    intention?: string | null;
    spreadType?: string | null;
    spreadId?: string | null;
    cards?: string[] | null;
    numerologToolId?: import("@/lib/numerology/tools").NumerologToolId | null;
    numerologToolParams?: import("@/lib/numerology/tools").NumerologToolParams | null;
    matrixSubjectId?: string | null;
    matrixBirthDate?: string | null;
    subjectName?: string | null;
    spread?:
      | {
          cards: { name: string; meaning?: string }[];
          system: DeckSystem;
          type: string;
          cardsKey: string;
          intention?: string | null;
        }
      | null;
  },
  characterId: string
) => void;

export interface UseOnboardingFlowOptions {
  referrerSlug?: string;
  isLoggedIn: boolean;
  authLoading: boolean;
  authUser: { name?: string | null; profileUserId?: string | null } | null | undefined;
  step: FlowStep;
  setStep: (step: FlowStep) => void;
  setStepState: Dispatch<SetStateAction<FlowStep>>;
  profile: StoredProfile | null;
  setProfile: Dispatch<SetStateAction<StoredProfile | null>>;
  persistProfile: (data: StoredProfile) => void;
  session: { sessionId?: string; offline?: boolean } | null | undefined;
  sessionLoading: boolean;
  refresh: (sessionId: string) => Promise<void>;
  reconnectSession: (refToken: string | null) => Promise<{ sessionId: string }>;
  spawnSession: (refToken: string | null) => Promise<{ sessionId: string }>;
  selectedCharacter: string | null;
  setSelectedCharacter: (id: string | null) => void;
  lastMasterId: string | null;
  setLastMasterId: (id: string | null) => void;
  readingInFlightRef: MutableRefObject<boolean>;
  handleOpenPaywallRef: MutableRefObject<
    (opts?: { balance?: number; requiredRunes?: number; shortage?: number }) => void
  >;
  loadReadingRef: MutableRefObject<LoadReadingFn>;
  openChatWithCharacterRef: MutableRefObject<OpenChatWithCharacterFn>;
  applyRestoredChatSpreadRef: MutableRefObject<ApplyRestoredChatSpreadFn>;
  applyHistorySessionMetaRef: MutableRefObject<ApplyHistorySessionMetaFn>;
  chatDepsRef: MutableRefObject<ChatSessionDeps | null>;
  photoChatSpread?: { masterId: string; cards: DeckCardInput[]; system: DeckSystem } | null;
  pendingReadingMasterRef?: MutableRefObject<string | null>;
  syncPhotoSessionForMaster?: (
    masterId: string,
    historyId?: string
  ) => Promise<string | undefined>;
  onRuneBalancePayload?: (
    data: {
      balance?: number;
      newTransactions?: Array<{ id: string; amount: number; description?: string }>;
    } | null
  ) => void;
  refreshAuth?: () => Promise<void>;
}

function defaultSyncPhotoSessionForMaster(
  masterId: string,
  historyId?: string
): Promise<string | undefined> {
  return fetch("/api/photo-reading/sync-session", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ characterId: masterId, historyId }),
  })
    .then((res) => (res.ok ? res.json() : null))
    .then((data: { sessionId?: string } | null) => data?.sessionId)
    .catch(() => undefined);
}

export function useOnboardingFlow(options: UseOnboardingFlowOptions) {
  const {
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
    refresh,
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
    photoChatSpread = null,
    pendingReadingMasterRef,
    syncPhotoSessionForMaster = defaultSyncPhotoSessionForMaster,
    onRuneBalancePayload,
    refreshAuth,
  } = options;

  const chat = () => chatDepsRef.current;

  const [tripletSystem, setTripletSystem] = useState<DeckSystem>(DEFAULT_DECK_SYSTEM);
  const [tripletMasterId, setTripletMasterId] = useState("");
  const [masters, setMasters] = useState<ShowcaseMaster[]>(() => getAiMasters());
  const [savedReadings, setSavedReadings] = useState<StoredReadingRow[]>([]);
  const [tripletCooldown, setTripletCooldown] = useState<TripletCooldownStatus | null>(null);
  const [tripletCooldownReady, setTripletCooldownReady] = useState(false);
  const [tripletNotice, setTripletNotice] = useState<string | null>(null);
  const [guestResumeCanRetry, setGuestResumeCanRetry] = useState(false);

  /** Leave chat/salon and show birth profile form — never leave selectedCharacter set. */
  const forceProfileOnboarding = useCallback(() => {
    markNeedsServerProfile();
    patchGuestResumeUiCache({ phase: "onboarding_required" });
    const deps = chat();
    if (deps) {
      deps.setSelectedCharacter(null);
      deps.setMessages([]);
      deps.setConsultationSessionId(null);
      if (deps.consultationSessionIdRef) {
        deps.consultationSessionIdRef.current = null;
      }
      deps.chatLoadedForRef.current = null;
      deps.setIsLoadingHistory(false);
    } else {
      setSelectedCharacter(null);
    }
    readingInFlightRef.current = false;
    setGuestResumeCanRetry(false);
    setTripletNotice(null);
    setStepState("onboarding");
    persistStep("onboarding");
  }, [setSelectedCharacter, setStepState, readingInFlightRef]);

  const [serverContinueIds, setServerContinueIds] = useState<string[]>([]);
  const [newTripletDraft, setNewTripletDraft] = useState(false);
  const [spreadRitual, setSpreadRitual] = useState<{
    active: boolean;
    cards?: DeckCardInput[];
    system?: DeckSystem;
  }>({ active: false });
  const [sessionIntention, setSessionIntention] = useState<
    SessionIntention | SessionTopicId | null
  >(null);
  const [showSessionFlow, setShowSessionFlow] = useState(false);
  const [sessionFlowInitialTopic, setSessionFlowInitialTopic] = useState<
    SessionTopicId | null
  >(null);
  const [sessionFlowPreselectedMaster, setSessionFlowPreselectedMaster] = useState<
    string | null
  >(null);
  const [intentionHighlight, setIntentionHighlight] = useState(false);
  const [intentionSpreadLoading, setIntentionSpreadLoading] = useState(false);
  const [readingRitualActive, setReadingRitualActive] = useState(false);
  const [readingRitualCountdownDone, setReadingRitualCountdownDone] = useState(true);
  const [spreadReadingRitualOpen, setSpreadReadingRitualOpen] = useState(false);

  const openSpreadReadingRitual = () => {
    setSpreadReadingRitualOpen(true);
    setReadingRitualActive(true);
    setReadingRitualCountdownDone(false);
  };

  const closeSpreadReadingRitual = () => {
    setSpreadReadingRitualOpen(false);
    setReadingRitualActive(false);
    setReadingRitualCountdownDone(true);
  };
  const [intentionSpread, setIntentionSpread] = useState<{
    masterId: string;
    cards: SpreadSymbol[];
    system: DeckSystem;
    intention: SessionIntention | SessionTopicId;
  } | null>(null);
  const [chatSessionSpread, setChatSessionSpread] = useState<{
    masterId: string;
    cards: SpreadSymbol[];
    system: DeckSystem;
    periodScope?: PeriodSpreadScope;
  } | null>(null);
  const [pendingMasterId, setPendingMasterId] = useState<string | null>(null);
  const [spreadFlipped, setSpreadFlipped] = useState([false, false, false]);
  const [hideChatSpread, setHideChatSpread] = useState(false);

  const spreadReadingRecoveryKeyRef = useRef<string | null>(null);
  const autoResumeDoneRef = useRef(false);
  const newTripletInProgressRef = useRef(false);
  const pendingReadingResumeRef = useRef<string | null>(null);
  const profileSaveAuthorityRef = useRef<{
    profileUserId: string;
    expiresAt: number;
  } | null>(null);
  const sessionSpreadMetaRef = useRef<{
    spreadType?: "daily" | "new" | "photo" | "guest_resume";
    spreadId?: SpreadId | string;
    cardNames?: string[];
    periodSpreadScope?: PeriodSpreadScope;
    numerologToolId?: import("@/lib/numerology/tools").NumerologToolId;
    numerologToolParams?: import("@/lib/numerology/tools").NumerologToolParams;
    matrixSubjectId?: string | null;
    matrixBirthDate?: string | null;
    subjectName?: string | null;
  } | null>(null);
  /** Subject birth for destiny-matrix grid (must be state — ref alone won't recompute display). */
  const [matrixSessionBirthDate, setMatrixSessionBirthDate] = useState<string | null>(null);
  const [matrixSessionSubjectName, setMatrixSessionSubjectName] = useState<string | null>(null);
  /** Reopened session's start day — keeps year/month/age points matching the saved text. */
  const [matrixSessionAsOf, setMatrixSessionAsOf] = useState<string | null>(null);
  const tripletPendingRef = useRef<{ cards: SpreadSymbol[]; teaser: string } | null>(null);
  const tripletDrawnAtRef = useRef(0);
  const bindSessionToMasterRef = useRef<(masterId: string, overrideSessionId?: string) => Promise<void>>(
    async () => {}
  );
  type GuestResumeLoadArgs = {
    sessionId: string;
    masterId: string;
    question: string;
    cards: Array<{ id: number; name: string; position: number; reversed: boolean }>;
    profileBase?: StoredProfile | null;
    questionFallback?: string;
    teaserFallback?: string;
    deckSystem?: StoredProfile["deckSystem"];
  };
  const loadGuestResumeReadingRef = useRef<
    (args: GuestResumeLoadArgs) => Promise<"full" | "existing" | "failed">
  >(async () => "failed");
  const guestResumeBootRef = useRef(false);
  /** Prevents stampeding /api/guest-triplet/status when effect deps churn. */
  const guestResumeHydrateAttemptedRef = useRef(false);
  const sessionListBackMasterRef = useRef<string | null>(null);
  const pendingChatOptsRef = useRef<{ masterId: string; skipReading: boolean } | null>(null);
  const openChatWithSessionParamsRef = useRef<
    (params: SessionStartParams) => Promise<void>
  >(async () => {});

  const effectiveTripletCooldown = useMemo(
    () => mergeTripletCooldownWithAnchors(tripletCooldown, profile?.lastTripletDrawAt),
    [tripletCooldown, profile?.lastTripletDrawAt]
  );

  const tripletCountdown = useTripletCountdown(effectiveTripletCooldown.nextAvailableAt);

  useEffect(() => {
    if (!intentionSpreadLoading) return;
    const timer = window.setTimeout(() => {
      setIntentionSpreadLoading(false);
    }, 160_000);
    return () => window.clearTimeout(timer);
  }, [intentionSpreadLoading]);

  useEffect(() => {
    if (intentionSpreadLoading) {
      spreadReadingRecoveryKeyRef.current = null;
    }
  }, [intentionSpreadLoading]);

  useEffect(() => {
    fetch("/api/masters")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.masters?.length) {
          setMasters(data.masters as ShowcaseMaster[]);
        }
      })
      .catch(() => undefined);
  }, []);

  const getActiveProfile = useCallback((): StoredProfile | null => {
    return mergeActiveProfile(profile, readStoredProfileSpread());
  }, [profile]);

  const displayTarotCards = useMemo((): SpreadSymbol[] => {
    const draftInProgress = newTripletDraft || step === "triplet";
    if (isLoggedIn || authLoading) {
      if (authLoading && !draftInProgress) return [];
      if (draftInProgress) {
        const local = resolveRecapSpread(profile, tripletSystem);
        return local.cards.length >= 3 ? local.cards : [];
      }
      if (hasServerTripletSpread(savedReadings)) {
        const latest = resolveTripletDisplaySpread(savedReadings, null, tripletSystem);
        return latest.cards.length >= 3 ? latest.cards : [];
      }
      // Guest resume / post-anketa: keep cards visible until server history lands.
      const local = resolveRecapSpread(profile, tripletSystem);
      if (local.cards.length >= 3) return local.cards;
      const uiCache = loadGuestResumeUiCache();
      if (uiCache?.cards?.length === 3) {
        const system = (uiCache.system as DeckSystem) || tripletSystem;
        const ordered = [...uiCache.cards].sort((a, b) => a.position - b.position);
        return reconcileSpreadDeck(system, ordered).cards;
      }
      return [];
    }
    const latest = resolveTripletDisplaySpread(savedReadings, profile, tripletSystem);
    return latest.cards.length >= 3 ? latest.cards : [];
  }, [profile, tripletSystem, savedReadings, isLoggedIn, authLoading, newTripletDraft, step]);

  const displayDeckSystem = useMemo((): DeckSystem => {
    const draftInProgress = newTripletDraft || step === "triplet";
    if (isLoggedIn || authLoading) {
      if (authLoading && !draftInProgress) return profile?.deckSystem ?? tripletSystem;
      if (draftInProgress) {
        const local = resolveRecapSpread(profile, tripletSystem);
        return local.cards.length >= 3 ? local.system : (profile?.deckSystem ?? tripletSystem);
      }
      if (hasServerTripletSpread(savedReadings)) {
        const latest = resolveTripletDisplaySpread(savedReadings, null, tripletSystem);
        return latest.cards.length >= 3 ? latest.system : (profile?.deckSystem ?? tripletSystem);
      }
      const local = resolveRecapSpread(profile, tripletSystem);
      if (local.cards.length >= 3) return local.system;
      const uiCache = loadGuestResumeUiCache();
      if (uiCache?.system) return (uiCache.system as DeckSystem) || tripletSystem;
      return profile?.deckSystem ?? tripletSystem;
    }
    const latest = resolveTripletDisplaySpread(savedReadings, profile, tripletSystem);
    return latest.cards.length >= 3 ? latest.system : (profile?.deckSystem ?? tripletSystem);
  }, [savedReadings, profile, tripletSystem, isLoggedIn, authLoading, newTripletDraft, step]);

  const tripletOwnerMasterId = useMemo(
    () =>
      resolveTripletOwnerMasterId(profile, savedReadings, {
        tripletMasterId,
      }),
    [profile, savedReadings, tripletMasterId]
  );

  const tripletCooldownHint = useMemo(() => {
    if (tripletCountdown.isOnCooldown && tripletCountdown.hintRu) return tripletCountdown.hintRu;
    if (!effectiveTripletCooldown.nextAvailableAt) return undefined;
    return `Новый расклад из 3 карт ${formatTripletCooldownRu(effectiveTripletCooldown.nextAvailableAt)}`;
  }, [
    tripletCountdown.isOnCooldown,
    tripletCountdown.hintRu,
    effectiveTripletCooldown.nextAvailableAt,
  ]);

  const syncProfileFromServer = useCallback(async () => {
    const res = await fetch("/api/profile");
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.profile) return null;

    if (Array.isArray(data.readings)) {
      setSavedReadings(mapProfileReadings(data.readings));
    }
    if (Array.isArray(data.continueMasterIds)) {
      setServerContinueIds(data.continueMasterIds);
    }

    const cooldown = tripletCooldownFromProfileData(data);
    setTripletCooldown(cooldown);
    setTripletCooldownReady(true);
    if (!cooldown.lastTripletAt) {
      clearLocalTripletDrawAt();
    }

    const restored = profileFromApiPayload({
      profile: data.profile,
      profileUserId: data.profileUserId,
      readings: data.readings,
    });

    setProfile((prev) => {
      const localCards = prev?.tarotCards?.length ?? 0;
      const next = mergeProfileWithServer(restored, prev, newTripletInProgressRef.current);
      if (next.tarotCards.length < 3 && localCards >= 3) {
        clearSpreadSessionState(setLastMasterId);
      }
      localStorage.setItem(PROFILE_KEY, JSON.stringify(next));
      return next;
    });
    return { data, cooldown, profile: restored };
  }, [setProfile, setLastMasterId]);

  const refreshSavedReadings = useCallback(() => {
    if (!isLoggedIn) return;
    fetch("/api/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!Array.isArray(data?.readings)) return;
        setSavedReadings(mapProfileReadings(data.readings));
        if (Array.isArray(data.continueMasterIds)) {
          setServerContinueIds(data.continueMasterIds);
        }

        setTripletCooldown(tripletCooldownFromProfileData(data));

        if (data.profile && !newTripletInProgressRef.current) {
          const restored = profileFromApiPayload({
            profile: data.profile,
            profileUserId: data.profileUserId,
            readings: data.readings,
          });
          setProfile((prev) => {
            const localCards = prev?.tarotCards?.length ?? 0;
            const next = mergeProfileWithServer(restored, prev, false);
            localStorage.setItem(PROFILE_KEY, JSON.stringify(next));
            return next;
          });
        }

        fetch("/api/runes/balance")
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => onRuneBalancePayload?.(d))
          .catch(() => undefined);
      })
      .catch(() => undefined);
  }, [isLoggedIn, setProfile, onRuneBalancePayload]);

  useEffect(() => {
    if (!isLoggedIn) return;

    fetch("/api/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.profile) {
          const local = readStoredProfile();
          if (String(local?.birthDate ?? "").trim() && !hasPendingServerProfile()) {
            setStepState((prev) => {
              if (prev === "chat") return prev;
              if (prev === "onboarding") {
                return (local?.tarotCards?.length ?? 0) >= 3 ? "masters" : "triplet";
              }
              return prev;
            });
            clearOnboardingUrlParams();
            return;
          }
          setStepState((prev) => (prev === "chat" ? prev : "onboarding"));
          persistStep("onboarding");
          return;
        }

        if (Array.isArray(data.readings)) {
          setSavedReadings(mapProfileReadings(data.readings));
        }
        if (Array.isArray(data.continueMasterIds)) {
          setServerContinueIds(data.continueMasterIds);
        }

        setTripletCooldown(tripletCooldownFromProfileData(data));

        const restored = profileFromApiPayload({
          profile: data.profile,
          profileUserId: data.profileUserId,
          readings: data.readings,
        });

        setProfile((prev) => {
          const localCards = prev?.tarotCards?.length ?? 0;
          const next = mergeProfileWithServer(restored, prev, newTripletInProgressRef.current);
          if (next.tarotCards.length < 3 && localCards >= 3) {
            clearSpreadSessionState(setLastMasterId);
          }
          localStorage.setItem(PROFILE_KEY, JSON.stringify(next));
          return next;
        });

        if (restored.tarotCards.length >= 3) {
          setStepState((prev) => {
            if (prev === "chat") return prev;
            if (prev === "intro") return "masters";
            if (prev === "triplet" && !newTripletInProgressRef.current) return "masters";
            return prev;
          });
        } else if (data.profile.birthDate) {
          setStepState((prev) => {
            if (prev === "chat") return prev;
            if (prev === "onboarding") {
              return restored.tarotCards.length >= 3 ? "masters" : "triplet";
            }
            return prev === "intro" ? "masters" : prev;
          });
        }
      })
      .catch(() => undefined)
      .finally(() => setTripletCooldownReady(true));
  }, [isLoggedIn, setProfile, setLastMasterId, setStepState]);

  useEffect(() => {
    if (!isLoggedIn) return;
    const resync = () => {
      if (document.visibilityState !== "visible") return;
      void syncProfileFromServer();
    };
    document.addEventListener("visibilitychange", resync);
    window.addEventListener("focus", resync);
    return () => {
      document.removeEventListener("visibilitychange", resync);
      window.removeEventListener("focus", resync);
    };
  }, [isLoggedIn, syncProfileFromServer]);

  useEffect(() => {
    if (!isLoggedIn || newTripletDraft || step === "triplet" || step === "onboarding") return;
    // Never wipe local cards while guest resume is in progress / awaiting reading.
    if (loadGuestResumeUiCache()) return;
    if (sessionSpreadMetaRef.current?.spreadType === "guest_resume") return;
    if (hasServerTripletSpread(savedReadings)) return;
    setProfile((prev) => {
      if (!prev) return prev;
      const hasLocalSpread =
        (prev.tarotCards?.length ?? 0) >= 3 ||
        Object.values(prev.deckSpreads ?? {}).some((s) => (s?.length ?? 0) >= 3);
      if (!hasLocalSpread && !prev.teaser && !prev.tripletMasterId) return prev;
      const next = {
        ...prev,
        tarotCards: [] as SpreadSymbol[],
        deckSystem: undefined,
        deckSpreads: undefined,
        teaser: undefined,
        tripletMasterId: undefined,
      };
      localStorage.setItem(PROFILE_KEY, JSON.stringify(next));
      clearSpreadSessionState(setLastMasterId);
      return next;
    });
  }, [isLoggedIn, savedReadings, newTripletDraft, step, setProfile, setLastMasterId]);

  const continueMasterIds = useMemo(() => {
    if (displayTarotCards.length < 3 || !tripletOwnerMasterId) return [];
    const cardsKey = spreadKey(displayTarotCards);
    if (!cardsKey) return [];
    if (masterHasReadingForSpread(savedReadings, tripletOwnerMasterId, cardsKey)) {
      return [tripletOwnerMasterId];
    }
    // Guest or local triplet without server reading yet — still guide user to bound master.
    if ((profile?.tarotCards?.length ?? 0) >= 3) {
      return [tripletOwnerMasterId];
    }
    return [];
  }, [savedReadings, displayTarotCards, tripletOwnerMasterId, profile?.tarotCards?.length]);

  const hasActiveSpread = displayTarotCards.length >= 3;
  const spreadReadingDone = useMemo(() => {
    if (displayTarotCards.length < 3 || !tripletOwnerMasterId) return false;
    const cardsKey = spreadKey(displayTarotCards);
    return Boolean(
      cardsKey && masterHasReadingForSpread(savedReadings, tripletOwnerMasterId, cardsKey)
    );
  }, [savedReadings, displayTarotCards, tripletOwnerMasterId]);

  const recapContinueMasterId = useMemo(
    () => (hasActiveSpread ? tripletOwnerMasterId : null),
    [hasActiveSpread, tripletOwnerMasterId]
  );

  const applyTripletMaster = useCallback(
    (masterId: string) => {
      if (!masterId || !findShowcaseMaster(masterId, masters)) return;
      setTripletMasterId(masterId);
      const master = findShowcaseMaster(masterId, masters);
      setTripletSystem(master?.system ?? resolveMasterDeckSystem(masterId));
      setProfile((prev) => {
        if (!prev) return prev;
        const next = { ...prev, tripletMasterId: masterId };
        localStorage.setItem(PROFILE_KEY, JSON.stringify(next));
        return next;
      });
    },
    [masters, setProfile]
  );

  const canChangeTripletMaster = useMemo(() => {
    if (newTripletDraft) return true;
    if (!profile) return true;
    return getSpreadForSystem(profile, tripletSystem).length < 3;
  }, [newTripletDraft, profile, tripletSystem]);

  const handleTripletMasterChange = useCallback(
    (masterId: string) => {
      if (!canChangeTripletMaster) return;
      applyTripletMaster(masterId);
    },
    [canChangeTripletMaster, applyTripletMaster]
  );

  const handleTripletDraft = useCallback((cards: SpreadSymbol[], teaser: string) => {
    tripletPendingRef.current = { cards, teaser };
  }, []);

  useEffect(() => {
    if (step !== "triplet" || masters.length === 0) return;
    if (tripletMasterId && findShowcaseMaster(tripletMasterId, masters)) return;

    const pending = localStorage.getItem(PENDING_MASTER_KEY);
    const fallback = resolveDefaultTripletMasterId(masters, {
      pending,
      recapMasterId: recapContinueMasterId,
      tarotCards: displayTarotCards,
    });
    if (fallback) {
      applyTripletMaster(fallback);
    }
  }, [
    step,
    masters,
    tripletMasterId,
    recapContinueMasterId,
    displayTarotCards,
    applyTripletMaster,
  ]);

  const displayTeaser = useMemo(() => {
    const useLocalProfile = !isLoggedIn || newTripletDraft || step === "triplet";
    if (isLoggedIn && !useLocalProfile && !hasServerTripletSpread(savedReadings)) {
      // Keep guest teaser while resume/history catch up after anketa.
      const uiCache = loadGuestResumeUiCache();
      return profile?.teaser ?? uiCache?.teaser ?? undefined;
    }
    const triplet = savedReadings
      .filter((r) => r.characterName === "triplet")
      .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))[0];
    const fromServer =
      typeof (triplet?.contextData as { teaser?: string } | undefined)?.teaser === "string"
        ? (triplet!.contextData as { teaser: string }).teaser
        : undefined;
    return fromServer ?? profile?.teaser;
  }, [savedReadings, profile?.teaser, isLoggedIn, newTripletDraft, step]);

  const spreadCardsKey = useMemo(() => spreadKey(displayTarotCards), [displayTarotCards]);

  const chatSpread = useMemo(() => {
    if (!selectedCharacter) return null;
    return resolveMasterSpread(profile, selectedCharacter, masters);
  }, [selectedCharacter, profile, masters]);

  const activeSpreadCardsKey = useMemo(() => {
    if (selectedCharacter && isNumerologMaster(selectedCharacter)) {
      const toolId = resolveNumerologToolId(
        sessionSpreadMetaRef.current?.spreadId,
        sessionSpreadMetaRef.current?.numerologToolId
      );
      if (numerologToolDrawCount(toolId) === 0) {
        return `${selectedCharacter}:${encodeNumerologSpreadId(toolId)}:no-draw`;
      }
    }
    if (
      sessionSpreadMetaRef.current?.spreadType === "new" &&
      (sessionSpreadMetaRef.current?.cardNames?.length ?? 0) > 0
    ) {
      const metaSpreadId = normalizeSpreadId(sessionSpreadMetaRef.current?.spreadId);
      const names = sessionSpreadMetaRef.current!.cardNames!;
      if (hasCompleteSpread(names, metaSpreadId, "new")) {
        return spreadKey(names.map((name) => ({ name })));
      }
    }
    if (intentionSpread?.masterId === selectedCharacter && intentionSpread.cards.length) {
      return spreadKey(intentionSpread.cards);
    }
    if (selectedCharacter) {
      const persisted = readIntentionSpreadForMaster(selectedCharacter);
      if (persisted?.cards.length) {
        return persisted.cardsKey || spreadKey(persisted.cards);
      }
    }
    if (
      chatSessionSpread?.periodScope &&
      chatSessionSpread.masterId === selectedCharacter &&
      chatSessionSpread.cards.length
    ) {
      return spreadKey(chatSessionSpread.cards);
    }
    if (chatSpread?.cardsKey && hasCompleteSpread(chatSpread.cards.map((c) => c.name), DEFAULT_SPREAD_ID, "daily")) {
      return chatSpread.cardsKey;
    }
    return spreadCardsKey;
  }, [intentionSpread, selectedCharacter, chatSpread, spreadCardsKey, sessionSpreadMetaRef, chatSessionSpread]);

  const shouldAutoLoadSpreadReading = useCallback(
    (masterId: string, cardsKey: string) => {
      const deps = chat();
      if (!cardsKey || deps?.sessionOnlyChat) return false;
      if (deps && chatHasSpreadReading(deps.messages)) return false;
      if (sessionSpreadMetaRef.current?.spreadType === "photo") return false;
      if (sessionSpreadMetaRef.current?.spreadType === "new") return false;
      if (sessionIntention) return false;
      if (
        hasActivePeriodSpread(sessionSpreadMetaRef.current) ||
        chatSessionSpread?.periodScope
      ) {
        return false;
      }

      if (sessionSpreadMetaRef.current?.spreadType === "daily") {
        return !masterHasReadingForSpread(savedReadings, masterId, cardsKey);
      }

      if (intentionSpread?.masterId === masterId && intentionSpread.cards.length) {
        if (masterHasReadingForSpread(savedReadings, masterId, cardsKey)) return true;
        return false;
      }

      if (tripletOwnerMasterId && masterId !== tripletOwnerMasterId) return false;
      if (masterHasReadingForSpread(savedReadings, masterId, cardsKey)) return true;
      if (anyMasterReadingForSpread(savedReadings, cardsKey, masterId)) return false;
      return true;
    },
    [savedReadings, intentionSpread, sessionIntention, selectedCharacter, tripletOwnerMasterId, chatDepsRef, sessionSpreadMetaRef, chatSessionSpread?.periodScope]
  );

  const cachedChatSpread = useMemo((): CachedChatSpread | null => {
    const deps = chat();
    if (!selectedCharacter || deps?.sessionOnlyChat || typeof window === "undefined") return null;
    const entry = loadChatCacheEntry(selectedCharacter);
    if (!entry?.spread?.cards.length) return null;
    const variant = entry.spread.variant ?? "triplet";
    const spreadType =
      variant === "photo" ? "photo" : variant === "intention" ? "new" : "daily";
    const spreadId =
      variant === "intention"
        ? normalizeSpreadId(sessionSpreadMetaRef.current?.spreadId)
        : DEFAULT_SPREAD_ID;
    const names = entry.spread.cards.map((c) => c.name);
    if (hasCompleteSpread(names, spreadId, spreadType)) {
      return entry.spread;
    }
    return null;
  }, [
    selectedCharacter,
    chatDepsRef,
    intentionSpread?.cards.length,
    activeSpreadCardsKey,
  ]);

  const chatDisplaySpread = useMemo((): {
    source: "photo" | "triplet" | "intention" | "master" | "numerolog" | "period";
    cards: SpreadSymbol[] | DeckCardInput[];
    system: DeckSystem;
    spreadId: SpreadId | string;
    cardCount?: number;
    positions?: string[];
    periodScope?: PeriodSpreadScope;
    computedOnly?: boolean;
    pythagorasSquare?: import("@/lib/numerology/pythagoras-square").PythagorasSquareResult;
    destinyMatrix?: import("@/lib/numerology/destiny-matrix").DestinyMatrixResult;
  } | null => {
    const deps = chat();
    if (deps?.sessionOnlyChat || hideChatSpread) return null;

    const resolvePhotoSpread = (): {
      source: "photo";
      cards: DeckCardInput[];
      system: DeckSystem;
      spreadId: SpreadId;
    } | null => {
      if (
        photoChatSpread?.masterId === selectedCharacter &&
        photoChatSpread.cards.length > 0
      ) {
        return {
          source: "photo",
          cards: photoChatSpread.cards,
          system: photoChatSpread.system,
          spreadId: DEFAULT_SPREAD_ID,
        };
      }
      if (
        cachedChatSpread?.variant === "photo" &&
        cachedChatSpread.cards.length > 0
      ) {
        return {
          source: "photo",
          cards: cachedChatSpread.cards,
          system: cachedChatSpread.system,
          spreadId: DEFAULT_SPREAD_ID,
        };
      }
      return null;
    };

    const photoSpread = resolvePhotoSpread();
    if (photoSpread) return photoSpread;

    // Numerolog sessions use a per-tool number of "cards" (drawCount). Resolve them
    // explicitly so the chat never falls back to the user's 3-card tarot triplet.
    if (selectedCharacter && isNumerologMaster(selectedCharacter)) {
      const toolId = resolveNumerologToolId(
        sessionSpreadMetaRef.current?.spreadId,
        sessionSpreadMetaRef.current?.numerologToolId
      );
      const drawCount = numerologToolDrawCount(toolId);
      if (numerologComputedOnlyTool(toolId)) {
        const subjectBirth =
          matrixSessionBirthDate?.trim() ||
          sessionSpreadMetaRef.current?.matrixBirthDate?.trim() ||
          sessionSpreadMetaRef.current?.numerologToolParams?.matrixBirthDate?.trim() ||
          null;
        const birthDate =
          subjectBirth ||
          getActiveProfile()?.birthDate ||
          profile?.birthDate ||
          null;
        return {
          source: "numerolog" as const,
          cards: [],
          system: resolveMasterDeckSystem(selectedCharacter),
          spreadId: encodeNumerologSpreadId(toolId),
          cardCount: 0,
          positions: [],
          computedOnly: true,
          ...(toolId === "pythagoras" && birthDate
            ? { pythagorasSquare: pythagorasSquare(birthDate) ?? undefined }
            : {}),
          ...((toolId === "destiny_matrix" ||
            toolId === "child_matrix" ||
            toolId === "matrix_year_forecast") &&
          birthDate
            ? {
                destinyMatrix:
                  destinyMatrix(birthDate, matrixOptionsForTimestamp(matrixSessionAsOf)) ??
                  undefined,
              }
            : {}),
        };
      }

      const metaNames = sessionSpreadMetaRef.current?.cardNames ?? [];
      const cardNames = ((): string[] | null => {
        if (metaNames.length >= drawCount) return metaNames.slice(0, drawCount);
        if (
          chatSessionSpread?.masterId === selectedCharacter &&
          chatSessionSpread.cards.length >= drawCount
        ) {
          return chatSessionSpread.cards.map((c) => c.name).slice(0, drawCount);
        }
        if ((cachedChatSpread?.cards.length ?? 0) >= drawCount) {
          return cachedChatSpread!.cards.map((c) => c.name).slice(0, drawCount);
        }
        const savedNumerolog = savedReadings
          .filter(
            (r) =>
              r.characterName === selectedCharacter &&
              Array.isArray(r.contextData?.tarotCards) &&
              (r.contextData?.tarotCards?.length ?? 0) >= drawCount
          )
          .sort(
            (a, b) =>
              new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime()
          )[0];
        const saved = savedNumerolog?.contextData?.tarotCards as SpreadSymbol[] | undefined;
        if (saved?.length) {
          return saved.map((c) => c.name).slice(0, drawCount);
        }
        return null;
      })();

      if (!cardNames || cardNames.length < drawCount) return null;

      const previewDeck =
        chatSessionSpread?.masterId === selectedCharacter
          ? chatSessionSpread.system
          : cachedChatSpread?.system;
      const { spreadCards, system } = buildNumerologSpreadCards(
        selectedCharacter,
        cardNames,
        toolId,
        { deckSystem: previewDeck }
      );

      return {
        source: "numerolog" as const,
        cards: spreadCards,
        system,
        spreadId: encodeNumerologSpreadId(toolId),
        cardCount: drawCount,
        positions: numerologToolPositions(toolId),
      };
    }

    const metaSpreadId = normalizeSpreadId(sessionSpreadMetaRef.current?.spreadId ?? DEFAULT_SPREAD_ID);
    const metaSpreadType = sessionSpreadMetaRef.current?.spreadType;
    const metaCardNames = sessionSpreadMetaRef.current?.cardNames ?? [];
    const requiredIntentionCards = getSpread(metaSpreadId).cardCount;
    const isActiveIntentionSession =
      Boolean(sessionIntention) ||
      (metaSpreadType === "new" &&
        Boolean(selectedCharacter) &&
        metaCardNames.length >= requiredIntentionCards &&
        !isNumerologMaster(selectedCharacter ?? ""));

    const resolveSavedIntentionSpread = (): {
      source: "intention";
      cards: SpreadSymbol[];
      system: DeckSystem;
      spreadId: SpreadId | string;
    } | null => {
      if (!selectedCharacter) return null;

      const persisted = readIntentionSpreadForMaster(selectedCharacter);
      if (persisted?.cards.length) {
        return {
          source: "intention",
          cards: persisted.cards as SpreadSymbol[],
          system: persisted.system,
          spreadId: metaSpreadId,
        };
      }

      const saved = savedReadings
        .filter((r) => {
          if (r.characterName !== selectedCharacter) return false;
          if (r.contextData?.type !== "intention_spread") return false;
          const ctx = r.contextData as {
            tarotCards?: { name?: string }[];
            spreadId?: string;
          };
          const names = (ctx.tarotCards ?? [])
            .map((c) => c?.name?.trim())
            .filter(Boolean) as string[];
          const savedSpreadId = typeof ctx.spreadId === "string" ? ctx.spreadId : metaSpreadId;
          return hasCompleteSpread(names, savedSpreadId, "new");
        })
        .sort(
          (a, b) =>
            new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime()
        )[0];

      if (!saved?.contextData?.tarotCards) return null;
      const ctx = saved.contextData as {
        tarotCards: SpreadSymbol[];
        deckSystem?: DeckSystem;
        system?: DeckSystem;
        spreadId?: string;
      };
      const masterCtx = resolveMasterSpread(profile, selectedCharacter, masters);
      return {
        source: "intention",
        cards: ctx.tarotCards,
        system: ctx.deckSystem ?? ctx.system ?? masterCtx.system,
        spreadId: (typeof ctx.spreadId === "string" ? ctx.spreadId : metaSpreadId) as SpreadId,
      };
    };

    const resolveActiveIntentionDisplay = (): {
      source: "intention";
      cards: SpreadSymbol[];
      system: DeckSystem;
      spreadId: SpreadId | string;
    } | null => {
      if (!isActiveIntentionSession || !selectedCharacter) return null;

      const masterCtx = resolveMasterSpread(profile, selectedCharacter, masters);

      // Session meta is set synchronously at spread start — wins over stale React state.
      if (metaSpreadType === "new" && metaCardNames.length >= requiredIntentionCards) {
        const symbols = resolveSpreadSymbols(
          masterCtx.system,
          metaCardNames.slice(0, requiredIntentionCards)
        );
        const fromMeta = buildIntentionChatSpreadDisplay({
          cards: symbols,
          system: masterCtx.system,
          spreadId: metaSpreadId,
        });
        if (fromMeta) return fromMeta;
      }

      if (
        intentionSpread?.masterId === selectedCharacter &&
        spreadCardsMatchSpreadId(intentionSpread.cards, metaSpreadId)
      ) {
        return (
          buildIntentionChatSpreadDisplay({
            cards: intentionSpread.cards,
            system: intentionSpread.system,
            spreadId: metaSpreadId,
          }) ?? null
        );
      }

      const persisted = readIntentionSpreadForMaster(selectedCharacter);
      if (persisted?.cards.length && spreadCardsMatchSpreadId(persisted.cards, metaSpreadId)) {
        return (
          buildIntentionChatSpreadDisplay({
            cards: persisted.cards as SpreadSymbol[],
            system: persisted.system,
            spreadId: metaSpreadId,
          }) ?? null
        );
      }

      return null;
    };

    const periodScope =
      chatSessionSpread?.periodScope ?? sessionSpreadMetaRef.current?.periodSpreadScope;
    const periodCardNames = sessionSpreadMetaRef.current?.cardNames ?? [];

    if (periodScope && selectedCharacter && periodCardNames.length >= 3) {
      const masterCtx = resolveMasterSpread(profile, selectedCharacter, masters);
      const cards =
        chatSessionSpread?.masterId === selectedCharacter &&
        chatSessionSpread.cards.length >= 3
          ? chatSessionSpread.cards
          : buildSessionSpreadCards(selectedCharacter, periodCardNames).spreadCards;
      return {
        source: "period" as const,
        cards,
        system: chatSessionSpread?.system ?? masterCtx.system,
        spreadId: DEFAULT_SPREAD_ID,
        periodScope,
        positions: [...periodSpreadPositions(periodScope)],
      };
    }

    const activeIntentionDisplay = resolveActiveIntentionDisplay();
    if (activeIntentionDisplay) return activeIntentionDisplay;

    if (isActiveIntentionSession) return null;

    if (
      !isActiveIntentionSession &&
      !periodScope &&
      chatSessionSpread?.masterId === selectedCharacter &&
      hasCompleteSpread(
        chatSessionSpread.cards.map((c) => c.name),
        DEFAULT_SPREAD_ID,
        "daily"
      )
    ) {
      return {
        source: "triplet" as const,
        cards: chatSessionSpread.cards,
        system: chatSessionSpread.system,
        spreadId: DEFAULT_SPREAD_ID,
      };
    }

    const persistedSpread = resolveSavedIntentionSpread();
    if (persistedSpread) return persistedSpread;

    if (intentionSpread?.masterId === selectedCharacter && intentionSpread.cards.length) {
      return {
        source: "intention" as const,
        cards: intentionSpread.cards,
        system: intentionSpread.system,
        spreadId: metaSpreadId,
      };
    }

    if (cachedChatSpread?.cards.length) {
      return {
        source:
          cachedChatSpread.variant === "intention"
            ? ("intention" as const)
            : cachedChatSpread.variant === "photo"
              ? ("photo" as const)
              : ("triplet" as const),
        cards: cachedChatSpread.cards as SpreadSymbol[],
        system: cachedChatSpread.system,
        spreadId: metaSpreadId,
      };
    }

    if (sessionIntention) {
      const fromSaved = resolveSavedIntentionSpread();
      if (fromSaved) return fromSaved;
    }

    if (
      chatSpread &&
      !isActiveIntentionSession &&
      sessionSpreadMetaRef.current?.spreadType !== "new" &&
      !sessionIntention &&
      hasCompleteSpread(
        chatSpread.cards.map((c) => c.name),
        DEFAULT_SPREAD_ID,
        "daily"
      )
    ) {
      return {
        source: "master" as const,
        cards: chatSpread.cards,
        system: chatSpread.system,
        spreadId: DEFAULT_SPREAD_ID,
      };
    }
    if (
      !isActiveIntentionSession &&
      !sessionIntention &&
      sessionSpreadMetaRef.current?.spreadType !== "new" &&
      displayTarotCards.length >= 3
    ) {
      return {
        source: "triplet" as const,
        cards: displayTarotCards,
        system: displayDeckSystem,
        spreadId: DEFAULT_SPREAD_ID,
      };
    }

    if (
      selectedCharacter &&
      sessionSpreadMetaRef.current?.spreadType === "photo"
    ) {
      const photoFromSaved = resolvePhotoSpreadFromReadings(savedReadings, selectedCharacter);
      if (photoFromSaved?.cards.length) {
        return {
          source: "photo" as const,
          cards: photoFromSaved.cards,
          system: photoFromSaved.system,
          spreadId: DEFAULT_SPREAD_ID,
        };
      }
    }

    if (selectedCharacter) {
      const fromSaved = resolveSavedIntentionSpread();
      if (fromSaved) return fromSaved;

      const latestMasterSpread = savedReadings
        .filter((r) => {
          if (r.characterName !== selectedCharacter) return false;
          const type = r.contextData?.type;
          if (type !== "reading" && type !== "intention_spread") return false;
          return (
            Array.isArray(r.contextData?.tarotCards) &&
            r.contextData.tarotCards.length >= 3
          );
        })
        .sort(
          (a, b) =>
            new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime()
        )[0];

      if (latestMasterSpread?.contextData?.tarotCards) {
        const ctx = latestMasterSpread.contextData as {
          type?: string;
          tarotCards: SpreadSymbol[];
          deckSystem?: DeckSystem;
          system?: DeckSystem;
        };
        const masterCtx = resolveMasterSpread(profile, selectedCharacter, masters);
        return {
          source:
            ctx.type === "intention_spread" ? ("intention" as const) : ("master" as const),
          cards: ctx.tarotCards,
          system: ctx.deckSystem ?? ctx.system ?? masterCtx.system,
          spreadId:
            ctx.type === "intention_spread"
              ? ((latestMasterSpread.contextData as { spreadId?: string }).spreadId ??
                  metaSpreadId)
              : DEFAULT_SPREAD_ID,
        };
      }
    }

    return null;
  }, [
    chatDepsRef,
    hideChatSpread,
    chatSessionSpread,
    selectedCharacter,
    intentionSpread,
    sessionIntention,
    intentionSpreadLoading,
    savedReadings,
    profile,
    masters,
    photoChatSpread,
    chatSpread,
    displayTarotCards,
    displayDeckSystem,
    cachedChatSpread,
    matrixSessionBirthDate,
    matrixSessionAsOf,
  ]);

  const displaySpreadComplete = (() => {
    const names = chatDisplaySpread?.cards?.map((c) => c.name);
    if (chatDisplaySpread?.source === "numerolog") {
      if (chatDisplaySpread.computedOnly) return true;
      return (names?.length ?? 0) >= (chatDisplaySpread.cardCount ?? 1);
    }
    const spreadIdForComplete =
      chatDisplaySpread?.spreadId ??
      sessionSpreadMetaRef.current?.spreadId ??
      DEFAULT_SPREAD_ID;
    const spreadTypeForComplete =
      chatDisplaySpread?.source === "intention" || chatDisplaySpread?.source === "period"
        ? "new"
        : chatDisplaySpread?.source === "photo"
          ? "photo"
          : sessionSpreadMetaRef.current?.spreadType;
    return hasCompleteSpread(names, spreadIdForComplete, spreadTypeForComplete);
  })();

  const spreadReadingPending =
    !chat()?.insufficientRunes &&
    spreadReadingRitualOpen &&
    !(chat()?.messages && chatHasSpreadReading(chat()!.messages));

  const needsSpreadFlip =
    !chat()?.sessionOnlyChat &&
    chatDisplaySpread?.source !== "photo" &&
    chatDisplaySpread?.source !== "numerolog" &&
    displaySpreadComplete;

  const allSpreadFlipped = !needsSpreadFlip || spreadFlipped.every(Boolean);

  const recommendedId = useMemo(() => {
    if (!masters.length || displayTarotCards.length < 3) return undefined;
    if (tripletOwnerMasterId) return tripletOwnerMasterId;
    return GUEST_TRIPLET_MASTER_ID;
  }, [masters, displayTarotCards, tripletOwnerMasterId]);

  const dailyEnergyMasterId = useMemo(() => {
    if (tripletOwnerMasterId) return tripletOwnerMasterId;
    return (
      recommendedId ??
      lastMasterId ??
      tripletMasterId ??
      masters.find((m) => m.id === "veronika")?.id ??
      masters[0]?.id ??
      "veronika"
    );
  }, [tripletOwnerMasterId, recommendedId, lastMasterId, tripletMasterId, masters]);

  const tripletMasterName = useMemo(() => {
    const id = tripletMasterId || recapContinueMasterId || recommendedId || GUEST_TRIPLET_MASTER_ID;
    return findShowcaseMaster(id, masters)?.name ?? getCharacterById(id)?.name;
  }, [tripletMasterId, recapContinueMasterId, recommendedId, masters]);

  const handleSpreadReadingRitualComplete = useCallback(() => {
    closeSpreadReadingRitual();
    setIntentionSpreadLoading(false);
  }, []);

  const resetSpreadOnAccountSwitch = useCallback(() => {
    setSavedReadings([]);
    setSpreadRitual({ active: false });
  }, []);

  const bindSessionToMaster = useCallback(
    async (masterId: string, overrideSessionId?: string) => {
      let sid = overrideSessionId;
      if (!sid && !session?.offline) {
        try {
          const res = await fetch(
            `/api/sessions?characterKey=${encodeURIComponent(masterId)}`
          );
          if (res.ok) {
            const data = (await res.json()) as { active?: { id?: string } | null };
            if (data.active?.id) sid = data.active.id;
          }
        } catch {
          /* offline ok */
        }
      }
      sid = sid ?? session?.sessionId;
      if (!sid || (session?.offline && !overrideSessionId)) return;

      const deps = chat();
      if (deps) {
        deps.setConsultationSessionId(sid);
        deps.setConsultationReadOnly(false);
        deps.archiveSessionIdRef.current = null;
      }

      const referrerSlugValue = !isAiMasterId(masterId)
        ? masterId
        : referrerSlug
          ? referrerSlug
          : null;

      try {
        await fetch("/api/session", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: sid,
            referrerSlug: referrerSlugValue,
            characterKey: masterId,
          }),
        });
        localStorage.setItem("aura_session_id", sid);
        await refresh(sid);
      } catch {
        /* offline ok */
      }
    },
    [referrerSlug, refresh, session?.offline, session?.sessionId, chatDepsRef]
  );
  bindSessionToMasterRef.current = bindSessionToMaster;

  const ensureMasterChatSessionId = useCallback(
    async (masterId: string, opts?: { forceNew?: boolean }): Promise<string | undefined> => {
      if (session?.offline) return undefined;
      if (!opts?.forceNew) {
        try {
          const res = await fetch(
            `/api/sessions?characterKey=${encodeURIComponent(masterId)}`
          );
          if (res.ok) {
            const data = (await res.json()) as { active?: { id?: string } | null };
            if (data.active?.id) return data.active.id;
          }
        } catch {
          /* offline ok */
        }
      }
      const urlParams = new URLSearchParams(window.location.search);
      const refToken = urlParams.get("ref") ?? referrerSlug ?? null;
      const fresh = await spawnSession(refToken);
      return fresh.sessionId;
    },
    [session?.offline, spawnSession, referrerSlug]
  );

  const archiveActiveMasterSession = useCallback(
    async (masterId: string) => {
      if (session?.offline) return;
      const deps = chat();
      if (!deps) return;
      try {
        let sid: string | null | undefined = deps.consultationSessionIdRef.current;
        if (!sid) {
          sid = await deps.resolveConsultationSessionId(masterId);
        }
        if (!sid) {
          const res = await fetch(
            `/api/sessions?characterKey=${encodeURIComponent(masterId)}`
          );
          if (res.ok) {
            const data = (await res.json()) as { active?: { id?: string } | null };
            sid = data.active?.id;
          }
        }
        if (!sid) return;
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
        if (res.ok || res.status === 409) {
          deps.archiveSessionIdRef.current = sid;
        }
      } catch {
        /* offline ok */
      }
    },
    [session?.offline, chat]
  );

  /** Every new spread starts in a fresh consultation session (archive previous active). */
  const beginNewSpreadSession = useCallback(
    async (masterId: string): Promise<string | undefined> => {
      if (session?.offline) return undefined;
      await archiveActiveMasterSession(masterId);
      const deps = chat();
      deps?.setConsultationSessionId(null);
      if (deps?.consultationSessionIdRef) deps.consultationSessionIdRef.current = null;
      deps?.setConsultationReadOnly(false);
      if (deps?.archiveSessionIdRef) deps.archiveSessionIdRef.current = null;
      return ensureMasterChatSessionId(masterId, { forceNew: true });
    },
    [session?.offline, archiveActiveMasterSession, ensureMasterChatSessionId]
  );

  const handleOnboardingComplete = async (data: OnboardingData) => {
    if (!isLoggedIn) {
      throw new Error("Войдите в аккаунт, чтобы сохранить профиль.");
    }

    const finishProfileOnboarding = async (nextStep: FlowStep) => {
      trackRegistrationCompleted(resolveRegistrationSource("onboarding"));
      clearShareRegistrationAttribution();
      clearOnboardingUrlParams();
      persistStep(nextStep);
      await refreshAuth?.();
      const destination = resolvePostOnboardingDestination();
      if (postOnboardingNeedsHardNavigation(destination) && typeof window !== "undefined") {
        window.location.assign(destination);
        return;
      }
      setStep(nextStep);
    };

    const guestDraft = loadGuestTriplet();
    const uiCacheEarly = loadGuestResumeUiCache();
    const existingCards =
      (profile?.tarotCards?.length ?? 0) >= 3
        ? profile!.tarotCards!
        : (guestDraft?.tarotCards?.length ?? 0) >= 3
          ? guestDraft!.tarotCards
          : uiCacheEarly
            ? [...uiCacheEarly.cards]
                .sort((a, b) => a.position - b.position)
                .map((c) => ({
                  id: c.id,
                  name: c.name,
                  meaning: "",
                  reversed: c.reversed,
                }))
            : [];
    let savedUserId: string | undefined;
    // Server receipt is authoritative for guest resume — do not create a new triplet via /api/onboarding.
    const hasGuestSpread = existingCards.length >= 3 && !uiCacheEarly;
    const endpoint = hasGuestSpread ? "/api/onboarding" : "/api/profile";
    const payload = hasGuestSpread
      ? {
          ...data,
          mainQuestion: data.mainQuestion || profile?.mainQuestion,
          sessionId: session?.offline ? undefined : session?.sessionId,
          tarotCards: existingCards,
          teaser: profile?.teaser ?? guestDraft?.teaser,
          deckSystem: profile?.deckSystem ?? guestDraft?.deckSystem ?? DEFAULT_DECK_SYSTEM,
          masterId:
            profile?.tripletMasterId ||
            localStorage.getItem(PENDING_MASTER_KEY) ||
            undefined,
        }
      : {
          name: data.name,
          gender: data.gender,
          birthDate: data.birthDate,
          birthTime: data.birthTime,
          birthCity: data.birthCity,
          lifeFocus: data.lifeFocus,
          mainQuestion: data.mainQuestion,
          sessionId: session?.offline ? undefined : session?.sessionId,
        };

    const response = await fetch(endpoint, {
      method: hasGuestSpread ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    const responseData = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        responseData.message || responseData.error || "Не удалось сохранить профиль."
      );
    }
    if (typeof responseData.profileUserId === "string" && responseData.profileUserId) {
      savedUserId = responseData.profileUserId;
    } else if (typeof responseData.userId === "string" && responseData.userId) {
      // Legacy /api/onboarding response; both IDs are server-issued profile IDs.
      savedUserId = responseData.userId;
    }
    if (savedUserId) {
      // Bridge only the short auth-store propagation window with the ID returned
      // by the profile API itself; never infer profile ownership from local data.
      profileSaveAuthorityRef.current = {
        profileUserId: savedUserId,
        expiresAt: Date.now() + 3_000,
      };
    }

    const savedProfile: StoredProfile = {
      ...data,
      tarotCards: existingCards,
      deckSystem: profile?.deckSystem ?? guestDraft?.deckSystem ?? DEFAULT_DECK_SYSTEM,
      teaser: profile?.teaser ?? guestDraft?.teaser,
      userId: savedUserId,
      name: data.name || authUser?.name || data.name,
    };

    clearNeedsServerProfile();
    persistProfile(savedProfile);
    clearOnboardingUrlParams();
    // Keep guest UI cache until resume coordinator acknowledges (do not clearGuestTriplet early).
    if (hasGuestSpread) clearGuestTriplet();
    await refreshAuth?.();

    const uiCacheForResume = loadGuestResumeUiCache();
    const shouldGuestResume =
      Boolean(uiCacheForResume) && existingCards.length >= 3;

    // Claim/reading need profileUserId on the server — client authUser may lag.
    // Profile PATCH already returned userId/profileUserId when linked.
    if (shouldGuestResume) {
      if (!savedUserId) {
        for (let i = 0; i < 6; i += 1) {
          await refreshAuth?.();
          await new Promise((r) => window.setTimeout(r, 250));
          // Re-check local flag from latest /me via a lightweight probe.
          try {
            const me = await fetch("/api/auth/me", {
              credentials: "include",
              cache: "no-store",
            });
            const body = (await me.json().catch(() => ({}))) as {
              user?: { profileUserId?: string | null };
            };
            if (body.user?.profileUserId) {
              savedUserId = body.user.profileUserId;
              profileSaveAuthorityRef.current = {
                profileUserId: savedUserId,
                expiresAt: Date.now() + 3_000,
              };
              break;
            }
          } catch {
            /* retry */
          }
        }
      }
      if (!savedUserId) {
        patchGuestResumeUiCache({ phase: "onboarding_required" });
        setGuestResumeCanRetry(true);
        setTripletNotice(GUEST_RESUME_RETRY_TITLE);
        void finishProfileOnboarding("masters");
        return;
      }
    }

    // Claim/resume must not be blocked by daily triplet cooldown (AC).
    if (responseData.cooldownBlocked && !shouldGuestResume) {
      persistProfile({
        ...savedProfile,
        teaser: profile?.teaser ?? guestDraft?.teaser,
      });
      refreshSavedReadings();
      setTripletNotice(
        responseData.message ??
          "Профиль сохранён. Новый расклад из 3 карт доступен один раз в сутки."
      );
      void finishProfileOnboarding("masters");
      return;
    }

    if (
      effectiveTripletCooldown &&
      !effectiveTripletCooldown.allowed &&
      !shouldGuestResume
    ) {
      refreshSavedReadings();
      void finishProfileOnboarding("masters");
      return;
    }
    refreshSavedReadings();
    if (existingCards.length >= 3) {
      const uiCache = uiCacheForResume;
      if (uiCache) {
        setGuestResumeCanRetry(false);
        setTripletNotice(`${GUEST_RESUME_TRANSITION_TITLE}. ${GUEST_RESUME_TRANSITION_SUBTITLE}`);
        guestResumeBootRef.current = true;
        const resumeResult = await runGuestTripletResume({
          authMethod: "onboarding",
          loadReading: (args) =>
            loadGuestResumeReadingRef.current({
              ...args,
              profileBase: savedProfile,
              questionFallback: data.mainQuestion || profile?.mainQuestion,
              teaserFallback: uiCache.teaser || savedProfile.teaser,
              deckSystem: uiCache.system as StoredProfile["deckSystem"],
            }),
        });

        if (!resumeResult.ok) {
          guestResumeBootRef.current = false;
          if (resumeResult.phase === "onboarding_required") {
            // Profile was just saved — refresh auth and retry once before failing.
            await refreshAuth?.();
            const retryResult = await runGuestTripletResume({
              authMethod: "onboarding_retry",
              loadReading: (args) =>
                loadGuestResumeReadingRef.current({
                  ...args,
                  profileBase: savedProfile,
                  questionFallback: data.mainQuestion || profile?.mainQuestion,
                  teaserFallback: uiCache.teaser || savedProfile.teaser,
                  deckSystem: uiCache.system as StoredProfile["deckSystem"],
                }),
            });
            if (retryResult.ok) {
              setGuestResumeCanRetry(false);
              clearGuestTriplet();
              setTripletNotice(null);
              trackRegistrationCompleted(resolveRegistrationSource("onboarding"));
              clearShareRegistrationAttribution();
              clearOnboardingUrlParams();
              return;
            }
            setGuestResumeCanRetry(true);
            setTripletNotice(GUEST_RESUME_RETRY_TITLE);
            void finishProfileOnboarding("masters");
            return;
          }
          if (resumeResult.capacitorRecovery || resumeResult.phase === "safe_recovery") {
            setGuestResumeCanRetry(false);
            setTripletNotice(GUEST_RESUME_CAPACITOR_RECOVERY);
            void finishProfileOnboarding("masters");
            return;
          }
          if (resumeResult.stage === "already_used") {
            setGuestResumeCanRetry(false);
            clearGuestTriplet();
            clearGuestResumeUiCache();
            setTripletNotice(GUEST_RESUME_ALREADY_USED);
            void finishProfileOnboarding("masters");
            return;
          }
          if (resumeResult.stage === "expired" || resumeResult.phase === "idle") {
            setGuestResumeCanRetry(false);
            setTripletNotice(null);
            void finishProfileOnboarding("masters");
            return;
          }
          setGuestResumeCanRetry(true);
          setTripletNotice(GUEST_RESUME_RETRY_TITLE);
          // Keep UI cache for retry; stay on masters with notice.
          void finishProfileOnboarding("masters");
          return;
        }

        setGuestResumeCanRetry(false);
        clearGuestTriplet();
        setTripletNotice(null);
        trackRegistrationCompleted(resolveRegistrationSource("onboarding"));
        clearShareRegistrationAttribution();
        clearOnboardingUrlParams();
        return;
      }

      const masterToBind = resolveTripletChatMasterId(
        masters,
        profile?.deckSystem ?? tripletSystem,
        profile?.tripletMasterId ||
          localStorage.getItem(PENDING_MASTER_KEY) ||
          undefined
      );
      if (masterToBind) {
        const updated: StoredProfile = {
          ...savedProfile,
          tripletMasterId: masterToBind,
          deckSystem: profile?.deckSystem ?? guestDraft?.deckSystem ?? DEFAULT_DECK_SYSTEM,
          mainQuestion: data.mainQuestion || profile?.mainQuestion,
        };
        persistProfile(updated);
        applyTripletMaster(masterToBind);
        const cardNames = existingCards.map((c) => c.name);
        sessionSpreadMetaRef.current = { spreadType: "daily", cardNames };
        setSessionIntention(null);
        persistSessionIntention(masterToBind, null);
        setIntentionSpread(null);
        persistIntentionSpreadState(masterToBind, null);
        setSpreadFlipped(spreadFlippedState(existingCards.length, true));
        pendingChatOptsRef.current = { masterId: masterToBind, skipReading: false };
        const deps = chat();
        if (deps) {
          deps.chatLoadedForRef.current = null;
          deps.setMessages([]);
        }
        let chatSessionId = session?.offline ? undefined : session?.sessionId;
        if (!session?.offline) {
          chatSessionId = await beginNewSpreadSession(masterToBind);
        }
        await bindSessionToMasterRef.current(masterToBind, chatSessionId);
        trackRegistrationCompleted(resolveRegistrationSource("onboarding"));
        clearShareRegistrationAttribution();
        clearOnboardingUrlParams();
        persistStep("chat");
        await refreshAuth?.();
        await beginChatAfterIntention(masterToBind, null, "existing");
        if (!session?.offline && chatSessionId) {
          void deps?.refreshSessionsList(masterToBind);
        }
        return;
      }
      void finishProfileOnboarding("masters");
      return;
    }
    const defaultMaster = resolveDefaultTripletMasterId(masters, {
      pending: localStorage.getItem(PENDING_MASTER_KEY),
      tarotCards: existingCards,
    });
    if (defaultMaster) {
      applyTripletMaster(defaultMaster);
    }
    void finishProfileOnboarding("triplet");
  };

  const beginChatAfterIntention = useCallback(
    async (
      masterId: string,
      intention: SessionIntention | SessionTopicId | null,
      mode: IntentionStartMode = "existing"
    ) => {
      const deps = chat();
      if (!deps) return;

      const opts = pendingChatOptsRef.current;
      pendingChatOptsRef.current = null;
      setPendingMasterId(null);
      deps.setSessionListMaster(null);
      setSessionIntention(intention);
      persistSessionIntention(masterId, intention);
      setIntentionHighlight(Boolean(intention));
      clearPendingMasterResume();

      localStorage.setItem(LAST_MASTER_KEY, masterId);
      persistStep("chat");
      setLastMasterId(masterId);
      setStep("chat");
      setSpreadFlipped(
        intention
          ? spreadFlippedState(
              getSpread(sessionSpreadMetaRef.current?.spreadId ?? DEFAULT_SPREAD_ID).cardCount,
              false
            )
          : spreadFlippedState(3, true)
      );
      deps.setSessionOnlyChat(false);

      if (!intention) {
        persistIntentionSpreadState(masterId, null);
        if (!sessionSpreadMetaRef.current?.cardNames?.length) {
          const activeProfile = getActiveProfile();
          const dailyCards =
            (activeProfile?.tarotCards?.length ?? 0) >= 3
              ? activeProfile!.tarotCards!.map((c) => c.name)
              : displayTarotCards.map((c) => c.name);
          if (dailyCards.length >= 3) {
            sessionSpreadMetaRef.current = { spreadType: "daily", cardNames: dailyCards };
          }
        }
      }

      if (intention && mode === "fresh") {
        const spreadId = resolveClientSpreadId(sessionSpreadMetaRef.current?.spreadId);
        if (!hasExplicitClientSpreadId(sessionSpreadMetaRef.current?.spreadId)) {
          const topicId = toSessionTopicId(intention);
          if (!topicId) return;
          setSessionFlowPreselectedMaster(masterId);
          setSessionFlowInitialTopic(topicId);
          setShowSessionFlow(true);
          localStorage.setItem(PENDING_MASTER_KEY, masterId);
          localStorage.setItem(LAST_MASTER_KEY, masterId);
          setPendingMasterId(null);
          setStep("masters");
          deps.setSelectedCharacter(null);
          deps.chatLoadedForRef.current = null;
          return;
        }

        setIntentionSpread(null);
        deps.setSelectedCharacter(masterId);
        readingInFlightRef.current = true;
        deps.skipNextReadingRef.current = true;
        deps.chatLoadedForRef.current = null;
        setIntentionSpreadLoading(true);
        openSpreadReadingRitual();
        const ritualStartedAt = Date.now();

          let chatSessionId = session?.offline ? undefined : session?.sessionId;
          if (!session?.offline) {
            chatSessionId = await beginNewSpreadSession(masterId);
          }

          clearChatCache(masterId);
          deps.setMessages([]);

          let skipRitualFinally = false;
          let readingDelivered = false;
          try {
            const spreadResult = await (async () => {
            const response = await postIntentionSpreadRequest({
            characterId: masterId,
            intention,
            spreadId,
            sessionId: chatSessionId,
            ...(resolveJointReadingToken() ? { jointToken: resolveJointReadingToken() } : {}),
          });

          if (response.status === 402) {
            const errData = await response.json().catch(() => ({}));
            const parsed = parseInsufficientRunes(errData);
            if (parsed) {
              deps.setInsufficientRunes({ balance: parsed.balance, required: parsed.required });
              handleOpenPaywallRef.current({
                balance: parsed.balance,
                requiredRunes: parsed.required,
                shortage: parsed.shortage,
              });
            } else {
              handleOpenPaywallRef.current();
            }
            return { kind: "payment" as const };
          }

          if (!response.ok) {
            throw new Error("intention_spread_failed");
          }

          const data = await response.json();
          const system = data.system as DeckSystem;
          const cards = (data.cards ?? []) as SpreadSymbol[];
          const intentionCardsKey = spreadKey(cards);

          setIntentionSpread({ masterId, cards, system, intention });
          setHideChatSpread(false);
          sessionSpreadMetaRef.current = {
            spreadType: "new",
            spreadId,
            cardNames: cards.map((c) => c.name),
          };
          if (chatSessionId) {
            deps.setConsultationSessionId(chatSessionId);
            localStorage.setItem("aura_session_id", chatSessionId);
          }
          persistIntentionSpreadState(masterId, {
            cardsKey: intentionCardsKey,
            cards,
            system,
            intention,
          });
          setSpreadFlipped(spreadFlippedState(cards.length, true));

          if (typeof data.runeBalance === "number") {
            deps.setRuneBalance(data.runeBalance);
            emitRuneBalanceUpdate(data.runeBalance);
          }

          if (typeof data.sessionId === "string" && data.sessionId) {
            chatSessionId = data.sessionId;
            deps.setConsultationSessionId(data.sessionId);
            deps.consultationSessionIdRef.current = data.sessionId;
            localStorage.setItem("aura_session_id", data.sessionId);
          }

          let readingText = resolveClientReadingText(
            typeof data.reading === "string" ? data.reading : "",
            cards.map((c) => c.name)
          );

          if (intention !== "life_death" && !readingText) {
            const polled = await pollIntentionSpreadReading(
              {
                characterId: masterId,
                intention,
                cardNames: cards.map((c) => c.name),
                spreadId,
                cardCount: cards.length,
                sessionId: chatSessionId,
              },
              { maxAttempts: INTENTION_SPREAD_RECOVERY_POLL_MAX_ATTEMPTS }
            );
            readingText = polled
              ? resolveClientReadingText(polled, cards.map((c) => c.name))
              : "";
          }

          const jointSaved = Boolean((data as { jointSaved?: boolean }).jointSaved);
          const jointError =
            typeof (data as { jointError?: string }).jointError === "string"
              ? (data as { jointError?: string }).jointError
              : undefined;

          return {
            kind: "ok" as const,
            readingText,
            cards,
            system,
            intentionCardsKey,
            jointSaved,
            jointError,
          };
              })();

            if (spreadResult.kind === "payment") {
            skipRitualFinally = true;
            closeSpreadReadingRitual();
            setIntentionSpreadLoading(false);
            navigateToSessionIntention(masterId);
            deps.setSelectedCharacter(null);
            deps.chatLoadedForRef.current = null;
            return;
          }

          const { readingText, cards, system, intentionCardsKey, jointSaved, jointError } = spreadResult;

          if (intention !== "life_death" && !readingText) {
            // Paid intention failed to return text — exit immediately, never hang on loadReading.
            skipRitualFinally = true;
            closeSpreadReadingRitual();
            setIntentionSpreadLoading(false);
            setTripletNotice(
              "Не удалось получить трактовку. Руны не списаны или возвращены — попробуйте ещё раз."
            );
            deps.setMessages([
              {
                id: generateId(),
                role: "assistant",
                content:
                  "Расклад не удалось завершить. Попробуйте ещё раз — если руны списались, они вернутся на баланс.",
                timestamp: new Date(),
              },
            ]);
          } else if (intention !== "life_death" && readingText) {
            readingDelivered = true;
            spreadReadingRecoveryKeyRef.current = `${masterId}:${intention}:${intentionCardsKey}`;
            deps.setMessages((prev) => {
              const next = appendSpreadReadingMessage(prev, readingText);
              if (next === prev) return prev;
              saveChatCache(masterId, next, intentionCardsKey, {
                cards,
                system,
                variant: "intention",
              });
              return next;
            });
          } else if (intention === "life_death") {
            const opening = buildIntentionOpening(
              masterId,
              "life_death",
              profile?.name
            );
            const openingMsgs = opening
              ? [
                  {
                    id: generateId(),
                    role: "assistant" as const,
                    content: opening,
                    timestamp: new Date(),
                  },
                ]
              : [];
            if (openingMsgs.length) {
              deps.setMessages(openingMsgs);
              saveChatCache(masterId, openingMsgs, intentionCardsKey, {
                cards,
                system,
                variant: "intention",
              });
            } else {
              saveChatCache(masterId, [], intentionCardsKey, {
                cards,
                system,
                variant: "intention",
              });
            }
          }
          void refreshSavedReadings();

          const jointToken = resolveJointReadingToken();
          if (jointToken) {
            const jointRole = getJointReadingRole() ?? "initiator";
            let jointFailureMessage: string | undefined;
            if (readingText && !jointSaved) {
              const fallback = await postJointReadingComplete(jointToken, {
                sessionId: chatSessionId ?? "",
                role: jointRole,
              });
              if (!fallback.ok) {
                jointFailureMessage = fallback.error || jointError;
              }
            } else if (!readingText) {
              jointFailureMessage = "Не удалось сохранить ваш расклад для совместного приглашения.";
            }
            clearJointReadingToken();
            skipRitualFinally = true;
            closeSpreadReadingRitual();
            setIntentionSpreadLoading(false);
            readingInFlightRef.current = false;
            deps.skipNextReadingRef.current = false;
            deps.pendingNewChatThreadRef.current = false;
            const jointRedirect = jointFailureMessage
              ? `/joint-reading/${encodeURIComponent(jointToken)}?jointError=${encodeURIComponent(jointFailureMessage)}&jointSessionId=${encodeURIComponent(chatSessionId ?? "")}`
              : `/joint-reading/${encodeURIComponent(jointToken)}`;
            window.location.assign(jointRedirect);
            return;
          }
        } catch (spreadErr) {
          skipRitualFinally = true;
          closeSpreadReadingRitual();
          setIntentionSpreadLoading(false);

          // Terminal AI fail already finished on server — do not spin a long dead poll.
          const terminal = isTerminalIntentionSpreadError(spreadErr);
          const waitAborted = isIntentionSpreadWaitAborted(spreadErr);
          try {
            const cardNames =
              sessionSpreadMetaRef.current?.cardNames ??
              readIntentionSpreadForMaster(masterId)?.cards.map((c) => c.name) ??
              [];
            const recoverySpreadId =
              sessionSpreadMetaRef.current?.spreadId ?? resolveClientSpreadId();
            if (
              !terminal &&
              chatSessionId &&
              hasCompleteSpread(cardNames, recoverySpreadId, "new")
            ) {
              const polled = await pollIntentionSpreadReading(
                {
                  characterId: masterId,
                  intention,
                  cardNames,
                  spreadId: recoverySpreadId,
                  cardCount: requiredCardCount(recoverySpreadId, "new"),
                  sessionId: chatSessionId,
                },
                {
                  maxAttempts: waitAborted
                    ? INTENTION_SPREAD_LATE_RECOVERY_POLL_MAX_ATTEMPTS
                    : INTENTION_SPREAD_RECOVERY_POLL_MAX_ATTEMPTS,
                }
              );
              const recovered = polled
                ? resolveClientReadingText(polled, cardNames)
                : "";
              if (recovered) {
                readingDelivered = true;
                spreadReadingRecoveryKeyRef.current = `${masterId}:${intention}:${spreadKey(cardNames.map((n) => ({ name: n })))}`;
                setReadingRitualCountdownDone(true);
                deps.setMessages((prev) => {
                  const next = appendSpreadReadingMessage(prev, recovered);
                  if (next === prev) return prev;
                  saveChatCache(masterId, next, spreadKey(cardNames.map((n) => ({ name: n }))), {
                    cards: cardNames.map((name) => ({ name })),
                    system: resolveMasterDeckSystem(masterId),
                    variant: "intention",
                  });
                  return next;
                });
              }
            }
          } catch {
            /* show explicit error below */
          }

          if (!readingDelivered) {
            const msg =
              spreadErr instanceof Error && spreadErr.message.trim()
                ? spreadErr.message.trim()
                : "Не удалось завершить трактовку. Попробуйте ещё раз.";
            setTripletNotice(msg);
            deps.setMessages([
              {
                id: generateId(),
                role: "assistant",
                content: msg,
                timestamp: new Date(),
              },
            ]);
          }
        } finally {
          if (!skipRitualFinally) {
            await ensureMinSpreadRitualDisplay(ritualStartedAt);
            closeSpreadReadingRitual();
          }
          setIntentionSpreadLoading(false);
          readingInFlightRef.current = false;
          deps.skipNextReadingRef.current = !readingDelivered;
          deps.pendingNewChatThreadRef.current = false;
        }
        return;
      }

      deps.setSelectedCharacter(masterId);
      deps.chatLoadedForRef.current = null;
      readingInFlightRef.current = true;
      deps.setIsLoadingHistory(true);

      try {
        const sessionHint =
          deps.archiveSessionIdRef.current ??
          deps.consultationSessionIdRef.current ??
          undefined;
        const restored = await deps.restoreChatForCharacter(masterId, {
          archiveSessionId: deps.archiveSessionIdRef.current ?? undefined,
          sessionId: sessionHint,
        });
        deps.chatLoadedForRef.current = masterId;

        applyHistorySessionMetaRef.current(restored ?? {}, masterId);
        const restoredBirth =
          restored?.matrixBirthDate?.trim() ||
          restored?.numerologToolParams?.matrixBirthDate?.trim() ||
          null;
        const restoredSubject =
          restored?.subjectName?.trim() ||
          restored?.numerologToolParams?.subjectName?.trim() ||
          null;
        setMatrixSessionBirthDate(restoredBirth);
        setMatrixSessionSubjectName(restoredSubject);
        setMatrixSessionAsOf(restored?.sessionCreatedAt ?? null);

        const persistedForMaster = readIntentionSpreadForMaster(masterId);
        if (persistedForMaster) {
          setIntentionSpread({
            masterId,
            cards: persistedForMaster.cards as SpreadSymbol[],
            system: persistedForMaster.system,
            intention: persistedForMaster.intention,
          });
          setSpreadFlipped(spreadFlippedState(persistedForMaster.cards.length, true));
        } else if (restored?.spread) {
          applyRestoredChatSpreadRef.current(restored.spread, masterId);
        }

        const spreadKeyForRestore =
          persistedForMaster?.cardsKey ||
          spreadKey(persistedForMaster?.cards) ||
          restored?.spread?.cardsKey ||
          spreadKey(displayTarotCards);

        const cached =
          loadChatCacheForMaster(masterId, spreadKeyForRestore || undefined) ??
          loadChatCacheAny(masterId) ??
          [];

        const msgs: Message[] =
          restored !== null && restored.messages.length > 0
            ? restored.messages
            : restored?.sessionId
              ? []
              : cached;

        if (restored !== null) {
          deps.setHistoryHasMore(restored.hasMore);
        }

        deps.setMessages(msgs);
        deps.setIsLoadingHistory(false);

        const skipReading =
          opts?.skipReading ||
          chatHasSpreadReading(msgs) ||
          !shouldAutoLoadSpreadReading(masterId, spreadKeyForRestore || spreadCardsKey);
        if (!skipReading) {
          await loadReadingRef.current(masterId);
        }
        void refreshSavedReadings();
      } finally {
        readingInFlightRef.current = false;
        deps.setIsLoadingHistory(false);
        // Keep skip when caller (guest resume) will POST /api/reading itself —
        // clearing it races ChatWindow into a blank daily loadReading.
        deps.skipNextReadingRef.current = Boolean(opts?.skipReading);
      }
    },
    [
      setStep,
      getActiveProfile,
      displayTarotCards,
      session?.offline,
      session?.sessionId,
      spawnSession,
      referrerSlug,
      spreadCardsKey,
      refreshSavedReadings,
      shouldAutoLoadSpreadReading,
      setLastMasterId,
      readingInFlightRef,
      chatDepsRef,
      loadReadingRef,
      applyHistorySessionMetaRef,
      applyRestoredChatSpreadRef,
      handleOpenPaywallRef,
    ]
  );

  loadGuestResumeReadingRef.current = async ({
    sessionId,
    masterId,
    question,
    cards,
    profileBase,
    questionFallback,
    teaserFallback,
    deckSystem,
  }) => {
    // Prefer the claimed guest master (Veronika) — remapping can break
    // resolveGuestResumeFreeReading fingerprint / character_key checks.
    const masterToBind =
      (masterId && String(masterId).trim()) ||
      resolveTripletChatMasterId(
        masters,
        deckSystem ?? profile?.deckSystem ?? tripletSystem,
        profileBase?.tripletMasterId ||
          profile?.tripletMasterId ||
          localStorage.getItem(PENDING_MASTER_KEY) ||
          undefined
      );
    if (!masterToBind) return "failed";

    const ordered = [...cards].sort((a, b) => a.position - b.position);
    const cardNames = ordered.map((c) =>
      c.reversed ? `${c.name} (перевёрнутая)` : c.name
    );
    const base = profileBase ?? getActiveProfile();
    if (base) {
      persistProfile({
        ...base,
        tarotCards: ordered.map((c) => ({
          id: c.id,
          name: c.name,
          meaning: "",
          reversed: c.reversed,
        })),
        ...(deckSystem ? { deckSystem } : {}),
        mainQuestion: question || questionFallback || base.mainQuestion,
        tripletMasterId: masterToBind,
        teaser: teaserFallback || base.teaser,
      });
    }
    applyTripletMaster(masterToBind);
    sessionSpreadMetaRef.current = { spreadType: "guest_resume", cardNames };
    setSessionIntention(null);
    persistSessionIntention(masterToBind, null);
    setIntentionSpread(null);
    persistIntentionSpreadState(masterToBind, null);
    setSpreadFlipped(spreadFlippedState(ordered.length, true));

    // Fetch reading BEFORE opening chat so a 401/NEEDS_PROFILE never lands
    // the user in chat with the guest "нужна регистрация" stub.
    let readingText = "";
    try {
      const readingRes = await fetch("/api/reading", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          characterId: masterToBind,
          sessionId,
          tarotCards: ordered.map((c) => ({
            id: c.id,
            name: c.name,
            meaning: "",
            reversed: c.reversed,
          })),
          customQuestion: question || undefined,
          spreadType: "guest_resume",
          spreadId: "triplet",
          async: true,
        }),
      });
      let data = (await readingRes.json().catch(() => ({}))) as {
        reading?: string;
        cached?: boolean;
        jobId?: string;
        code?: string;
        error?: string;
      };
      if (readingRes.status === 401 || readingRes.status === 403) {
        const code = String(data.code ?? "").toUpperCase();
        if (code === "NEEDS_PROFILE") {
          patchGuestResumeUiCache({ phase: "onboarding_required" });
        }
        return "failed";
      }
      if (readingRes.status === 202 && typeof data.jobId === "string") {
        const { waitForAsyncJob } = await import("@/lib/client/wait-for-async-job");
        data = (await waitForAsyncJob({
          jobId: data.jobId,
          storageKey: "aura:guest-resume-active-job",
        })) as typeof data;
      } else if (!readingRes.ok) {
        return "failed";
      }
      readingText = typeof data.reading === "string" ? data.reading.trim() : "";
      if (!readingText) return "failed";
    } catch {
      return "failed";
    }

    const deps = chat();
    if (!deps) return "failed";
    deps.setSessionListMaster(null);
    deps.setSessionOnlyChat(false);
    deps.setConsultationSessionId(sessionId);
    if (deps.consultationSessionIdRef) {
      deps.consultationSessionIdRef.current = sessionId;
    }
    deps.archiveSessionIdRef.current = null;
    deps.skipNextReadingRef.current = true;
    // Mark loaded before selecting character so ChatWindow won't restore blank history.
    deps.chatLoadedForRef.current = masterToBind;
    deps.setSelectedCharacter(masterToBind);
    deps.setIsLoadingHistory(false);
    deps.setMessages([
      {
        id: generateId(),
        role: "assistant",
        content: readingText,
        timestamp: new Date(),
      },
    ]);
    await bindSessionToMasterRef.current(masterToBind, sessionId);
    localStorage.setItem(LAST_MASTER_KEY, masterToBind);
    setLastMasterId(masterToBind);
    persistStep("chat");
    setStep("chat");
    return "full";
  };

  const handleTripletComplete = async (cards: SpreadSymbol[], teaser: string) => {
    if (!isLoggedIn) {
      return;
    }

    let storedProfile: StoredProfile | null = null;
    try {
      const raw = localStorage.getItem(PROFILE_KEY);
      if (raw) storedProfile = JSON.parse(raw) as StoredProfile;
    } catch {
      storedProfile = null;
    }

    const activeForCheck = mergeActiveProfile(profile, storedProfile);
    if (!activeForCheck?.birthDate || !activeForCheck?.zodiac || !activeForCheck?.name) {
      const msg = "Не хватает данных профиля. Заполните анкету заново.";
      setTripletNotice(msg);
      setStep("onboarding");
      return;
    }

    const base = activeForCheck;
    const previousCards =
      profile?.tarotCards?.length ? profile.tarotCards : (storedProfile?.tarotCards ?? []);

    setSpreadRitual({ active: true, cards, system: tripletSystem });
    try {
      const proceedToMasterAfterTriplet = async (
        updated: StoredProfile,
        startFreshSession: boolean
      ) => {
        setNewTripletDraft(false);
        const masterToBind = resolveTripletChatMasterId(
          masters,
          tripletSystem,
          tripletMasterId || localStorage.getItem(PENDING_MASTER_KEY)
        );
        if (masterToBind) {
          persistProfile({ ...updated, tripletMasterId: masterToBind });
          const cardNames = cards.map((c) => c.name);
          sessionSpreadMetaRef.current = { spreadType: "daily", cardNames };
          setSessionIntention(null);
          persistSessionIntention(masterToBind, null);
          setIntentionSpread(null);
          persistIntentionSpreadState(masterToBind, null);
          setSpreadFlipped(spreadFlippedState(cards.length, true));
          pendingChatOptsRef.current = { masterId: masterToBind, skipReading: false };
          const deps = chat();
          if (deps) {
            deps.chatLoadedForRef.current = null;
            if (startFreshSession) deps.setMessages([]);
          }

          let chatSessionId = session?.offline ? undefined : session?.sessionId;
          if (startFreshSession && !session?.offline) {
            chatSessionId = await beginNewSpreadSession(masterToBind);
          }

          await bindSessionToMasterRef.current(masterToBind, chatSessionId);
          if (chatSessionId && startFreshSession) {
            await deps?.persistSessionMetaToServer(chatSessionId, {
              characterKey: masterToBind,
              intention: null,
              spreadType: "daily",
              cards: cardNames,
            });
          }
          await beginChatAfterIntention(masterToBind, null, "existing");
          if (startFreshSession) {
            void deps?.refreshSessionsList(masterToBind);
          }
          return;
        }

        persistProfile(updated);
        setStep("masters");
        if (session?.sessionId && !session.offline) {
          await refresh(session.sessionId);
        }
      };

      const existingSpread = getSpreadForSystem(base, tripletSystem);
      const isSameSpread =
        !newTripletDraft &&
        existingSpread.length >= 3 &&
        spreadKey(existingSpread) === spreadKey(cards);

      if (isSameSpread) {
        const updated: StoredProfile = {
          ...base,
          tarotCards: cards,
          deckSystem: tripletSystem,
          deckSpreads: { ...base.deckSpreads, [tripletSystem]: cards },
          teaser: teaser || base.teaser,
        };
        await proceedToMasterAfterTriplet(updated, false);
        void refreshSavedReadings();
        return;
      }

      const updated: StoredProfile = {
        ...base,
        tarotCards: cards,
        deckSystem: tripletSystem,
        deckSpreads: { ...base.deckSpreads, [tripletSystem]: cards },
        teaser,
        tripletMasterId: tripletMasterId || localStorage.getItem(PENDING_MASTER_KEY) || undefined,
      };

      let serverOk = false;
      try {
        const postBody = buildOnboardingPostBody(
          base,
          cards,
          teaser,
          session?.offline ? undefined : session?.sessionId,
          tripletSystem,
          tripletMasterId || localStorage.getItem(PENDING_MASTER_KEY) || undefined
        );

        const res = await fetch("/api/onboarding", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(postBody),
        });

        const data = (await res.json()) as {
          userId?: string;
          error?: string;
          code?: string;
          step?: string;
          detail?: string;
          missing?: string[];
          message?: string;
          nextAvailableAt?: string | null;
        };

        if (
          (res.status === 429 || data.error === "TRIPLET_COOLDOWN") &&
          data.error === "TRIPLET_COOLDOWN"
        ) {
          newTripletInProgressRef.current = false;
          setNewTripletDraft(false);
          const restored: StoredProfile = {
            ...base,
            tarotCards: previousCards,
            teaser: profile?.teaser ?? storedProfile?.teaser,
          };
          persistProfile(restored);
          setTripletCooldown(
            data.nextAvailableAt
              ? {
                  allowed: false,
                  nextAvailableAt: data.nextAvailableAt,
                  lastTripletAt: tripletCooldown?.lastTripletAt ?? null,
                }
              : tripletCooldownFromLastDraw(new Date())
          );
          if (data.nextAvailableAt) {
            const lastMs = new Date(data.nextAvailableAt).getTime() - 24 * 60 * 60 * 1000;
            const lastIso = new Date(lastMs).toISOString();
            writeLocalTripletDrawAt(lastIso);
            persistProfile({ ...restored, lastTripletDrawAt: lastIso });
          }
          setTripletNotice(
            data.nextAvailableAt
              ? `Новый расклад из 3 карт ${formatTripletCooldownRu(data.nextAvailableAt)}`
              : "Новый расклад из 3 карт доступен один раз в сутки"
          );
          setStep("masters");
          return;
        }

        if (res.ok) {
          serverOk = true;
          newTripletInProgressRef.current = false;
          tripletDrawnAtRef.current = Date.now();
          setNewTripletDraft(false);
          clearGuestTriplet();
          if (data.userId) updated.userId = data.userId;
          const drawAt = new Date().toISOString();
          updated.lastTripletDrawAt = drawAt;
          writeLocalTripletDrawAt(drawAt);
          setTripletCooldown(tripletCooldownFromLastDraw(drawAt));
        } else {
          newTripletInProgressRef.current = false;
          setNewTripletDraft(false);
          const restored: StoredProfile = {
            ...base,
            tarotCards: previousCards,
            teaser: profile?.teaser ?? storedProfile?.teaser,
          };
          persistProfile(restored);
          setTripletNotice(onboardingErrorMessage(data));
          if (data.error === "Заполните профиль" || data.code === "MISSING_PROFILE") {
            setStep("onboarding");
          } else {
            setStep(previousCards.length >= 3 ? "masters" : "triplet");
          }
          return;
        }
      } catch {
        newTripletInProgressRef.current = false;
      }

      if (!serverOk) {
        setTripletNotice(
          "Расклад сохранён локально. Синхронизация с сервером произойдёт при следующем входе."
        );
      }

      await proceedToMasterAfterTriplet(updated, true);
    } finally {
      setSpreadRitual({ active: false });
    }
  };

  const handleTripletBack = useCallback(async () => {
    const pending = tripletPendingRef.current;
    if (
      pending?.cards.length === 3 &&
      !newTripletDraft &&
      !newTripletInProgressRef.current
    ) {
      const base = profile ?? readStoredProfile();
      const existing = getSpreadForSystem(base, tripletSystem);
      if (existing.length < 3 || spreadKey(existing) !== spreadKey(pending.cards)) {
        await handleTripletComplete(pending.cards, pending.teaser);
        return;
      }
    }
    tripletPendingRef.current = null;
    newTripletInProgressRef.current = false;
    setNewTripletDraft(false);
    setTripletNotice(null);
    setStep("masters");
  }, [profile, tripletSystem, newTripletDraft, setStep]);

  const handleClearTripletFromMain = useCallback(async () => {
    if (!isLoggedIn) {
      setProfile((prev) => {
        if (!prev) return prev;
        const next = {
          ...prev,
          tarotCards: [] as SpreadSymbol[],
          deckSystem: undefined,
          deckSpreads: undefined,
          teaser: undefined,
          tripletMasterId: undefined,
        };
        localStorage.setItem(PROFILE_KEY, JSON.stringify(next));
        return next;
      });
      clearSpreadSessionState(setLastMasterId);
      return;
    }

    const res = await fetch("/api/profile/triplet-spread", {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) {
      setTripletNotice("Не удалось убрать расклад. Попробуйте обновить страницу.");
      return;
    }
    clearSpreadSessionState(setLastMasterId);
    await syncProfileFromServer();
    setTripletNotice(null);
  }, [isLoggedIn, syncProfileFromServer, setProfile, setLastMasterId]);

  const handleNewReading = async () => {
    const deps = chat();
    setTripletNotice(null);
    if (
      !tripletCooldownReady ||
      !effectiveTripletCooldown.allowed ||
      tripletCountdown.isOnCooldown
    ) {
      const hint = effectiveTripletCooldown.nextAvailableAt
        ? `Новый расклад из 3 карт ${formatTripletCooldownRu(effectiveTripletCooldown.nextAvailableAt)}`
        : "Новый расклад из 3 карт доступен один раз в сутки";
      setTripletNotice(hint);
      return;
    }
    const synced = await syncProfileFromServer();
    const cooldown = mergeTripletCooldownWithAnchors(
      synced?.cooldown ?? tripletCooldown,
      profile?.lastTripletDrawAt
    );
    if (!cooldown.allowed || tripletCountdown.isOnCooldown) {
      const hint = cooldown?.nextAvailableAt
        ? `Новый расклад из 3 карт ${formatTripletCooldownRu(cooldown.nextAvailableAt)}`
        : "Новый расклад из 3 карт доступен один раз в сутки";
      setTripletNotice(hint);
      setStep("masters");
      return;
    }
    const base = synced?.profile ?? profile ?? getActiveProfile();
    if (!base?.birthDate) {
      setStep("onboarding");
      return;
    }
    readingInFlightRef.current = false;
    localStorage.removeItem(LAST_MASTER_KEY);
    setLastMasterId(null);
    setSelectedCharacter(null);
    if (deps) {
      deps.setMessages([]);
      deps.setInsufficientRunes(null);
      deps.setChatHeaderImage(null);
    }
    const defaultMaster = resolveDefaultTripletMasterId(masters, {
      pending: localStorage.getItem(PENDING_MASTER_KEY),
      recapMasterId: recapContinueMasterId,
      tarotCards: displayTarotCards,
    });
    if (defaultMaster) {
      applyTripletMaster(defaultMaster);
    } else {
      clearPendingMasterResume();
    }
    newTripletInProgressRef.current = true;
    setNewTripletDraft(true);
    setStep("triplet");
  };

  useEffect(() => {
    if (step !== "onboarding" || !tripletCooldownReady || !tripletCooldown || tripletCooldown.allowed) {
      return;
    }
    // Incomplete profile must stay on the anketa — never bounce to masters/chat
    // just because guest already drew today's triplet (cooldown active).
    if (!authUser?.profileUserId || hasPendingServerProfile()) return;
    if (!getActiveProfile()?.birthDate && !profile?.birthDate) return;
    if (loadGuestResumeUiCache()?.phase === "onboarding_required") return;
    if (displayTarotCards.length < 3) return;
    const hint = tripletCooldown.nextAvailableAt
      ? `Новый расклад из 3 карт ${formatTripletCooldownRu(tripletCooldown.nextAvailableAt)}`
      : "Новый расклад из 3 карт доступен один раз в сутки";
    setTripletNotice(hint);
    setStep("masters");
  }, [
    step,
    tripletCooldownReady,
    tripletCooldown,
    displayTarotCards.length,
    setStep,
    authUser?.profileUserId,
    profile?.birthDate,
    getActiveProfile,
  ]);

  useEffect(() => {
    if (step !== "triplet" || !tripletCooldownReady) return;
    if (newTripletDraft || newTripletInProgressRef.current) return;
    if (effectiveTripletCooldown.allowed) return;
    const hint = effectiveTripletCooldown.nextAvailableAt
      ? `Новый расклад из 3 карт ${formatTripletCooldownRu(effectiveTripletCooldown.nextAvailableAt)}`
      : "Новый расклад из 3 карт доступен один раз в сутки";
    setTripletNotice(hint);
    setStep("masters");
  }, [step, tripletCooldownReady, effectiveTripletCooldown, newTripletDraft, setStep]);

  const startPersonalFlow = useCallback(async () => {
    if (!isLoggedIn) {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(GUEST_SPREAD_START_EVENT));
        requestAnimationFrame(() => {
          document.getElementById(GUEST_SPREAD_PICKER_ID)?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }
      return;
    }
    setTripletNotice(null);
    const synced = await syncProfileFromServer();
    const base = synced?.profile ?? profile ?? getActiveProfile();
    // Regular paid session entry: онбординг при отсутствии профиля, иначе —
    // выбор мастера и обычный сеанс по тарифам (без бесплатного лимита раз в сутки).
    if (!base?.birthDate && !profile?.birthDate) {
      setStep("onboarding");
      return;
    }
    setStep("masters");
    persistStep("masters");
    if (typeof document !== "undefined") {
      requestAnimationFrame(() => {
        document
          .getElementById("наставники")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, [
    isLoggedIn,
    syncProfileFromServer,
    profile,
    getActiveProfile,
    setStep,
    setTripletNotice,
  ]);

  const openChatWithSessionParams = useCallback(
    async (params: SessionStartParams) => {
      const deps = chat();
      if (!deps) return;

      const {
        characterKey,
        intention,
        spreadType,
        spreadId = DEFAULT_SPREAD_ID,
        cards,
        cardsRevealed = false,
        previewCards,
        deckSystem: previewDeckSystem,
        customQuestion,
        numerologToolId,
        numerologToolParams,
        matrixSubjectId,
      } = params;
      const numerologTool = numerologToolId ?? DEFAULT_NUMEROLOG_SESSION_TOOL;
      const isNumerologSessionStart =
        isNumerologMaster(characterKey) && spreadType === "new" && !intention;
      const spreadCardCount = getSpread(spreadId).cardCount;
      const sessionIntentionValue = spreadType === "daily" ? null : intention;
      if (customQuestion?.trim()) {
        persistSessionCustomQuestion(characterKey, customQuestion.trim());
      } else if (intention !== "custom") {
        persistSessionCustomQuestion(characterKey, null);
      }
      if (spreadType === "new" && intention) {
        setIntentionSpread(null);
        persistIntentionSpreadState(characterKey, null);
      }
      const matrixBirthFromParams =
        numerologToolParams?.matrixBirthDate?.trim() || null;
      if (matrixBirthFromParams) {
        setMatrixSessionBirthDate(matrixBirthFromParams);
        // Fresh session — drop any as-of inherited from a reopened one.
        setMatrixSessionAsOf(null);
      }
      if (numerologToolParams?.subjectName?.trim()) {
        setMatrixSessionSubjectName(numerologToolParams.subjectName.trim());
      }
      sessionSpreadMetaRef.current = {
        spreadType,
        spreadId: isNumerologSessionStart
          ? encodeNumerologSpreadId(numerologTool)
          : spreadId,
        cardNames: cards,
        numerologToolId,
        numerologToolParams,
        matrixSubjectId,
        matrixBirthDate: matrixBirthFromParams,
        subjectName: numerologToolParams?.subjectName?.trim() || null,
      };
      setChatSessionSpread(null);
      readingInFlightRef.current = true;
      deps.skipNextReadingRef.current = true;
      deps.pendingNewChatThreadRef.current = true;
      deps.chatLoadedForRef.current = null;
      // Drop any prior consultation binding before history/restore can latch onto it.
      deps.setConsultationSessionId(null);
      deps.consultationSessionIdRef.current = null;
      deps.setConsultationReadOnly(false);
      deps.archiveSessionIdRef.current = null;

      setSessionIntention(sessionIntentionValue);
      persistSessionIntention(characterKey, sessionIntentionValue);
      setIntentionHighlight(Boolean(sessionIntentionValue));
      setPendingMasterId(null);
      pendingChatOptsRef.current = null;
      clearPendingMasterResume();
      localStorage.setItem(LAST_MASTER_KEY, characterKey);
      persistStep("chat");
      setLastMasterId(characterKey);
      deps.setSessionOnlyChat(false);

      const applyPreviewSpread = () => {
        if (!intention) return null;
        if (!cardsRevealed || !hasCompleteSpread(cards, spreadId, spreadType)) return null;
        const system = previewDeckSystem ?? resolveMasterDeckSystem(characterKey);
        const positionLabels = resolveSpreadPositions(spreadId, intention).map((p) => p.label);
        const fromDeck = resolveSpreadSymbols(system, cards);
        const spreadCards: SpreadSymbol[] =
          fromDeck.length >= spreadCardCount
            ? fromDeck.slice(0, spreadCardCount)
            : (previewCards?.slice(0, spreadCardCount).map((c, i) => {
                const deckSym = resolveSpreadSymbols(system, [c.name])[0];
                if (deckSym) {
                  return { ...deckSym, meaning: c.meaning ?? deckSym.meaning };
                }
                return {
                  id: i,
                  name: c.name,
                  meaning: c.meaning ?? positionLabels[i] ?? `Позиция ${i + 1}`,
                };
              }) ?? []);
        if (spreadCards.length < spreadCardCount) return null;
        const intentionCardsKey = spreadKey(spreadCards);
        setIntentionSpread({ masterId: characterKey, cards: spreadCards, system, intention });
        setHideChatSpread(false);
        persistIntentionSpreadState(characterKey, {
          cardsKey: intentionCardsKey,
          cards: spreadCards,
          system,
          intention,
        });
        setSpreadFlipped(Array.from({ length: spreadCardCount }, () => true));
        return { spreadCards, system, intentionCardsKey };
      };

      if (spreadType === "daily") {
        const dailyCardsKey = spreadKey(cards.map((name) => ({ name })));
        if (
          dailyCardsKey &&
          masterHasReadingForSpread(savedReadings, characterKey, dailyCardsKey)
        ) {
          setIntentionSpread(null);
          persistIntentionSpreadState(characterKey, null);
          const { spreadCards, system } = buildSessionSpreadCards(characterKey, cards);
          setSpreadFlipped(spreadFlippedState(spreadCards.length, true));
          setChatSessionSpread({ masterId: characterKey, cards: spreadCards, system });
          deps.setSelectedCharacter(characterKey);
          deps.skipNextReadingRef.current = true;
          deps.chatLoadedForRef.current = null;
          deps.setSessionOnlyChat(false);
          setStep("chat");
          deps.setSessionListMaster(null);
          let chatSessionId: string | undefined;
          try {
            const sessionsRes = await fetch(
              `/api/sessions?characterKey=${encodeURIComponent(characterKey)}`
            );
            if (sessionsRes.ok) {
              const sessionsData = (await sessionsRes.json()) as {
                active: { id: string; messageCount: number } | null;
                completed: { id: string; messageCount: number }[];
              };
              chatSessionId =
                sessionsData.active?.id ??
                sessionsData.completed?.find((item) => item.messageCount > 0)?.id;
            }
          } catch {
            /* resume without bound session */
          }
          await bindSessionToMaster(characterKey, chatSessionId);
          if (chatSessionId && deps) {
            deps.setConsultationSessionId(chatSessionId);
            deps.consultationSessionIdRef.current = chatSessionId;
            deps.setConsultationReadOnly(false);
            deps.archiveSessionIdRef.current = null;
          }
          readingInFlightRef.current = false;
          deps.skipNextReadingRef.current = true;
          await openChatWithCharacterRef.current(characterKey, {
            intention: null,
            preserveSpreadState: true,
          });
          return;
        }

        setIntentionSpread(null);
        persistIntentionSpreadState(characterKey, null);
        setSpreadFlipped(spreadFlippedState(3, true));
        const { spreadCards, system } = buildSessionSpreadCards(characterKey, cards);
        setChatSessionSpread({ masterId: characterKey, cards: spreadCards, system });
        deps.setSelectedCharacter(characterKey);
        deps.chatLoadedForRef.current = null;
        deps.setMessages([]);
        setStep("chat");
        deps.setSessionListMaster(null);

        try {
          let chatSessionId: string | undefined;
          if (!session?.offline) {
            chatSessionId = await beginNewSpreadSession(characterKey);
            if (!chatSessionId) throw new Error("failed_to_create_consultation_session");
          }
          await bindSessionToMaster(characterKey, chatSessionId);
          await deps.persistSessionMetaToServer(chatSessionId, {
            characterKey,
            intention: sessionIntentionValue,
            spreadType,
            cards,
            awaitingContext: sessionIntentionValue === "life_death" ? true : undefined,
          });
          if (chatSessionId) {
            deps.setConsultationSessionId(chatSessionId);
            deps.consultationSessionIdRef.current = chatSessionId;
            deps.setConsultationReadOnly(false);
            deps.archiveSessionIdRef.current = null;
          }
          if (sessionIntentionValue !== "life_death") {
            await loadReadingRef.current(characterKey, undefined, { sessionId: chatSessionId });
          }
          void deps.refreshSessionsList(characterKey);
        } finally {
          deps.chatLoadedForRef.current = characterKey;
          deps.setIsLoadingHistory(false);
          readingInFlightRef.current = false;
          deps.skipNextReadingRef.current = false;
          deps.pendingNewChatThreadRef.current = false;
        }
        return;
      }

      deps.setSessionListMaster(null);

      const preview = applyPreviewSpread();
      if (!preview) {
        setSpreadFlipped(spreadFlippedState(spreadCardCount, false));
      }

      const numerologDrawCount = numerologToolDrawCount(numerologTool);

      if (
        isNumerologSessionStart &&
        cards.length >= numerologDrawCount
      ) {
        setIntentionSpread(null);
        persistIntentionSpreadState(characterKey, null);
        let spreadCards: SpreadSymbol[] = [];
        let system = previewDeckSystem ?? resolveMasterDeckSystem(characterKey);
        if (numerologDrawCount > 0) {
          const activeProfileForSpread = getActiveProfile();
          const built = buildNumerologSpreadCards(
            characterKey,
            cards,
            numerologTool,
            {
              previewCards,
              deckSystem: previewDeckSystem,
              birthDate: activeProfileForSpread?.birthDate,
            }
          );
          spreadCards = built.spreadCards;
          system = built.system;
          setChatSessionSpread({
            masterId: characterKey,
            cards: spreadCards,
            system,
          });
          setHideChatSpread(false);
          setSpreadFlipped(spreadFlippedState(numerologDrawCount, true));
        } else {
          setChatSessionSpread(null);
          setHideChatSpread(false);
          setSpreadFlipped([]);
        }

        const activeProfile = getActiveProfile();
        const mergedProfile =
          numerologDrawCount > 0 && activeProfile
            ? {
                ...activeProfile,
                deckSpreads: { ...activeProfile.deckSpreads, [system]: spreadCards },
              }
            : activeProfile;
        if (mergedProfile && numerologDrawCount > 0) {
          persistProfile(mergedProfile);
        }

        deps.setSelectedCharacter(characterKey);
        deps.setMessages([]);
        setStep("chat");

        try {
          let chatSessionId: string | undefined;
          if (!session?.offline) {
            chatSessionId = await beginNewSpreadSession(characterKey);
            if (!chatSessionId) throw new Error("failed_to_create_consultation_session");
          }
          await bindSessionToMaster(characterKey, chatSessionId);
          const matrixParams: import("@/lib/numerology/tools").NumerologToolParams = {
            ...(numerologToolParams ?? {}),
            ...(matrixSubjectId ? { matrixSubjectId } : {}),
            ...(matrixSubjectId && numerologToolParams?.matrixBirthDate
              ? { matrixBirthDate: numerologToolParams.matrixBirthDate }
              : {}),
          };
          await deps.persistSessionMetaToServer(chatSessionId, {
            characterKey,
            intention: null,
            spreadType,
            spreadId: encodeNumerologSpreadId(numerologTool),
            cards,
            numerologToolParams: Object.keys(matrixParams).length ? matrixParams : null,
          });
          if (chatSessionId) {
            deps.setConsultationSessionId(chatSessionId);
            deps.consultationSessionIdRef.current = chatSessionId;
            deps.setConsultationReadOnly(false);
            deps.archiveSessionIdRef.current = null;
          }
          await loadReadingRef.current(characterKey, mergedProfile ?? undefined, {
            sessionId: chatSessionId,
          });
          void deps.refreshSessionsList(characterKey);
        } finally {
          deps.chatLoadedForRef.current = characterKey;
          deps.setIsLoadingHistory(false);
          readingInFlightRef.current = false;
          deps.skipNextReadingRef.current = false;
          deps.pendingNewChatThreadRef.current = false;
        }
        return;
      }

      if (!intention) {
        setStep("masters");
        readingInFlightRef.current = false;
        deps.skipNextReadingRef.current = false;
        return;
      }

      deps.setSelectedCharacter(characterKey);
      setIntentionSpreadLoading(true);
      openSpreadReadingRitual();
      const ritualStartedAt = Date.now();
      // Drop any same-card local thread so recovery cannot flash the previous consultation.
      clearChatCache(characterKey);
      deps.setMessages([]);
      setStep("chat");

      // Never fall back to the global/old session id — that reopens the previous chat.
      let chatSessionId: string | undefined;
      let skipRitualFinally = false;
      let readingDelivered = false;

      try {
        if (!session?.offline) {
          chatSessionId = await beginNewSpreadSession(characterKey);
          if (!chatSessionId) {
            throw new Error("failed_to_create_consultation_session");
          }
        }

        await bindSessionToMaster(characterKey, chatSessionId);

        await deps.persistSessionMetaToServer(chatSessionId, {
          characterKey,
          intention,
          spreadType,
          spreadId,
          cards,
          awaitingContext: intention === "life_death" ? true : undefined,
        });

        if (chatSessionId) {
          deps.setConsultationSessionId(chatSessionId);
          deps.consultationSessionIdRef.current = chatSessionId;
          deps.setConsultationReadOnly(false);
          deps.archiveSessionIdRef.current = null;
        } else if (characterKey) {
          void deps.resolveConsultationSessionId(characterKey);
        }

        const spreadResult = await (async () => {
            const response = await postIntentionSpreadRequest({
              characterId: characterKey,
              intention,
              spreadId,
              customQuestion: intention === "custom" ? customQuestion?.trim() : undefined,
              cardNames: cards,
              sessionId: chatSessionId,
              ...(resolveJointReadingToken() ? { jointToken: resolveJointReadingToken() } : {}),
            });

            if (response.status === 402) {
              const errData = await response.json().catch(() => ({}));
              const parsed = parseInsufficientRunes(errData);
              if (parsed) {
                deps.setInsufficientRunes({ balance: parsed.balance, required: parsed.required });
                handleOpenPaywallRef.current({
                  balance: parsed.balance,
                  requiredRunes: parsed.required,
                  shortage: parsed.shortage,
                });
              } else {
                handleOpenPaywallRef.current();
              }
              return { kind: "payment" as const };
            }

            if (!response.ok) throw new Error("intention_spread_failed");

            const data = await response.json();
            if (typeof data.sessionId === "string" && data.sessionId) {
              chatSessionId = data.sessionId;
              deps.setConsultationSessionId(data.sessionId);
              deps.consultationSessionIdRef.current = data.sessionId;
              deps.setConsultationReadOnly(false);
              deps.archiveSessionIdRef.current = null;
              await bindSessionToMaster(characterKey, data.sessionId);
            }
            const spreadCardsFromData = (data.cards ?? []) as SpreadSymbol[];
            const cardNamesForClean = hasCompleteSpread(
              spreadCardsFromData.map((c) => c.name),
              spreadId
            )
              ? spreadCardsFromData.map((c) => c.name)
              : cards;
            let readingText = resolveClientReadingText(
              typeof data.reading === "string" ? data.reading : "",
              cardNamesForClean
            );

            const system = data.system as DeckSystem;
            const spreadCards = (data.cards ?? []) as SpreadSymbol[];
            const intentionCardsKey = spreadKey(spreadCards);

            sessionSpreadMetaRef.current = {
              spreadType,
              spreadId,
              cardNames: spreadCards.map((c) => c.name),
              numerologToolId,
              numerologToolParams,
            };

            setIntentionSpread({ masterId: characterKey, cards: spreadCards, system, intention });
            setHideChatSpread(false);
            persistIntentionSpreadState(characterKey, {
              cardsKey: intentionCardsKey,
              cards: spreadCards,
              system,
              intention,
            });
            setSpreadFlipped(spreadFlippedState(spreadCards.length, true));

            if (typeof data.runeBalance === "number") {
              deps.setRuneBalance(data.runeBalance);
              emitRuneBalanceUpdate(data.runeBalance);
            }

            if (intention !== "life_death" && !readingText) {
              const polled = await pollIntentionSpreadReading(
                {
                  characterId: characterKey,
                  intention,
                  cardNames: cardNamesForClean,
                  spreadId,
                  cardCount: spreadCardCount,
                  sessionId: chatSessionId,
                },
                { maxAttempts: INTENTION_SPREAD_RECOVERY_POLL_MAX_ATTEMPTS }
              );
              readingText = polled ? resolveClientReadingText(polled, cardNamesForClean) : "";
            }

            const jointSaved = Boolean((data as { jointSaved?: boolean }).jointSaved);
            const jointError =
              typeof (data as { jointError?: string }).jointError === "string"
                ? (data as { jointError?: string }).jointError
                : undefined;

            return {
              kind: "ok" as const,
              readingText,
              spreadCards,
              system,
              intentionCardsKey,
              jointSaved,
              jointError,
              sessionId: typeof data.sessionId === "string" ? data.sessionId : chatSessionId,
            };
          })();

        if (spreadResult.kind === "payment") {
          skipRitualFinally = true;
          closeSpreadReadingRitual();
          setIntentionSpreadLoading(false);
          setStep("masters");
          deps.setSelectedCharacter(null);
          deps.chatLoadedForRef.current = null;
          return;
        }

        const { readingText, spreadCards, system, intentionCardsKey, jointSaved, jointError, sessionId: spreadSessionId } =
          spreadResult;

        if (intention !== "life_death" && !readingText) {
          skipRitualFinally = true;
          closeSpreadReadingRitual();
          setIntentionSpreadLoading(false);
          setTripletNotice(
            "Не удалось получить трактовку. Руны не списаны или возвращены — попробуйте ещё раз."
          );
          deps.setMessages([
            {
              id: generateId(),
              role: "assistant",
              content:
                "Расклад не удалось завершить. Попробуйте ещё раз — если руны списались, они вернутся на баланс.",
              timestamp: new Date(),
            },
          ]);
        } else if (intention !== "life_death" && readingText) {
          readingDelivered = true;
          spreadReadingRecoveryKeyRef.current = `${characterKey}:${intention}:${intentionCardsKey}`;
          // Fresh consultation: replace thread (append can no-op if stale messages raced in).
          deps.setMessages(() => {
            const next = appendSpreadReadingMessage([], readingText);
            if (next.length) {
              saveChatCache(characterKey, next, intentionCardsKey, {
                cards: spreadCards,
                system,
                variant: "intention",
              });
            }
            return next;
          });
        } else if (intention === "life_death") {
          const opening = buildIntentionOpening(
            characterKey,
            "life_death",
            profile?.name
          );
          const openingMsgs = opening
            ? [
                {
                  id: generateId(),
                  role: "assistant" as const,
                  content: opening,
                  timestamp: new Date(),
                },
              ]
            : [];
          if (openingMsgs.length) {
            deps.setMessages(openingMsgs);
            saveChatCache(characterKey, openingMsgs, intentionCardsKey, {
              cards: spreadCards,
              system,
              variant: "intention",
            });
          } else {
            saveChatCache(characterKey, [], intentionCardsKey, {
              cards: spreadCards,
              system,
              variant: "intention",
            });
          }
        }
        void refreshSavedReadings();
        void deps.refreshSessionsList(characterKey);

        const jointToken = resolveJointReadingToken();
        if (jointToken) {
          const jointRole = getJointReadingRole() ?? "initiator";
          let jointFailureMessage: string | undefined;
          if (readingText && !jointSaved) {
            const fallback = await postJointReadingComplete(jointToken, {
              sessionId: spreadSessionId ?? chatSessionId ?? "",
              role: jointRole,
            });
            if (!fallback.ok) {
              jointFailureMessage = fallback.error || jointError;
            }
          } else if (!readingText) {
            jointFailureMessage = "Не удалось сохранить ваш расклад для совместного приглашения.";
          }
          clearJointReadingToken();
          skipRitualFinally = true;
          closeSpreadReadingRitual();
          setIntentionSpreadLoading(false);
          readingInFlightRef.current = false;
          deps.skipNextReadingRef.current = false;
          const jointSessionIdForRetry = spreadSessionId ?? chatSessionId;
          const jointRedirect = jointFailureMessage
            ? `/joint-reading/${encodeURIComponent(jointToken)}?jointError=${encodeURIComponent(jointFailureMessage)}&jointSessionId=${encodeURIComponent(jointSessionIdForRetry ?? "")}`
            : `/joint-reading/${encodeURIComponent(jointToken)}`;
          window.location.assign(jointRedirect);
          return;
        }
      } catch (err) {
        const sessionCreateFailed =
          err instanceof Error && err.message === "failed_to_create_consultation_session";
        if (sessionCreateFailed) {
          skipRitualFinally = true;
          closeSpreadReadingRitual();
          setIntentionSpreadLoading(false);
          deps.setMessages([]);
          deps.setSelectedCharacter(null);
          deps.chatLoadedForRef.current = null;
          setStep("masters");
        } else {
          skipRitualFinally = true;
          closeSpreadReadingRitual();
          setIntentionSpreadLoading(false);
          const terminal = isTerminalIntentionSpreadError(err);
          const waitAborted = isIntentionSpreadWaitAborted(err);
          try {
            const cardNames =
              sessionSpreadMetaRef.current?.cardNames ??
              (cards.length
                ? cards
                : (readIntentionSpreadForMaster(characterKey)?.cards.map((c) => c.name) ?? []));
            const recoverySpreadId =
              sessionSpreadMetaRef.current?.spreadId ?? spreadId;
            if (
              !terminal &&
              chatSessionId &&
              hasCompleteSpread(cardNames, recoverySpreadId, "new")
            ) {
              const polled = await pollIntentionSpreadReading(
                {
                  characterId: characterKey,
                  intention,
                  cardNames,
                  spreadId: recoverySpreadId,
                  cardCount: requiredCardCount(recoverySpreadId, "new"),
                  sessionId: chatSessionId,
                },
                {
                  maxAttempts: waitAborted
                    ? INTENTION_SPREAD_LATE_RECOVERY_POLL_MAX_ATTEMPTS
                    : INTENTION_SPREAD_RECOVERY_POLL_MAX_ATTEMPTS,
                }
              );
              const recovered = polled ? resolveClientReadingText(polled, cardNames) : "";
              if (recovered) {
                const spreadCardsRecovered =
                  readIntentionSpreadForMaster(characterKey)?.cards ??
                  cardNames.map((name, i) => ({ id: i, name, meaning: "" }));
                const systemRecovered =
                  readIntentionSpreadForMaster(characterKey)?.system ??
                  previewDeckSystem ??
                  resolveMasterDeckSystem(characterKey);
                const intentionCardsKeyRecovered = spreadKey(spreadCardsRecovered);
                readingDelivered = true;
                spreadReadingRecoveryKeyRef.current = `${characterKey}:${intention}:${intentionCardsKeyRecovered}`;
                setReadingRitualCountdownDone(true);
                deps.setMessages(() => {
                  const next = appendSpreadReadingMessage([], recovered);
                  if (next.length) {
                    saveChatCache(characterKey, next, intentionCardsKeyRecovered, {
                      cards: spreadCardsRecovered,
                      system: systemRecovered,
                      variant: "intention",
                    });
                  }
                  return next;
                });
              }
            }
          } catch {
            /* show explicit error below */
          }
          if (!readingDelivered) {
            const msg =
              err instanceof Error && err.message.trim()
                ? err.message.trim()
                : "Не удалось завершить трактовку. Попробуйте ещё раз.";
            setTripletNotice(msg);
            deps.setMessages([
              {
                id: generateId(),
                role: "assistant",
                content: msg,
                timestamp: new Date(),
              },
            ]);
          }
        }
      } finally {
        if (!skipRitualFinally) {
          await ensureMinSpreadRitualDisplay(ritualStartedAt);
          closeSpreadReadingRitual();
        }
        setIntentionSpreadLoading(false);
        deps.chatLoadedForRef.current = characterKey;
        readingInFlightRef.current = false;
        deps.skipNextReadingRef.current = !readingDelivered;
        deps.pendingNewChatThreadRef.current = false;
        void deps.refreshSessionsList(characterKey);
      }
    },
    [
      bindSessionToMaster,
      archiveActiveMasterSession,
      ensureMasterChatSessionId,
      session?.offline,
      session?.sessionId,
      refreshSavedReadings,
      setStep,
      reconnectSession,
      spawnSession,
      referrerSlug,
      getActiveProfile,
      persistProfile,
      chatDepsRef,
      loadReadingRef,
      handleOpenPaywallRef,
    ]
  );
  openChatWithSessionParamsRef.current = openChatWithSessionParams;

  const handleSelectCharacter = (characterId: string) => {
    void openChatWithCharacterRef.current(characterId);
  };

  const handleMasterPick = async (
    masterId: string,
    options?: { continueSession?: boolean; forceIntention?: boolean }
  ) => {
    const deps = chat();

    if (!isLoggedIn) {
      const system = resolveMasterDeckSystem(masterId);
      const isClassicTarot =
        system === "tarot-veronika" || system === "tarot-marina";
      if (!isClassicTarot) {
        markGuestExplicitMaster(masterId);
        if (typeof document !== "undefined") {
          requestAnimationFrame(() => {
            document
              .getElementById("наставники")
              ?.scrollIntoView({ behavior: "smooth", block: "start" });
          });
        }
        return;
      }
      markGuestExplicitMaster(GUEST_TRIPLET_MASTER_ID);
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent(GUEST_SPREAD_START_EVENT, {
            detail: { masterId: GUEST_TRIPLET_MASTER_ID },
          })
        );
        requestAnimationFrame(() => {
          document.getElementById(GUEST_SPREAD_PICKER_ID)?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }
      return;
    }

    localStorage.setItem(PENDING_MASTER_KEY, masterId);
    if (typeof document !== "undefined") {
      requestAnimationFrame(() => {
        document
          .getElementById("наставники")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }

    const activeProfile = getActiveProfile();
    const localBirth = Boolean(
      String(activeProfile?.birthDate ?? profile?.birthDate ?? "").trim()
    );
    if (hasPendingServerProfile() || (!authUser?.profileUserId && !localBirth)) {
      forceProfileOnboarding();
      return;
    }
    if (!localBirth) {
      forceProfileOnboarding();
      return;
    }

    const hasSpread =
      displayTarotCards.length >= 3 ||
      (activeProfile?.tarotCards?.length ?? 0) >= 3 ||
      (profile?.tarotCards?.length ?? 0) >= 3;

    if (
      !options?.forceIntention &&
      !options?.continueSession &&
      !hasPendingGuestQuestion() &&
      hasSpread &&
      tripletOwnerMasterId &&
      masterId === tripletOwnerMasterId &&
      !isNumerologMaster(masterId)
    ) {
      clearPendingMasterResume();
      const master = findShowcaseMaster(masterId, masters);
      const system = master?.system ?? resolveMasterDeckSystem(masterId);
      const masterSpread = getSpreadForSystem(activeProfile ?? profile, system);
      const spreadCards =
        masterSpread.length >= 3
          ? masterSpread
          : displayTarotCards.length >= 3
            ? displayTarotCards
            : activeProfile?.tarotCards?.length
              ? activeProfile.tarotCards!
              : masterSpread;
      const cardsKey = spreadKey(spreadCards);
      const cachedTripletChat = cardsKey ? loadChatCache(masterId, cardsKey) : null;
      const tripletReadingDone =
        Boolean(cardsKey && masterHasReadingForSpread(savedReadings, masterId, cardsKey)) ||
        Boolean(cachedTripletChat && chatHasSpreadReading(cachedTripletChat));

      if (tripletReadingDone) {
        sessionListBackMasterRef.current = masterId;
        sessionSpreadMetaRef.current = {
          spreadType: "daily",
          cardNames: spreadCards.map((c) => c.name),
        };
        setIntentionSpread(null);
        persistIntentionSpreadState(masterId, null);
        setSessionIntention(null);
        persistSessionIntention(masterId, null);
        setSpreadFlipped(spreadFlippedState(spreadCards.length, true));
        if (deps) {
          deps.skipNextReadingRef.current = true;
          deps.chatLoadedForRef.current = null;
          deps.setSessionOnlyChat(false);
          deps.setSessionListMaster(null);
        }
        let sessionId: string | undefined;
        try {
          const sessionsRes = await fetch(
            `/api/sessions?characterKey=${encodeURIComponent(masterId)}`
          );
          if (sessionsRes.ok) {
            const sessionsData = (await sessionsRes.json()) as {
              active: SessionListItem | null;
              completed: SessionListItem[];
            };
            sessionId =
              sessionsData.active?.id ??
              sessionsData.completed?.find((item) => item.messageCount > 0)?.id;
          }
        } catch {
          /* resume without bound session */
        }
        if (sessionId && deps) {
          deps.setConsultationSessionId(sessionId);
          deps.consultationSessionIdRef.current = sessionId;
          deps.setConsultationReadOnly(false);
          deps.archiveSessionIdRef.current = null;
        }
        await bindSessionToMaster(masterId, sessionId);
        await openChatWithCharacterRef.current(masterId, {
          intention: null,
          preserveSpreadState: true,
        });
        return;
      }

      sessionListBackMasterRef.current = masterId;
      await openChatWithSessionParamsRef.current({
        characterKey: masterId,
        intention: null,
        spreadType: "daily",
        cards: spreadCards.map((c) => c.name),
      });
      return;
    }

    if (!options?.forceIntention && deps) {
      const openSessionListShell = () => {
        // Leave the scrolled masters salon before the fetch finishes.
        deps.setSelectedCharacter(null);
        deps.setConsultationSessionId(null);
        deps.setConsultationReadOnly(false);
        deps.archiveSessionIdRef.current = null;
        deps.setSessionsListData({ active: null, completed: [] });
        deps.setSessionsListLoading(true);
        deps.setSessionListMaster(masterId);
        setStep("masters");
        localStorage.setItem(FLOW_STEP_KEY, "masters");
      };

      if (!options?.continueSession) {
        openSessionListShell();
      } else {
        deps.setSessionsListData({ active: null, completed: [] });
        deps.setSessionsListLoading(true);
      }

      try {
        const sessionsRes = await fetch(
          `/api/sessions?characterKey=${encodeURIComponent(masterId)}`
        );
        const sessionsData = sessionsRes.ok
          ? ((await sessionsRes.json()) as {
              active: SessionListItem | null;
              completed: SessionListItem[];
            })
          : { active: null, completed: [] };

        if (!options?.continueSession) {
          let active = sessionsData.active;
          let completed = sessionsData.completed ?? [];
          if (
            !active &&
            !completed.length &&
            resolvePhotoReadingContinuePayload(savedReadings, masterId)
          ) {
            const syncedId = await syncPhotoSessionForMaster(masterId);
            if (syncedId) {
              const refreshRes = await fetch(
                `/api/sessions?characterKey=${encodeURIComponent(masterId)}`
              );
              if (refreshRes.ok) {
                const refreshed = (await refreshRes.json()) as {
                  active: SessionListItem | null;
                  completed: SessionListItem[];
                };
                active = refreshed.active;
                completed = refreshed.completed ?? [];
              }
            }
          }
          deps.setSessionsListLoading(false);
          deps.setSessionsListData({ active, completed });
          clearPendingMasterResume();
          return;
        }

        if (sessionsData.active) {
          const activeSession = sessionsData.active;
          clearPendingMasterResume();
          deps.setSessionListMaster(null);
          sessionListBackMasterRef.current = masterId;
          deps.setConsultationReadOnly(false);
          deps.setConsultationSessionId(activeSession.id);
          deps.consultationSessionIdRef.current = activeSession.id;
          deps.archiveSessionIdRef.current = null;
          deps.setPhotoChatSpread(null);
          setTripletNotice(null);
          await bindSessionToMaster(masterId, activeSession.id);
          deps.skipNextReadingRef.current = activeSession.messageCount > 0;
          deps.chatLoadedForRef.current = null;
          deps.setSessionOnlyChat(false);

          applyHistorySessionMetaRef.current(
            {
              sessionId: activeSession.id,
              intention: activeSession.intention,
              spreadType: activeSession.spreadType,
              spreadId: activeSession.spreadId,
              cards: activeSession.cards,
            },
            masterId
          );

          const restoreSpreadId = activeSession.spreadId ?? DEFAULT_SPREAD_ID;
          if (
            activeSession.cards &&
            hasCompleteSpread(activeSession.cards, restoreSpreadId, activeSession.spreadType)
          ) {
            const system = resolveMasterDeckSystem(masterId);
            const symbols = resolveSpreadSymbols(system, activeSession.cards);
            if (
              hasCompleteSpread(
                symbols.map((c) => c.name),
                restoreSpreadId,
                activeSession.spreadType
              )
            ) {
              applyRestoredChatSpreadRef.current(
                {
                  cards: symbols,
                  system,
                  type:
                    activeSession.spreadType === "daily" ? "reading" : "intention_spread",
                  cardsKey: spreadKey(symbols),
                  intention: activeSession.intention,
                },
                masterId
              );
              setSpreadFlipped(spreadFlippedState(symbols.length, true));
            }
          }

          await openChatWithCharacterRef.current(masterId, {
            intention: null,
            preserveSpreadState: true,
          });
          return;
        }
      } catch {
        deps.setSessionsListLoading(false);
      } finally {
        deps.setSessionsListLoading(false);
      }
    }

    if (hasSpread) {
      const ownerId = tripletOwnerMasterId;
      if (ownerId && masterId !== ownerId && !isNumerologMaster(masterId)) {
        const ownerName =
          findShowcaseMaster(ownerId, masters)?.name ??
          getCharacterById(ownerId)?.name ??
          "мастером расклада";
        setTripletNotice(
          `Карты дня выпали для ${ownerName}. С другими мастерами — только вопросы, без дневного расклада.`
        );
        clearPendingMasterResume();
        if (deps) {
          deps.setSessionListMaster(null);
          deps.setPhotoChatSpread(null);
        }
        sessionListBackMasterRef.current = masterId;
        await bindSessionToMaster(masterId);
        readingInFlightRef.current = true;
        try {
          if (deps) deps.skipNextReadingRef.current = true;
          await openChatWithCharacterRef.current(masterId, {
            sessionOnly: true,
            intention: null,
          });
        } finally {
          readingInFlightRef.current = false;
        }
        return;
      }

      if (!isNumerologMaster(masterId)) {
        const master = findShowcaseMaster(masterId, masters);
        const system = master?.system ?? resolveMasterDeckSystem(masterId);
        const masterSpread = getSpreadForSystem(activeProfile ?? profile, system);
        const spreadCards =
          masterSpread.length >= 3
            ? masterSpread
            : displayTarotCards.length >= 3
              ? displayTarotCards
              : activeProfile?.tarotCards?.length
                ? activeProfile.tarotCards!
                : masterSpread;
        const spreadSystem = masterSpread.length >= 3 ? system : displayDeckSystem;

        if (profile && (profile.deckSystem !== spreadSystem || profile.tarotCards !== spreadCards)) {
          persistProfile({
            ...profile,
            tarotCards: spreadCards,
            deckSystem: spreadSystem,
          });
        } else if (
          activeProfile &&
          !profile &&
          authUser?.name &&
          !activeProfile.name?.trim()
        ) {
          persistProfile({ ...activeProfile, name: authUser.name });
        }

        if (deps) deps.setPhotoChatSpread(null);
        setTripletNotice(null);
        await bindSessionToMaster(masterId);

        const spreadCardsKeyVal = spreadKey(spreadCards);
        const cachedSpreadChat = spreadCardsKeyVal
          ? loadChatCache(masterId, spreadCardsKeyVal)
          : null;
        const existingChat =
          cachedSpreadChat && cachedSpreadChat.length > 0 ? cachedSpreadChat : null;

        if (!options?.forceIntention && options?.continueSession && existingChat && deps) {
          clearPendingMasterResume();
          deps.setSessionListMaster(null);
          sessionListBackMasterRef.current = masterId;
          setSessionIntention(null);
          persistSessionIntention(masterId, null);
          setIntentionSpread(null);
          persistIntentionSpreadState(masterId, null);
          deps.skipNextReadingRef.current = chatHasSpreadReading(existingChat);
          deps.chatLoadedForRef.current = null;
          await openChatWithCharacterRef.current(masterId, { intention: null });
          return;
        }

        clearPendingMasterResume();
        const cardNames = spreadCards.map((c) => c.name);
        sessionListBackMasterRef.current = masterId;
        if (deps) deps.setSessionListMaster(null);
        await openChatWithSessionParams({
          characterKey: masterId,
          intention: null,
          spreadType: "daily",
          cards: cardNames,
        });
        return;
      }
    }

    if (isNumerologMaster(masterId) && deps) {
      clearPendingMasterResume();
      setTripletNotice(null);
      deps.setSelectedCharacter(null);
      deps.setConsultationSessionId(null);
      deps.setConsultationReadOnly(false);
      deps.archiveSessionIdRef.current = null;
      deps.setSessionsListData({ active: null, completed: [] });
      deps.setSessionsListLoading(true);
      deps.setSessionListMaster(masterId);
      setStep("masters");
      localStorage.setItem(FLOW_STEP_KEY, "masters");
      try {
        const sessionsRes = await fetch(
          `/api/sessions?characterKey=${encodeURIComponent(masterId)}`
        );
        const sessionsData = sessionsRes.ok
          ? ((await sessionsRes.json()) as {
              active: SessionListItem | null;
              completed: SessionListItem[];
            })
          : { active: null, completed: [] };
        deps.setSessionsListData({
          active: sessionsData.active,
          completed: sessionsData.completed ?? [],
        });
        return;
      } catch {
        /* fall through to generic session-only chat */
      } finally {
        deps.setSessionsListLoading(false);
      }
    }

    clearPendingMasterResume();
    setTripletNotice(null);
    await bindSessionToMaster(masterId);
    readingInFlightRef.current = true;
    try {
      if (deps) deps.skipNextReadingRef.current = true;
      await openChatWithCharacterRef.current(masterId, { sessionOnly: true, intention: null });
    } finally {
      readingInFlightRef.current = false;
    }
  };

  useEffect(() => {
    if (authLoading || sessionLoading || !isLoggedIn || autoResumeDoneRef.current) return;
    if (hasPendingGuestQuestion()) return;
    // Never auto-open chat before birth profile exists on the server.
    if (!authUser?.profileUserId || hasPendingServerProfile()) return;
    // Stale onboarding_required is fine once profile exists — guest bootstrap owns resume.

    const params = new URLSearchParams(window.location.search);
    // Home "/" must never reopen the last reading from localStorage alone.
    // Open chat only for explicit URL intent: ?resume=chat and/or ?master=.
    const resumeChat = params.get("resume") === "chat";
    const masterFromUrl = params.get("master") ?? params.get("continue");
    let continueMaster = masterFromUrl;
    if (!continueMaster && resumeChat) {
      continueMaster =
        localStorage.getItem(LAST_MASTER_KEY) ??
        localStorage.getItem(PENDING_MASTER_KEY);
    }
    const shouldOpenChat = Boolean(continueMaster) && (resumeChat || Boolean(masterFromUrl));
    if (params.get("step") === "chat" || localStorage.getItem(FLOW_STEP_KEY) === "chat") {
      if (params.get("step") === "chat") {
        const cleaned = new URL(window.location.href);
        cleaned.searchParams.delete("step");
        const qs = cleaned.searchParams.toString();
        window.history.replaceState(
          null,
          "",
          qs ? `${cleaned.pathname}?${qs}` : cleaned.pathname
        );
      }
      if (!shouldOpenChat && localStorage.getItem(FLOW_STEP_KEY) === "chat") {
        persistStep("masters");
      }
    }
    if (!shouldOpenChat || !continueMaster) return;
    const masterToOpen = continueMaster;

    const intentionSkip = params.get("intentionSkip") === "1";
    const intentionRaw = params.get("intention");
    const intentionModeRaw = params.get("intentionMode");
    if (!resumeChat && selectedCharacter) return;

    autoResumeDoneRef.current = true;
    const cleaned = new URL(window.location.href);
    for (const key of [
      "master",
      "continue",
      "resume",
      "sessionId",
      "intention",
      "intentionMode",
      "intentionSkip",
    ]) {
      cleaned.searchParams.delete(key);
    }
    // Keep resume=chat for explicit deep links; never re-stamp ?step=chat.
    cleaned.searchParams.delete("step");
    const nextUrl = cleaned.searchParams.toString();
    window.history.replaceState(
      null,
      "",
      nextUrl ? `${cleaned.pathname}?${nextUrl}` : cleaned.pathname
    );

    const activeProfile = getActiveProfile();
    const hasSpread =
      (activeProfile?.tarotCards?.length ?? 0) >= 3 ||
      (profile?.tarotCards?.length ?? 0) >= 3 ||
      displayTarotCards.length >= 3;

    if (!resumeChat && !hasSpread) {
      localStorage.setItem(PENDING_MASTER_KEY, masterToOpen);
      applyTripletMaster(masterToOpen);
      if (activeProfile?.birthDate) {
        setStep("triplet");
      } else {
        setStep("onboarding");
      }
      return;
    }

    const sessionIdParam = params.get("sessionId");

    void (async () => {
      const deps = chat();
      if (deps) deps.chatLoadedForRef.current = null;
      pendingChatOptsRef.current = { masterId: masterToOpen, skipReading: false };
      if (sessionIdParam && deps) {
        deps.setConsultationSessionId(sessionIdParam);
        deps.consultationSessionIdRef.current = sessionIdParam;
      }
      await bindSessionToMasterRef.current(
        masterToOpen,
        sessionIdParam ?? undefined
      );
      if (intentionSkip) {
        await beginChatAfterIntention(masterToOpen, null, "existing");
        return;
      }
      if (intentionRaw) {
        const intention = intentionRaw as SessionIntention;
        const mode: IntentionStartMode =
          intentionModeRaw === "fresh" || intentionModeRaw === "existing"
            ? intentionModeRaw
            : "fresh";
        await beginChatAfterIntention(masterToOpen, intention, mode);
        return;
      }
      await beginChatAfterIntention(masterToOpen, null, "existing");
    })();
  }, [
    authLoading,
    sessionLoading,
    isLoggedIn,
    authUser?.profileUserId,
    selectedCharacter,
    beginChatAfterIntention,
    getActiveProfile,
    profile?.tarotCards?.length,
    displayTarotCards.length,
    setStep,
    applyTripletMaster,
  ]);

  useEffect(() => {
    if (authLoading || !isLoggedIn) return;
    if (step === "triplet" || step === "onboarding") return;

    const pending = readPendingReading();
    if (!pending) {
      pendingReadingResumeRef.current = null;
      return;
    }

    const resumeKey = `${pending.masterId}:${pending.required}`;
    if (pendingReadingResumeRef.current === resumeKey) return;
    pendingReadingResumeRef.current = resumeKey;

    void (async () => {
      const deps = chat();
      try {
        const res = await fetch("/api/runes/balance");
        if (!res.ok) return;
        const data = await res.json();
        onRuneBalancePayload?.(data);

        if (pending.required > 0 && (data.balance ?? 0) < pending.required) return;

        if (pendingReadingMasterRef) pendingReadingMasterRef.current = null;
        if (deps) deps.setInsufficientRunes(null);

        if (selectedCharacter === pending.masterId && step === "chat") {
          if (deps && !chatHasSpreadReading(deps.messages)) {
            readingInFlightRef.current = true;
            try {
              await loadReadingRef.current(pending.masterId);
              clearPendingReading();
            } finally {
              readingInFlightRef.current = false;
            }
          } else {
            clearPendingReading();
          }
          return;
        }

        void openChatWithCharacterRef.current(pending.masterId);
      } catch {
        pendingReadingResumeRef.current = null;
      }
    })();
  }, [
    authLoading,
    isLoggedIn,
    selectedCharacter,
    step,
    onRuneBalancePayload,
    pendingReadingMasterRef,
    readingInFlightRef,
    chatDepsRef,
    loadReadingRef,
    openChatWithCharacterRef,
  ]);

  const handleContinueListedSession = useCallback(
    async (masterId: string, item: SessionListItem) => {
      const deps = chat();
      sessionListBackMasterRef.current = masterId;
      if (deps) deps.setSessionListMaster(null);
      if (deps) {
        deps.setConsultationReadOnly(false);
        deps.setConsultationSessionId(item.id);
        deps.consultationSessionIdRef.current = item.id;
        deps.archiveSessionIdRef.current = null;
      }
      await bindSessionToMaster(masterId, item.id);
      localStorage.setItem(LAST_MASTER_KEY, masterId);
      persistStep("chat");
      setStep("chat");
      if (deps) {
        deps.skipNextReadingRef.current = item.messageCount > 0;
        deps.chatLoadedForRef.current = null;
        deps.setSessionOnlyChat(false);
      }

      applyHistorySessionMetaRef.current(
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
          applyRestoredChatSpreadRef.current(
            {
              cards: symbols,
              system,
              type: item.spreadType === "daily" ? "reading" : "intention_spread",
              cardsKey: spreadKey(symbols),
              intention: item.intention,
            },
            masterId
          );
          setSpreadFlipped(spreadFlippedState(symbols.length, true));
        }
      }

      await openChatWithCharacterRef.current(masterId, {
        intention: null,
        preserveSpreadState: true,
      });
    },
    [
      bindSessionToMaster,
      openChatWithCharacterRef,
      applyHistorySessionMetaRef,
      applyRestoredChatSpreadRef,
      setStep,
      setSpreadFlipped,
    ]
  );

  const handleSessionListBack = useCallback(() => {
    const deps = chat();
    sessionListBackMasterRef.current = null;
    setMatrixSessionBirthDate(null);
    setMatrixSessionSubjectName(null);
    setMatrixSessionAsOf(null);
    if (deps) {
      deps.setSessionListMaster(null);
      deps.setSelectedCharacter(null);
      deps.setConsultationSessionId(null);
      deps.setConsultationReadOnly(false);
      deps.archiveSessionIdRef.current = null;
      deps.setIsLoading(false);
      deps.setIsLoadingHistory(false);
    }
    readingInFlightRef.current = false;
    setIntentionSpreadLoading(false);
    setShowSessionFlow(false);
    setStep("masters");
    localStorage.setItem(FLOW_STEP_KEY, "masters");
    requestAnimationFrame(() => {
      document.getElementById("наставники")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [setStep, readingInFlightRef, chatDepsRef]);

  const applyGuestResumeResultNotice = useCallback(
    (result: Awaited<ReturnType<typeof runGuestTripletResume>>) => {
      if (result.ok) {
        setGuestResumeCanRetry(false);
        clearGuestTriplet();
        setTripletNotice(null);
        return;
      }
      if (result.phase === "onboarding_required") {
        forceProfileOnboarding();
        return;
      }
      if (result.capacitorRecovery || result.phase === "safe_recovery") {
        setGuestResumeCanRetry(false);
        setTripletNotice(GUEST_RESUME_CAPACITOR_RECOVERY);
        return;
      }
      if (result.stage === "already_used") {
        setGuestResumeCanRetry(false);
        clearGuestTriplet();
        clearGuestResumeUiCache();
        setTripletNotice(GUEST_RESUME_ALREADY_USED);
        return;
      }
      if (result.stage === "expired" || result.phase === "idle") {
        setGuestResumeCanRetry(false);
        setTripletNotice(null);
        return;
      }
      setGuestResumeCanRetry(true);
      setTripletNotice(GUEST_RESUME_RETRY_TITLE);
    },
    [forceProfileOnboarding]
  );

  const retryGuestTripletResume = useCallback(() => {
    const cache = loadGuestResumeUiCache();
    if (!cache || !isLoggedIn) return;
    setGuestResumeCanRetry(false);
    setTripletNotice(`${GUEST_RESUME_TRANSITION_TITLE}. ${GUEST_RESUME_TRANSITION_SUBTITLE}`);
    guestResumeBootRef.current = true;
    void runGuestTripletResume({
      authMethod: "retry",
      loadReading: (args) =>
        loadGuestResumeReadingRef.current({
          ...args,
          profileBase: getActiveProfile(),
          questionFallback: getActiveProfile()?.mainQuestion,
          teaserFallback: cache.teaser,
          deckSystem: cache.system as StoredProfile["deckSystem"],
        }),
    }).then((result) => {
      applyGuestResumeResultNotice(result);
      if (!result.ok) guestResumeBootRef.current = false;
    });
  }, [isLoggedIn, getActiveProfile, applyGuestResumeResultNotice]);

  useEffect(() => {
    if (!isLoggedIn) {
      guestResumeHydrateAttemptedRef.current = false;
      return;
    }
    if (guestResumeBootRef.current) return;
    if (step === "intro") return;
    if (authLoading) return;

    const active = getActiveProfile();
    const hasBirth = Boolean(String(active?.birthDate ?? "").trim());
    const savedProfileAuthority = profileSaveAuthorityRef.current;
    const hasServerProfile = Boolean(
      authUser?.profileUserId ||
        (savedProfileAuthority && savedProfileAuthority.expiresAt > Date.now())
    );

    let cache = loadGuestResumeUiCache();
    if (!cache && !(hasBirth && hasServerProfile)) {
      setTripletNotice((prev) =>
        prev &&
        (prev.includes(GUEST_RESUME_TRANSITION_SUBTITLE) ||
          prev === GUEST_RESUME_RETRY_TITLE)
          ? null
          : prev
      );
      return;
    }

    // Lock before any await — unstable deps used to stampede /api/guest-triplet/status.
    guestResumeBootRef.current = true;
    let cancelled = false;

    void (async () => {
      // Cookie/localStorage loss after re-register: hydrate from latest owned claim (once).
      if (!cache && hasBirth && hasServerProfile) {
        if (guestResumeHydrateAttemptedRef.current) {
          guestResumeBootRef.current = false;
          return;
        }
        guestResumeHydrateAttemptedRef.current = true;
        try {
          const res = await fetch("/api/guest-triplet/status", {
            method: "GET",
            credentials: "include",
            cache: "no-store",
          });
          const owned = (await res.json().catch(() => null)) as {
            ok?: boolean;
            status?: string;
            sessionId?: string;
            masterId?: string;
            question?: string;
            system?: string;
            cards?: Array<{
              id: number;
              name: string;
              position: number;
              reversed: boolean;
            }>;
            readingId?: string | null;
          } | null;
          const cardsOk =
            Array.isArray(owned?.cards) && (owned?.cards.length ?? 0) === 3;
          if (
            !cancelled &&
            owned?.ok &&
            owned.sessionId &&
            cardsOk &&
            (owned.status === "claimed" ||
              (owned.status === "reading_consumed" && owned.readingId))
          ) {
            cache = {
              version: 1,
              origin: "guest",
              masterId: owned.masterId || "veronika",
              system: owned.system || "tarot-veronika",
              spreadId: "triplet",
              question: owned.question ?? "",
              teaser: "",
              cards: owned.cards!,
              completedAt: new Date().toISOString(),
              claimedSessionId: owned.sessionId,
              phase: "resuming_reading",
            };
            saveGuestResumeUiCache(cache);
          }
        } catch {
          /* ignore — fall through */
        }
      }

      if (cancelled) {
        guestResumeBootRef.current = false;
        return;
      }

      if (!cache) {
        setTripletNotice((prev) =>
          prev &&
          (prev.includes(GUEST_RESUME_TRANSITION_SUBTITLE) ||
            prev === GUEST_RESUME_RETRY_TITLE)
            ? null
            : prev
        );
        guestResumeBootRef.current = false;
        return;
      }

      if (!hasBirth || !hasServerProfile) {
        if (step !== "onboarding" || selectedCharacter) {
          forceProfileOnboarding();
        } else {
          patchGuestResumeUiCache({ phase: "onboarding_required" });
          setTripletNotice(null);
        }
        guestResumeBootRef.current = false;
        return;
      }

      // Profile is ready — resume even if the form step is still "onboarding".
      setGuestResumeCanRetry(false);
      setTripletNotice(
        `${GUEST_RESUME_TRANSITION_TITLE}. ${GUEST_RESUME_TRANSITION_SUBTITLE}`
      );

      const result = await runGuestTripletResume({
        authMethod: "bootstrap",
        loadReading: (args) =>
          loadGuestResumeReadingRef.current({
            ...args,
            profileBase: active,
            questionFallback: active?.mainQuestion,
            teaserFallback: cache!.teaser,
            deckSystem: cache!.system as StoredProfile["deckSystem"],
          }),
      });
      if (cancelled) {
        guestResumeBootRef.current = false;
        return;
      }
      applyGuestResumeResultNotice(result);
      if (!result.ok) guestResumeBootRef.current = false;
    })();

    return () => {
      cancelled = true;
      // Remount (Strict Mode) may retry resume; hydrateAttemptedRef blocks status storms.
      guestResumeBootRef.current = false;
    };
  }, [
    isLoggedIn,
    authLoading,
    authUser?.profileUserId,
    step,
    profile?.birthDate,
    applyGuestResumeResultNotice,
    forceProfileOnboarding,
    selectedCharacter,
    getActiveProfile,
  ]);

  return {
    masters,
    tripletSystem,
    setTripletSystem,
    tripletMasterId,
    setTripletMasterId,
    newTripletDraft,
    setNewTripletDraft,
    tripletNotice,
    setTripletNotice,
    guestResumeCanRetry,
    retryGuestTripletResume,
    tripletCooldown,
    tripletCooldownReady,
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
    setPendingMasterId,
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
    setSavedReadings,
    serverContinueIds,
    newTripletInProgressRef,
    tripletPendingRef,
    tripletDrawnAtRef,
    autoResumeDoneRef,
    pendingReadingResumeRef,
    bindSessionToMasterRef,
    spreadReadingRecoveryKeyRef,
    sessionListBackMasterRef,
    pendingChatOptsRef,
    sessionSpreadMetaRef,
    matrixSessionBirthDate,
    setMatrixSessionBirthDate,
    matrixSessionSubjectName,
    setMatrixSessionSubjectName,
    effectiveTripletCooldown,
    tripletCountdown,
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
    handleClearTripletFromMain,
    handleNewReading,
    startPersonalFlow,
    applyTripletMaster,
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
    syncProfileFromServer,
    handleSpreadReadingRitualComplete,
    resetSpreadOnAccountSwitch,
  };
}
