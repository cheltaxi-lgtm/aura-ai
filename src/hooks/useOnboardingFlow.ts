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
  chatHasSpreadReading,
  type CachedChatSpread,
} from "@/lib/chat-cache";
import { resolveClientReadingText } from "@/lib/chat-reply-sanitize";
import {
  persistSessionIntention,
  persistSessionCustomQuestion,
  persistIntentionSpreadState,
  readIntentionSpreadForMaster,
  type SessionIntention,
  type SessionTopicId,
} from "@/lib/intention";
import { buildSessionSpreadCards, resolveSpreadSymbols } from "@/lib/intention-draw";
import { toSessionTopicId } from "@/lib/session-topics";
import { postIntentionSpreadRequest, pollIntentionSpreadReading } from "@/lib/intention-spread-client";
import { waitForSpreadReadingRitual } from "@/components/SpreadReadingRitualPanel";
import { generateId } from "@/lib/id";
import {
  DEFAULT_DECK_SYSTEM,
  getDeckPositions,
  resolveMasterDeckSystem,
  spreadKey,
} from "@/lib/decks";
import { DEFAULT_SPREAD_ID, getSpread, hasCompleteSpread, normalizeSpreadId, resolveSpreadPositions, spreadFlippedState, resolveClientSpreadId, hasExplicitClientSpreadId, requiredCardCount, type SpreadId } from "@/lib/spreads";
import type { DeckSystem } from "@/lib/decks/types";
import type { SpreadSymbol } from "@/lib/decks/types";
import type { DeckCardInput } from "@/lib/deck-card-utils";
import {
  resolvePhotoSpreadFromReadings,
  resolvePhotoReadingContinuePayload,
} from "@/lib/photo-chat";
import {
  getSpreadForSystem,
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
  recommendShowcaseMaster,
  type ShowcaseMaster,
} from "@/lib/showcase-masters";
import { getCharacterById } from "@/lib/characters";
import { isNumerologMaster } from "@/lib/numerolog/welcome";
import {
  DEFAULT_NUMEROLOG_SESSION_TOOL,
  numerologToolDrawCount,
  numerologToolPositions,
} from "@/lib/numerology/tools";
import { mergeGuestTripletIntoProfile, clearGuestTriplet } from "@/lib/guest-triplet";
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
      spreadId?: SpreadId;
      cards: string[];
      awaitingContext?: boolean;
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
  }
) => Promise<void>;

type OpenChatWithCharacterFn = (
  characterId: string,
  openOptions?: {
    forceNew?: boolean;
    sessionOnly?: boolean;
    intention?: SessionIntention | null;
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
    cards?: string[] | null;
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
  authUser: { name?: string | null } | null | undefined;
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
  } = options;

  const chat = () => chatDepsRef.current;

  const [tripletSystem, setTripletSystem] = useState<DeckSystem>(DEFAULT_DECK_SYSTEM);
  const [tripletMasterId, setTripletMasterId] = useState("");
  const [masters, setMasters] = useState<ShowcaseMaster[]>(() => getAiMasters());
  const [savedReadings, setSavedReadings] = useState<StoredReadingRow[]>([]);
  const [tripletCooldown, setTripletCooldown] = useState<TripletCooldownStatus | null>(null);
  const [tripletCooldownReady, setTripletCooldownReady] = useState(false);
  const [tripletNotice, setTripletNotice] = useState<string | null>(null);
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
  } | null>(null);
  const [pendingMasterId, setPendingMasterId] = useState<string | null>(null);
  const [spreadFlipped, setSpreadFlipped] = useState([false, false, false]);
  const [hideChatSpread, setHideChatSpread] = useState(false);

  const spreadReadingRecoveryKeyRef = useRef<string | null>(null);
  const autoResumeDoneRef = useRef(false);
  const newTripletInProgressRef = useRef(false);
  const pendingReadingResumeRef = useRef<string | null>(null);
  const sessionSpreadMetaRef = useRef<{
    spreadType?: "daily" | "new" | "photo";
    spreadId?: SpreadId;
    cardNames?: string[];
    numerologToolId?: import("@/lib/numerology/tools").NumerologToolId;
    numerologToolParams?: import("@/lib/numerology/tools").NumerologToolParams;
  } | null>(null);
  const tripletPendingRef = useRef<{ cards: SpreadSymbol[]; teaser: string } | null>(null);
  const tripletDrawnAtRef = useRef(0);
  const bindSessionToMasterRef = useRef<(masterId: string, overrideSessionId?: string) => Promise<void>>(
    async () => {}
  );
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
      if (!hasServerTripletSpread(savedReadings)) return [];
      const latest = resolveTripletDisplaySpread(savedReadings, null, tripletSystem);
      return latest.cards.length >= 3 ? latest.cards : [];
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
      if (!hasServerTripletSpread(savedReadings)) return profile?.deckSystem ?? tripletSystem;
      const latest = resolveTripletDisplaySpread(savedReadings, null, tripletSystem);
      return latest.cards.length >= 3 ? latest.system : (profile?.deckSystem ?? tripletSystem);
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
    tripletCountdown.tick,
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
        if (!data?.profile) return;

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
          setStepState((prev) =>
            prev === "onboarding" ? "triplet" : prev === "intro" ? "masters" : prev
          );
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
    if (!isLoggedIn || newTripletDraft || step === "triplet") return;
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
    if (!cardsKey || !masterHasReadingForSpread(savedReadings, tripletOwnerMasterId, cardsKey)) {
      return [];
    }
    return [tripletOwnerMasterId];
  }, [savedReadings, displayTarotCards, tripletOwnerMasterId]);

  const hasActiveSpread = displayTarotCards.length >= 3;
  const spreadReadingDone = hasActiveSpread && continueMasterIds.length > 0;

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
      localStorage.setItem(PENDING_MASTER_KEY, masterId);
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
      return undefined;
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
    if (intentionSpread?.masterId === selectedCharacter && intentionSpread.cards.length) {
      return spreadKey(intentionSpread.cards);
    }
    if (selectedCharacter) {
      const persisted = readIntentionSpreadForMaster(selectedCharacter);
      if (persisted?.cards.length) {
        return persisted.cardsKey || spreadKey(persisted.cards);
      }
    }
    if (chatSpread?.cardsKey && hasCompleteSpread(chatSpread.cards.map((c) => c.name), DEFAULT_SPREAD_ID, "daily")) {
      return chatSpread.cardsKey;
    }
    return spreadCardsKey;
  }, [intentionSpread, selectedCharacter, chatSpread, spreadCardsKey]);

  const shouldAutoLoadSpreadReading = useCallback(
    (masterId: string, cardsKey: string) => {
      const deps = chat();
      if (!cardsKey || deps?.sessionOnlyChat) return false;
      if (deps && chatHasSpreadReading(deps.messages)) return false;

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
    [savedReadings, intentionSpread, selectedCharacter, tripletOwnerMasterId, chatDepsRef, sessionSpreadMetaRef]
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
    source: "photo" | "triplet" | "intention" | "master" | "numerolog";
    cards: SpreadSymbol[] | DeckCardInput[];
    system: DeckSystem;
    spreadId: SpreadId | string;
    cardCount?: number;
    positions?: string[];
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
      const toolId =
        sessionSpreadMetaRef.current?.numerologToolId ?? DEFAULT_NUMEROLOG_SESSION_TOOL;
      const drawCount = numerologToolDrawCount(toolId);
      if (drawCount < 1) return null;

      const numerologCards = ((): SpreadSymbol[] | null => {
        if (
          chatSessionSpread?.masterId === selectedCharacter &&
          chatSessionSpread.cards.length >= drawCount
        ) {
          return chatSessionSpread.cards as SpreadSymbol[];
        }
        if ((cachedChatSpread?.cards.length ?? 0) >= drawCount) {
          return cachedChatSpread!.cards as SpreadSymbol[];
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
        if (savedNumerolog?.contextData?.tarotCards) {
          return savedNumerolog.contextData.tarotCards as SpreadSymbol[];
        }
        return null;
      })();

      if (!numerologCards) return null;

      const system =
        (chatSessionSpread?.masterId === selectedCharacter
          ? chatSessionSpread.system
          : undefined) ?? resolveMasterDeckSystem(selectedCharacter);

      return {
        source: "numerolog" as const,
        cards: numerologCards.slice(0, drawCount),
        system,
        spreadId: DEFAULT_SPREAD_ID,
        cardCount: drawCount,
        positions: numerologToolPositions(toolId),
      };
    }

    const metaSpreadId = sessionSpreadMetaRef.current?.spreadId ?? DEFAULT_SPREAD_ID;

    if (
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

    const resolveSavedIntentionSpread = (): {
      source: "intention";
      cards: SpreadSymbol[];
      system: DeckSystem;
      spreadId: SpreadId;
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
    if (displayTarotCards.length >= 3) {
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
    savedReadings,
    profile,
    masters,
    photoChatSpread,
    chatSpread,
    displayTarotCards,
    displayDeckSystem,
    cachedChatSpread,
  ]);

  const displaySpreadComplete = (() => {
    const names = chatDisplaySpread?.cards?.map((c) => c.name);
    if (chatDisplaySpread?.source === "numerolog") {
      return (names?.length ?? 0) >= (chatDisplaySpread.cardCount ?? 1);
    }
    return hasCompleteSpread(
      names,
      sessionSpreadMetaRef.current?.spreadId ?? DEFAULT_SPREAD_ID,
      sessionSpreadMetaRef.current?.spreadType
    );
  })();

  const spreadReadingPending =
    !chat()?.insufficientRunes &&
    (spreadReadingRitualOpen ||
      (intentionSpreadLoading &&
        displaySpreadComplete &&
        !(chat()?.messages && chatHasSpreadReading(chat()!.messages))));

  const needsSpreadFlip =
    !chat()?.sessionOnlyChat &&
    chatDisplaySpread?.source !== "photo" &&
    chatDisplaySpread?.source !== "numerolog" &&
    displaySpreadComplete;

  const allSpreadFlipped = !needsSpreadFlip || spreadFlipped.every(Boolean);

  const recommendedId = useMemo(() => {
    if (!masters.length || displayTarotCards.length < 3) return undefined;
    return recommendShowcaseMaster(displayTarotCards, masters);
  }, [masters, displayTarotCards]);

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
    const id = tripletMasterId || recapContinueMasterId || recommendedId;
    if (!id) return undefined;
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

  const handleOnboardingComplete = async (data: OnboardingData) => {
    if (!isLoggedIn) return;

    try {
      await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          gender: data.gender,
          birthDate: data.birthDate,
          birthTime: data.birthTime,
          birthCity: data.birthCity,
          lifeFocus: data.lifeFocus,
          mainQuestion: data.mainQuestion,
        }),
      });
    } catch {
      /* сохраним локально даже без сети */
    }

    const existingCards = profile?.tarotCards?.length ? profile.tarotCards : [];

    if (effectiveTripletCooldown && !effectiveTripletCooldown.allowed) {
      persistProfile({
        ...data,
        tarotCards: existingCards,
        teaser: profile?.teaser,
        userId: profile?.userId,
        name: data.name || authUser?.name || data.name,
      });
      setStep("masters");
      return;
    }
    persistProfile({
      ...data,
      tarotCards: existingCards,
      teaser: profile?.teaser,
      userId: profile?.userId,
      name: data.name || authUser?.name || data.name,
    });
    if (existingCards.length >= 3) {
      setStep("masters");
      return;
    }
    const defaultMaster = resolveDefaultTripletMasterId(masters, {
      pending: localStorage.getItem(PENDING_MASTER_KEY),
      tarotCards: existingCards,
    });
    if (defaultMaster) {
      applyTripletMaster(defaultMaster);
    }
    setStep("triplet");
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
      localStorage.removeItem(PENDING_MASTER_KEY);

      localStorage.setItem(LAST_MASTER_KEY, masterId);
      localStorage.setItem(FLOW_STEP_KEY, "chat");
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

          let chatSessionId = session?.offline ? undefined : session?.sessionId;
          if (!session?.offline) {
            const urlParams = new URLSearchParams(window.location.search);
            const refToken = urlParams.get("ref") ?? referrerSlug ?? null;
            const fresh = await spawnSession(refToken);
            chatSessionId = fresh.sessionId;
          }

          deps.setMessages([]);

          try {
            const [spreadResult] = await Promise.all([
              (async () => {
            const response = await postIntentionSpreadRequest({
            characterId: masterId,
            intention,
            spreadId,
            sessionId: chatSessionId,
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

          let readingText = resolveClientReadingText(
            typeof data.reading === "string" ? data.reading : "",
            cards.map((c) => c.name)
          );

          if (intention !== "life_death" && !readingText) {
            const polled = await pollIntentionSpreadReading({
              characterId: masterId,
              intention,
              cardNames: cards.map((c) => c.name),
              spreadId,
              cardCount: cards.length,
            });
            readingText = polled
              ? resolveClientReadingText(polled, cards.map((c) => c.name))
              : "";
          }

          return {
            kind: "ok" as const,
            readingText,
            cards,
            system,
            intentionCardsKey,
          };
              })(),
              waitForSpreadReadingRitual(),
            ]);

            if (spreadResult.kind === "payment") {
            closeSpreadReadingRitual();
            setIntentionSpreadLoading(false);
            setStep("intention");
            setPendingMasterId(masterId);
            localStorage.setItem(PENDING_MASTER_KEY, masterId);
            persistStep("intention");
            deps.setSelectedCharacter(null);
            deps.chatLoadedForRef.current = null;
            return;
          }

          const { readingText, cards, system, intentionCardsKey } = spreadResult;

          if (intention !== "life_death" && !readingText) {
            closeSpreadReadingRitual();
            await loadReadingRef.current(masterId);
          } else if (intention !== "life_death" && readingText) {
            const readingMsg: Message = {
              id: generateId(),
              role: "assistant",
              content: readingText,
              timestamp: new Date(),
            };
            deps.setMessages((prev) => {
              const next = [...prev, readingMsg];
              saveChatCache(masterId, next, intentionCardsKey, {
                cards,
                system,
                variant: "intention",
              });
              return next;
            });
          } else if (intention === "life_death") {
            saveChatCache(masterId, [], intentionCardsKey, {
              cards,
              system,
              variant: "intention",
            });
          }
          void refreshSavedReadings();
        } catch {
          try {
            const cardNames =
              sessionSpreadMetaRef.current?.cardNames ??
              readIntentionSpreadForMaster(masterId)?.cards.map((c) => c.name) ??
              [];
            const recoverySpreadId =
              sessionSpreadMetaRef.current?.spreadId ?? resolveClientSpreadId();
            if (hasCompleteSpread(cardNames, recoverySpreadId, "new")) {
              const polled = await pollIntentionSpreadReading({
                characterId: masterId,
                intention,
                cardNames,
                spreadId: recoverySpreadId,
                cardCount: requiredCardCount(recoverySpreadId, "new"),
              });
              const recovered = polled
                ? resolveClientReadingText(polled, cardNames)
                : "";
              if (recovered) {
                const readingMsg: Message = {
                  id: generateId(),
                  role: "assistant",
                  content: recovered,
                  timestamp: new Date(),
                };
                setReadingRitualCountdownDone(true);
                deps.setMessages((prev) => {
                  const next = [...prev, readingMsg];
                  saveChatCache(masterId, next, spreadKey(cardNames.map((n) => ({ name: n }))), {
                    cards: cardNames.map((name) => ({ name })),
                    system: resolveMasterDeckSystem(masterId),
                    variant: "intention",
                  });
                  return next;
                });
              } else {
                await loadReadingRef.current(masterId);
              }
            } else {
              await loadReadingRef.current(masterId);
            }
          } catch {
            /* loadReading shows its own fallback message */
          }
        } finally {
          closeSpreadReadingRitual();
          setIntentionSpreadLoading(false);
          readingInFlightRef.current = false;
          deps.skipNextReadingRef.current = false;
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
        deps.skipNextReadingRef.current = false;
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
            const urlParams = new URLSearchParams(window.location.search);
            const refToken = urlParams.get("ref") ?? referrerSlug ?? null;
            const fresh = await spawnSession(refToken);
            chatSessionId = fresh.sessionId;
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
      localStorage.removeItem(PENDING_MASTER_KEY);
    }
    newTripletInProgressRef.current = true;
    setNewTripletDraft(true);
    setStep("triplet");
  };

  useEffect(() => {
    if (step !== "onboarding" || !tripletCooldownReady || !tripletCooldown || tripletCooldown.allowed) {
      return;
    }
    if (displayTarotCards.length < 3) return;
    const hint = tripletCooldown.nextAvailableAt
      ? `Новый расклад из 3 карт ${formatTripletCooldownRu(tripletCooldown.nextAvailableAt)}`
      : "Новый расклад из 3 карт доступен один раз в сутки";
    setTripletNotice(hint);
    setStep("masters");
  }, [step, tripletCooldownReady, tripletCooldown, displayTarotCards.length, setStep]);

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
      window.location.href = `/auth/user/register?returnTo=${encodeURIComponent("/")}`;
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
      } = params;
      const spreadCardCount = getSpread(spreadId).cardCount;
      const sessionIntentionValue = spreadType === "daily" ? null : intention;
      if (customQuestion?.trim()) {
        persistSessionCustomQuestion(characterKey, customQuestion.trim());
      } else if (intention !== "custom") {
        persistSessionCustomQuestion(characterKey, null);
      }
      sessionSpreadMetaRef.current = {
        spreadType,
        spreadId,
        cardNames: cards,
        numerologToolId,
        numerologToolParams,
      };
      readingInFlightRef.current = true;
      deps.skipNextReadingRef.current = true;
      deps.chatLoadedForRef.current = null;

      setSessionIntention(sessionIntentionValue);
      persistSessionIntention(characterKey, sessionIntentionValue);
      setIntentionHighlight(Boolean(sessionIntentionValue));
      setPendingMasterId(null);
      pendingChatOptsRef.current = null;
      localStorage.removeItem(PENDING_MASTER_KEY);
      localStorage.setItem(LAST_MASTER_KEY, characterKey);
      localStorage.setItem(FLOW_STEP_KEY, "chat");
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
          let chatSessionId = session?.offline ? undefined : session?.sessionId;
          if (!session?.offline) {
            chatSessionId = await ensureMasterChatSessionId(characterKey);
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
          } else if (characterKey) {
            void deps.resolveConsultationSessionId(characterKey);
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

      setChatSessionSpread(null);
      deps.setSessionListMaster(null);

      const preview = applyPreviewSpread();
      if (!preview) {
        setSpreadFlipped(spreadFlippedState(spreadCardCount, false));
      }

      const numerologTool = numerologToolId ?? DEFAULT_NUMEROLOG_SESSION_TOOL;
      const numerologDrawCount = numerologToolDrawCount(numerologTool);

      if (
        isNumerologMaster(characterKey) &&
        spreadType === "new" &&
        !intention &&
        cards.length >= numerologDrawCount
      ) {
        setIntentionSpread(null);
        persistIntentionSpreadState(characterKey, null);
        const { spreadCards, system } = buildSessionSpreadCards(characterKey, cards, {
          previewCards,
          deckSystem: previewDeckSystem,
        });
        setChatSessionSpread({
          masterId: characterKey,
          cards: spreadCards.slice(0, numerologDrawCount),
          system,
        });
        setHideChatSpread(false);
        setSpreadFlipped(spreadFlippedState(numerologDrawCount, true));

        const activeProfile = getActiveProfile();
        const mergedProfile = activeProfile
          ? {
              ...activeProfile,
              tarotCards: spreadCards,
              deckSystem: system,
              deckSpreads: { ...activeProfile.deckSpreads, [system]: spreadCards },
            }
          : null;
        if (mergedProfile) {
          persistProfile(mergedProfile);
        }

        deps.setSelectedCharacter(characterKey);
        deps.setMessages([]);
        setStep("chat");

        try {
          let chatSessionId = session?.offline ? undefined : session?.sessionId;
          if (!session?.offline) {
            chatSessionId = await ensureMasterChatSessionId(characterKey);
          }
          await bindSessionToMaster(characterKey, chatSessionId);
          await deps.persistSessionMetaToServer(chatSessionId, {
            characterKey,
            intention: null,
            spreadType,
            cards,
          });
          if (chatSessionId) {
            deps.setConsultationSessionId(chatSessionId);
            deps.consultationSessionIdRef.current = chatSessionId;
            deps.setConsultationReadOnly(false);
            deps.archiveSessionIdRef.current = null;
          } else if (characterKey) {
            void deps.resolveConsultationSessionId(characterKey);
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
      deps.setMessages([]);
      setStep("chat");

      let chatSessionId = session?.offline ? undefined : session?.sessionId;

      try {
        if (!session?.offline) {
          chatSessionId = await ensureMasterChatSessionId(characterKey);
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

        const [spreadResult] = await Promise.all([
          (async () => {
            const response = await postIntentionSpreadRequest({
              characterId: characterKey,
              intention,
              spreadId,
              customQuestion: intention === "custom" ? customQuestion?.trim() : undefined,
              cardNames: cards,
              sessionId: chatSessionId,
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
              const polled = await pollIntentionSpreadReading({
                characterId: characterKey,
                intention,
                cardNames: cardNamesForClean,
                spreadId,
                cardCount: spreadCardCount,
              });
              readingText = polled ? resolveClientReadingText(polled, cardNamesForClean) : "";
            }

            return {
              kind: "ok" as const,
              readingText,
              spreadCards,
              system,
              intentionCardsKey,
            };
          })(),
          waitForSpreadReadingRitual(),
        ]);

        if (spreadResult.kind === "payment") {
          closeSpreadReadingRitual();
          setIntentionSpreadLoading(false);
          setStep("masters");
          deps.setSelectedCharacter(null);
          deps.chatLoadedForRef.current = null;
          return;
        }

        const { readingText, spreadCards, system, intentionCardsKey } = spreadResult;

        if (intention !== "life_death" && !readingText) {
          closeSpreadReadingRitual();
          await loadReadingRef.current(characterKey);
        } else if (intention !== "life_death" && readingText) {
          const readingMsg: Message = {
            id: generateId(),
            role: "assistant",
            content: readingText,
            timestamp: new Date(),
          };
          deps.setMessages((prev) => {
            const next = [...prev, readingMsg];
            saveChatCache(characterKey, next, intentionCardsKey, {
              cards: spreadCards,
              system,
              variant: "intention",
            });
            return next;
          });
        } else if (intention === "life_death") {
          saveChatCache(characterKey, [], intentionCardsKey, {
            cards: spreadCards,
            system,
            variant: "intention",
          });
        }
        void refreshSavedReadings();
      } catch {
        try {
          const cardNames =
            sessionSpreadMetaRef.current?.cardNames ??
            (cards.length
              ? cards
              : (readIntentionSpreadForMaster(characterKey)?.cards.map((c) => c.name) ?? []));
          const recoverySpreadId =
            sessionSpreadMetaRef.current?.spreadId ?? spreadId;
          if (hasCompleteSpread(cardNames, recoverySpreadId, "new")) {
            const polled = await pollIntentionSpreadReading({
              characterId: characterKey,
              intention,
              cardNames,
              spreadId: recoverySpreadId,
              cardCount: requiredCardCount(recoverySpreadId, "new"),
            });
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
              setReadingRitualCountdownDone(true);
              const readingMsg: Message = {
                id: generateId(),
                role: "assistant",
                content: recovered,
                timestamp: new Date(),
              };
              deps.setMessages((prev) => {
                const next = [...prev, readingMsg];
                saveChatCache(characterKey, next, intentionCardsKeyRecovered, {
                  cards: spreadCardsRecovered,
                  system: systemRecovered,
                  variant: "intention",
                });
                return next;
              });
            } else {
              await loadReadingRef.current(characterKey);
            }
          } else {
            await loadReadingRef.current(characterKey);
          }
        } catch {
          /* loadReading shows its own fallback message */
        }
      } finally {
        closeSpreadReadingRitual();
        setIntentionSpreadLoading(false);
        deps.chatLoadedForRef.current = characterKey;
        readingInFlightRef.current = false;
        deps.skipNextReadingRef.current = false;
        deps.pendingNewChatThreadRef.current = false;
      }
    },
    [
      bindSessionToMaster,
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

    localStorage.setItem(PENDING_MASTER_KEY, masterId);

    if (!isLoggedIn) {
      window.location.href = `/auth/user/register?returnTo=${encodeURIComponent("/#наставники")}`;
      return;
    }

    const activeProfile = getActiveProfile();
    if (!activeProfile?.birthDate && !profile?.birthDate) {
      setStep("onboarding");
      return;
    }

    const hasSpread =
      displayTarotCards.length >= 3 ||
      (activeProfile?.tarotCards?.length ?? 0) >= 3 ||
      (profile?.tarotCards?.length ?? 0) >= 3;

    if (
      !options?.forceIntention &&
      !options?.continueSession &&
      hasSpread &&
      tripletOwnerMasterId &&
      masterId === tripletOwnerMasterId
    ) {
      localStorage.removeItem(PENDING_MASTER_KEY);
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
      deps.setSessionsListLoading(true);
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
          deps.setSelectedCharacter(null);
          deps.setConsultationSessionId(null);
          deps.setConsultationReadOnly(false);
          deps.archiveSessionIdRef.current = null;
          deps.setSessionListMaster(masterId);
          deps.setSessionsListData({ active, completed });
          setStep("masters");
          localStorage.setItem(FLOW_STEP_KEY, "masters");
          localStorage.removeItem(PENDING_MASTER_KEY);
          return;
        }

        if (sessionsData.active) {
          localStorage.removeItem(PENDING_MASTER_KEY);
          deps.setSessionListMaster(null);
          sessionListBackMasterRef.current = masterId;
          deps.setConsultationReadOnly(false);
          deps.setConsultationSessionId(sessionsData.active.id);
          deps.archiveSessionIdRef.current = null;
          deps.setPhotoChatSpread(null);
          setTripletNotice(null);
          await bindSessionToMaster(masterId);
          deps.skipNextReadingRef.current = sessionsData.active.messageCount > 0;
          deps.chatLoadedForRef.current = null;
          await openChatWithCharacterRef.current(masterId, { intention: null });
          return;
        }
      } finally {
        deps.setSessionsListLoading(false);
      }
    }

    if (hasSpread) {
      const ownerId = tripletOwnerMasterId;
      if (ownerId && masterId !== ownerId) {
        const ownerName =
          findShowcaseMaster(ownerId, masters)?.name ??
          getCharacterById(ownerId)?.name ??
          "мастером расклада";
        setTripletNotice(
          `Карты дня выпали для ${ownerName}. С другими мастерами — только вопросы, без дневного расклада.`
        );
        localStorage.removeItem(PENDING_MASTER_KEY);
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
      const cachedAny = loadChatCacheForMaster(masterId, spreadCardsKeyVal || undefined);
      const existingChat =
        cachedSpreadChat && cachedSpreadChat.length > 0
          ? cachedSpreadChat
          : cachedAny && cachedAny.length > 0
            ? cachedAny
            : null;

      if (!options?.forceIntention && options?.continueSession && existingChat && deps) {
        localStorage.removeItem(PENDING_MASTER_KEY);
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

      localStorage.removeItem(PENDING_MASTER_KEY);
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

    localStorage.removeItem(PENDING_MASTER_KEY);
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
    if (authLoading || !isLoggedIn) return;
    if (step !== "masters" || selectedCharacter || pendingMasterId) return;

    const pendingMaster = localStorage.getItem(PENDING_MASTER_KEY);
    if (!pendingMaster) return;

    const activeProfile = getActiveProfile();
    if ((activeProfile?.tarotCards?.length ?? 0) < 3 && displayTarotCards.length < 3) return;

    void bindSessionToMaster(pendingMaster).then(() => {
      void handleMasterPick(pendingMaster);
    });
  }, [
    authLoading,
    isLoggedIn,
    step,
    selectedCharacter,
    pendingMasterId,
    getActiveProfile,
    displayTarotCards.length,
    bindSessionToMaster,
  ]);

  useEffect(() => {
    if (authLoading || sessionLoading || !isLoggedIn || autoResumeDoneRef.current) return;

    const params = new URLSearchParams(window.location.search);
    const continueMaster = params.get("master") ?? params.get("continue");
    if (!continueMaster) return;

    const resumeChat = params.get("resume") === "chat";
    if (!resumeChat && selectedCharacter) return;

    autoResumeDoneRef.current = true;
    window.history.replaceState(null, "", window.location.pathname);

    const activeProfile = getActiveProfile();
    const hasSpread =
      (activeProfile?.tarotCards?.length ?? 0) >= 3 ||
      (profile?.tarotCards?.length ?? 0) >= 3 ||
      displayTarotCards.length >= 3;

    if (!resumeChat && !hasSpread) {
      localStorage.setItem(PENDING_MASTER_KEY, continueMaster);
      applyTripletMaster(continueMaster);
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
      pendingChatOptsRef.current = { masterId: continueMaster, skipReading: true };
      if (sessionIdParam && deps) {
        deps.setConsultationSessionId(sessionIdParam);
        deps.consultationSessionIdRef.current = sessionIdParam;
      }
      await bindSessionToMasterRef.current(
        continueMaster,
        sessionIdParam ?? undefined
      );
      await beginChatAfterIntention(continueMaster, null, "existing");
    })();
  }, [
    authLoading,
    sessionLoading,
    isLoggedIn,
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

    void (async () => {
      const deps = chat();
      try {
        const res = await fetch("/api/runes/balance");
        if (!res.ok) return;
        const data = await res.json();
        onRuneBalancePayload?.(data);

        if (pending.required > 0 && (data.balance ?? 0) < pending.required) return;

        pendingReadingResumeRef.current = resumeKey;
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
      if (deps) {
        deps.skipNextReadingRef.current = item.messageCount > 0;
        deps.chatLoadedForRef.current = null;
      }
      await openChatWithCharacterRef.current(masterId, { intention: null });
    },
    [bindSessionToMaster, openChatWithCharacterRef, chatDepsRef]
  );

  const handleSessionListBack = useCallback(() => {
    const deps = chat();
    sessionListBackMasterRef.current = null;
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
    handleSelectCharacter,
    handleMasterPick,
    handleContinueListedSession,
    handleSessionListBack,
    syncProfileFromServer,
    handleSpreadReadingRitualComplete,
    resetSpreadOnAccountSwitch,
  };
}
